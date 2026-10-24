import { engine } from "@/audio/engine.ts";

export type InputSource = "midi" | "keyboard" | "pointer" | "mic" | "playback";

export type NoteEvent =
  | { type: "noteon"; note: number; velocity: number; time: number; source: InputSource }
  | { type: "noteoff"; note: number; time: number; source: InputSource }
  | { type: "pedal"; value: number; time: number; source: InputSource }
  | { type: "soft"; value: number; time: number; source: InputSource };

type Listener = (e: NoteEvent) => void;

/**
 * The single stream of performance events. Order on every event:
 * 1. sound (worklet postMessage), 2. held-note state, 3. subscribers.
 */
class InputBus {
  /** Per-note hold count across sources (mouse and MIDI can hold the same key). */
  private readonly holds = new Map<number, number>();
  private readonly velocities = new Map<number, number>();
  private readonly sources = new Map<number, InputSource>();
  private readonly listeners = new Set<Listener>();
  private readonly viewListeners = new Set<() => void>();
  private frameRequested = false;
  pedal = 0;
  softPedal = false;
  /** Set false when the keyboard has its own speakers or for microphone input. */
  monitor = true;
  version = 0;

  emit(e: NoteEvent): void {
    switch (e.type) {
      case "noteon": {
        const velocity = this.softPedal ? Math.max(1, Math.round(e.velocity * 0.72)) : e.velocity;
        if (this.monitor && e.source !== "mic" && e.source !== "playback")
          engine.playInput(e.note, velocity, e.time, e.source);
        this.holds.set(e.note, (this.holds.get(e.note) ?? 0) + 1);
        this.velocities.set(e.note, velocity);
        this.sources.set(e.note, e.source);
        e = { ...e, velocity };
        break;
      }
      case "noteoff": {
        const count = this.holds.get(e.note) ?? 0;
        if (count === 0) return;
        if (count === 1) {
          this.holds.delete(e.note);
          if (this.monitor && e.source !== "mic" && e.source !== "playback") engine.sampler?.noteOff(e.note);
        } else this.holds.set(e.note, count - 1);
        break;
      }
      case "pedal":
        if (this.monitor && e.source !== "mic" && e.source !== "playback") engine.sampler?.pedal(e.value);
        this.pedal = e.value;
        break;
      case "soft":
        this.softPedal = e.value >= 64;
        break;
    }
    for (const l of this.listeners) l(e);
    this.scheduleView();
  }

  isHeld(note: number): boolean {
    return (this.holds.get(note) ?? 0) > 0;
  }

  heldNotes(): number[] {
    return [...this.holds.keys()].sort((a, b) => a - b);
  }

  velocityOf(note: number): number {
    return this.velocities.get(note) ?? 0;
  }

  sourceOf(note: number): InputSource | undefined {
    return this.sources.get(note);
  }

  get pedalDown(): boolean {
    return this.pedal >= 64;
  }

  /** Releases every held note from every source, and the pedal. */
  releaseAll(time = performance.now()): void {
    for (const note of [...this.holds.keys()]) {
      this.holds.set(note, 1);
      this.emit({ type: "noteoff", note, time, source: this.sources.get(note) ?? "pointer" });
    }
    if (this.pedal) this.emit({ type: "pedal", value: 0, time, source: "pointer" });
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** For rendering: called at most once per animation frame. */
  subscribeView(l: () => void): () => void {
    this.viewListeners.add(l);
    return () => this.viewListeners.delete(l);
  }

  private scheduleView(): void {
    this.version++;
    if (this.frameRequested) return;
    this.frameRequested = true;
    const flush = () => {
      this.frameRequested = false;
      for (const l of this.viewListeners) l();
    };
    if (typeof requestAnimationFrame === "function" && !document.hidden) requestAnimationFrame(flush);
    else setTimeout(flush, 16);
  }
}

export const inputBus = new InputBus();
