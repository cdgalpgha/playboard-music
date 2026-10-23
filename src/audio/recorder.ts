import { inputBus, type NoteEvent } from "@/input/input-bus.ts";
import { engine } from "./engine.ts";
import { wavFromChunks } from "./wav.ts";
import { writeMidiFile, type WriterEvent } from "@/formats/midi-writer.ts";

export type TakeEvent =
  | { t: number; type: "on"; note: number; velocity: number }
  | { t: number; type: "off"; note: number }
  | { t: number; type: "pedal"; value: number };

export interface Take {
  events: TakeEvent[];
  duration: number;
  sampleRate: number;
  left: Int16Array[];
  right: Int16Array[];
}

export const MAX_TAKE_SECONDS = 600;

/** Records performance events (for replay) and the piano output (for WAV export). */
export class Recorder {
  private events: TakeEvent[] = [];
  private startPerf = 0;
  private unsubscribe: (() => void) | null = null;
  private tap: AudioWorkletNode | null = null;
  private sink: GainNode | null = null;
  private left: Int16Array[] = [];
  private right: Int16Array[] = [];
  private replayTimers: ReturnType<typeof setTimeout>[] = [];

  get recording(): boolean {
    return this.unsubscribe !== null;
  }

  elapsed(): number {
    return this.recording ? (performance.now() - this.startPerf) / 1000 : 0;
  }

  start(): void {
    const ctx = engine.ctx;
    if (!ctx || !engine.pianoBus || this.recording) return;
    this.events = [];
    this.left = [];
    this.right = [];
    this.startPerf = performance.now();
    if (inputBus.pedalDown) this.events.push({ t: 0, type: "pedal", value: inputBus.pedal });
    this.unsubscribe = inputBus.subscribe((e) => this.capture(e));
    this.tap = new AudioWorkletNode(ctx, "playboard-tap", { numberOfInputs: 1, numberOfOutputs: 1 });
    // The tap must be pulled by the graph, so it feeds a silent gain into the destination.
    this.sink = ctx.createGain();
    this.sink.gain.value = 0;
    engine.pianoBus.connect(this.tap);
    this.tap.connect(this.sink).connect(ctx.destination);
    this.tap.port.onmessage = (e: MessageEvent<{ type: string; left?: Int16Array; right?: Int16Array }>) => {
      if (e.data.type === "chunk" && e.data.left && e.data.right) {
        this.left.push(e.data.left);
        this.right.push(e.data.right);
      }
    };
    this.tap.port.postMessage({ type: "start" });
  }

  private capture(e: NoteEvent): void {
    if (e.source === "playback") return;
    const t = Math.max(0, (e.time - this.startPerf) / 1000);
    if (t > MAX_TAKE_SECONDS) return;
    if (e.type === "noteon") this.events.push({ t, type: "on", note: e.note, velocity: e.velocity });
    else if (e.type === "noteoff") this.events.push({ t, type: "off", note: e.note });
    else if (e.type === "pedal") this.events.push({ t, type: "pedal", value: e.value });
  }

  async stop(): Promise<Take | null> {
    if (!this.recording) return null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    const duration = (performance.now() - this.startPerf) / 1000;
    const tap = this.tap!;
    await new Promise<void>((resolve) => {
      const previous = tap.port.onmessage;
      tap.port.onmessage = (e: MessageEvent<{ type: string }>) => {
        previous?.call(tap.port, e);
        if (e.data.type === "done") resolve();
      };
      tap.port.postMessage({ type: "stop" });
      setTimeout(resolve, 500);
    });
    tap.disconnect();
    engine.pianoBus?.disconnect(tap);
    this.sink?.disconnect();
    this.tap = null;
    // Close any notes still held so replay does not hang.
    const open = new Set<number>();
    for (const e of this.events) {
      if (e.type === "on") open.add(e.note);
      else if (e.type === "off") open.delete(e.note);
    }
    for (const note of open) this.events.push({ t: duration, type: "off", note });
    return {
      events: [...this.events].sort((a, b) => a.t - b.t),
      duration,
      sampleRate: engine.ctx?.sampleRate ?? 48000,
      left: this.left,
      right: this.right,
    };
  }

  /** Plays a take through the sampler, sample-accurately, and lights the keys. */
  replay(take: Take, onDone?: () => void): void {
    const sampler = engine.sampler;
    if (!sampler) return;
    this.stopReplay();
    const startPerf = performance.now() + 150;
    const startCtx = engine.contextTimeFor(startPerf);
    for (const e of take.events) {
      const when = startCtx + e.t;
      if (e.type === "on") sampler.noteOn(e.note, e.velocity, when);
      else if (e.type === "off") sampler.noteOff(e.note, when);
      else sampler.pedal(e.value, when);
      const delay = startPerf + e.t * 1000 - performance.now();
      this.replayTimers.push(
        setTimeout(() => {
          const time = performance.now();
          if (e.type === "on")
            inputBus.emit({ type: "noteon", note: e.note, velocity: e.velocity, time, source: "playback" });
          else if (e.type === "off") inputBus.emit({ type: "noteoff", note: e.note, time, source: "playback" });
          else inputBus.emit({ type: "pedal", value: e.value, time, source: "playback" });
        }, delay),
      );
    }
    this.replayTimers.push(setTimeout(() => onDone?.(), startPerf + take.duration * 1000 - performance.now()));
  }

  stopReplay(): void {
    if (!this.replayTimers.length) return;
    this.replayTimers.forEach(clearTimeout);
    this.replayTimers = [];
    engine.sampler?.allOff();
    inputBus.releaseAll();
  }

  static wav(take: Take): Blob {
    return wavFromChunks(take.left, take.right, take.sampleRate);
  }

  /** The take as a Standard MIDI File at 120 BPM (960 ticks per second). */
  static midi(take: Take): Blob {
    const tick = (t: number) => Math.round(t * 960);
    const events: WriterEvent[] = [
      { tick: 0, type: "name", text: "Playboard take" },
      { tick: 0, type: "tempo", bpm: 120 },
    ];
    for (const e of take.events) {
      if (e.type === "on") events.push({ tick: tick(e.t), type: "on", pitch: e.note, velocity: e.velocity });
      else if (e.type === "off") events.push({ tick: tick(e.t), type: "off", pitch: e.note });
      else events.push({ tick: tick(e.t), type: "cc", controller: 64, value: e.value });
    }
    return new Blob([writeMidiFile([events], 480) as BlobPart], { type: "audio/midi" });
  }
}

export const recorder = new Recorder();
