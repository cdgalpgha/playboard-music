import { createStore, type StoreApi } from "zustand";
import { engine } from "@/audio/engine.ts";
import { scheduleClick } from "@/audio/metronome.ts";
import { firstNoteAtOrAfter, measureAtTime, type Chart, type ChartNote, type Hand } from "@/core/chart.ts";
import { onsetGroups, WaitGate } from "@/core/practice.ts";
import { emptyCounts, ScoringEngine, type Judgement, type SessionSummary } from "@/core/scoring.ts";
import { Transport, type Segment, type TransportLike } from "@/core/transport.ts";
import { inputBus, type NoteEvent } from "@/input/input-bus.ts";
import { offsetStore } from "@/storage/devices.ts";
import { inputStore } from "@/state/input-store.ts";
import { micScoringLagSec } from "@/input/mic/mic-input.ts";
import { db } from "@/storage/db.ts";

/** How far ahead auto-played notes and clicks are scheduled, in real seconds. */
const LOOKAHEAD_SEC = 0.15;
const TICK_MS = 25;

export type SessionStatus = "ready" | "countin" | "playing" | "paused" | "finished";

export interface LiveStats {
  counts: Record<Judgement, number>;
  wrong: number;
  combo: number;
  bestCombo: number;
  judged: number;
}

export interface Feedback {
  pitch: number;
  judgement: Judgement | "wrong";
  deltaMs?: number;
  noteId?: number;
  at: number;
}

export interface SessionState {
  status: SessionStatus;
  rate: number;
  hands: Hand[];
  wait: boolean;
  autoplayOther: boolean;
  listen: boolean;
  metronome: boolean;
  loop: { from: number; to: number } | null;
  pass: number;
  measure: number;
  live: LiveStats;
  waitProgress: { done: number; total: number } | null;
  passes: SessionSummary[];
  summary: SessionSummary | null;
  /** Renderer stats over the last second; p95DrawMs is the canvas draw cost alone. */
  fps: { mean: number; p95FrameMs: number; p95DrawMs: number; dropped: number; frames: number } | null;
}

const VIDEO_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
export function nearestVideoRate(rate: number): number {
  return VIDEO_RATES.reduce((a, b) => (Math.abs(b - rate) < Math.abs(a - rate) ? b : a), 1);
}

function emptyLive(): LiveStats {
  return { counts: emptyCounts(), wrong: 0, combo: 0, bestCombo: 0, judged: 0 };
}

export class PracticeSession {
  readonly transport: TransportLike;
  readonly store: StoreApi<SessionState>;
  /** Recent judgements for the renderer's hit flashes. */
  readonly feedback: Feedback[] = [];
  private scoring: ScoringEngine | null = null;
  private gate: WaitGate | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private scheduledTau = 0;
  private pendingOffs: { tau: number; pitch: number }[] = [];
  private visualTimers = new Set<ReturnType<typeof setTimeout>>();
  private countInTaus: { tau: number; downbeat: boolean }[] = [];
  private runFrom = 0;
  private startedAt = 0;
  private unsubscribe: (() => void) | null = null;
  private savedFinal = false;
  private lastGeneration = 0;
  private lastTransportPlaying = false;
  readonly chart: Chart;
  readonly meta: { kind: "lesson" | "song" | "practice"; skills: string[] };

  constructor(
    chart: Chart,
    meta: { kind: "lesson" | "song" | "practice"; skills: string[] } = { kind: "practice", skills: [] },
    transport: TransportLike = new Transport(),
  ) {
    this.chart = chart;
    this.meta = meta;
    this.transport = transport;
    this.store = createStore<SessionState>(() => ({
      status: "ready",
      rate: 1,
      hands: ["L", "R"],
      wait: false,
      autoplayOther: true,
      listen: false,
      metronome: false,
      loop: null,
      pass: 0,
      measure: 0,
      live: emptyLive(),
      waitProgress: null,
      passes: [],
      summary: null,
      fps: null,
    }));
  }

  /** Starts listening to input and the clock. Pair with `detach()`; safe to repeat (React StrictMode). */
  attach(): void {
    this.unsubscribe ??= inputBus.subscribe((e) => this.onInput(e));
    this.timer ??= setInterval(() => this.tick(), TICK_MS);
  }

  /** True when an embedded video drives time. */
  get videoMode(): boolean {
    return this.transport.kind === "video";
  }

  get state(): SessionState {
    return this.store.getState();
  }

  activeHands(): Set<Hand> {
    return new Set(this.state.listen ? [] : this.state.hands);
  }

  isAuto(note: ChartNote): boolean {
    const s = this.state;
    return s.listen || (s.autoplayOther && !s.hands.includes(note.hand));
  }

  resultFor(noteId: number): Judgement | undefined {
    return this.scoring?.resultFor(noteId)?.judgement;
  }

  /** The onset group the player must play next in wait-for-me mode. */
  waitingGroup(): { time: number; pitches: number[] } | null {
    return this.state.wait ? this.gate?.current() ?? null : null;
  }

  // ---- transport controls -------------------------------------------------

  play(): void {
    const s = this.state;
    if (s.status === "playing" || s.status === "countin") return;
    if (!engine.running) void engine.start();
    let from = this.transport.position();
    if (s.status === "finished" || from >= this.chart.duration) from = s.loop?.from ?? 0;
    this.runFrom = from;
    this.startedAt = Date.now();
    this.savedFinal = false;
    this.resetScoring(from);
    // One bar of count-in clicks in timed mode. With a video, the video itself counts in.
    this.countInTaus = [];
    let startTau = from;
    if (!s.wait && !s.listen && !this.videoMode) {
      const m = this.chart.measures[measureAtTime(this.chart, from)];
      const beats = m ? m.beats : 4;
      const beatSec = m ? (m.end - m.start) / beats : 0.5;
      startTau = from - beats * beatSec;
      for (let b = 0; b < beats; b++) this.countInTaus.push({ tau: startTau + b * beatSec, downbeat: b === 0 });
    }
    if (!this.videoMode || Math.abs(this.transport.position() - startTau) > 0.05) this.transport.seek(startTau);
    this.scheduledTau = startTau;
    this.transport.play();
    this.lastGeneration = this.transport.generation;
    this.lastTransportPlaying = true;
    this.store.setState({ status: this.countInTaus.length ? "countin" : "playing", summary: null });
    this.attach();
    this.tick();
  }

  pause(): void {
    if (this.state.status !== "playing" && this.state.status !== "countin") return;
    this.transport.pause();
    this.stopScheduled();
    this.store.setState({ status: "paused" });
  }

  toggle(): void {
    const st = this.state.status;
    if (st === "playing" || st === "countin") this.pause();
    else this.play();
  }

  /** Back to the start of the loop (or piece), ready to play. */
  restart(): void {
    this.transport.pause();
    this.stopScheduled();
    this.transport.seek(this.state.loop?.from ?? 0);
    this.store.setState({ status: "ready", live: emptyLive(), summary: null, passes: [], pass: 0 });
  }

  seekMeasure(index: number): void {
    const m = this.chart.measures[Math.max(0, Math.min(this.chart.measures.length - 1, index))];
    if (!m) return;
    const wasPlaying = this.state.status === "playing" || this.state.status === "countin";
    this.transport.pause();
    this.stopScheduled();
    this.transport.seek(m.start);
    this.store.setState({ status: "ready", measure: m.index });
    if (wasPlaying) this.play();
  }

  /** Applies a setting; while playing, scoring restarts from the current position. */
  update(patch: Partial<Pick<SessionState, "rate" | "hands" | "wait" | "autoplayOther" | "listen" | "metronome">>): void {
    if (patch.rate !== undefined) {
      this.transport.setRate(patch.rate);
      // A video offers fixed rates; show the one actually used.
      if (this.videoMode) patch = { ...patch, rate: nearestVideoRate(patch.rate) };
    }
    this.store.setState(patch);
    const st = this.state.status;
    if (st === "playing" || st === "countin") {
      this.stopScheduled();
      this.scheduledTau = this.transport.tauAt();
      this.resetScoring(this.transport.position());
    }
  }

  setLoop(fromMeasure: number | null, toMeasure?: number): void {
    const ms = this.chart.measures;
    if (fromMeasure === null) {
      this.transport.setLoop(null);
      this.store.setState({ loop: null });
      return;
    }
    const a = ms[Math.max(0, fromMeasure)]!;
    const b = ms[Math.min(ms.length - 1, toMeasure ?? fromMeasure)]!;
    const loop = { from: a.start, to: b.end };
    const wasPlaying = this.state.status === "playing" || this.state.status === "countin";
    this.transport.pause();
    this.stopScheduled();
    this.transport.setLoop(loop);
    this.store.setState({ loop, status: "ready", passes: [], pass: 0 });
    if (wasPlaying) this.play();
  }

  /** Stops playback, scheduling and input listening. `attach()` brings input back. */
  detach(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.state.status === "playing" || this.state.status === "countin") {
      this.transport.pause();
      this.store.setState({ status: "paused" });
    }
    this.stopScheduled();
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  reportFps(fps: SessionState["fps"]): void {
    this.store.setState({ fps });
  }

  // ---- scoring ------------------------------------------------------------

  private resetScoring(from: number): void {
    const s = this.state;
    const to = s.loop?.to ?? Infinity;
    const hands = this.activeHands();
    this.scoring = s.listen ? null : new ScoringEngine(this.chart, { rate: s.rate, hands, from, to });
    if (s.wait && !s.listen) {
      this.gate = new WaitGate(onsetGroups(this.chart.notes, hands, from, to));
      this.store.setState({ waitProgress: this.gate.progress });
    } else {
      this.gate = null;
      this.store.setState({ waitProgress: null });
    }
    this.store.setState({ live: emptyLive() });
  }

  private onInput(e: NoteEvent): void {
    if (e.type !== "noteon" || e.source === "playback") return;
    const st = this.state.status;
    if (st !== "playing" && st !== "countin") return;
    const t = e.time - offsetStore.getState().inputOffsetMs;
    const { chart } = this.transport.chartOf(this.transport.tauAt(t));
    if (this.gate) {
      const r = this.gate.noteOn(e.note);
      if (r === "wrong") this.pushFeedback({ pitch: e.note, judgement: "wrong", at: e.time });
      else if (r === "correct") this.pushFeedback({ pitch: e.note, judgement: "perfect", at: e.time });
      this.checkGate();
      return;
    }
    if (!this.scoring) return;
    const r = this.scoring.noteOn(e.note, chart, e.velocity);
    const live = { ...this.state.live, counts: { ...this.state.live.counts } };
    if (r.kind === "hit") {
      live.counts[r.judgement]++;
      live.judged++;
      live.combo = r.judgement === "early" || r.judgement === "late" ? 0 : live.combo + 1;
      live.bestCombo = Math.max(live.bestCombo, live.combo);
      this.pushFeedback({ pitch: e.note, judgement: r.judgement, deltaMs: r.deltaMs, noteId: r.note.id, at: e.time });
    } else if (r.kind === "wrong") {
      live.wrong++;
      live.combo = 0;
      this.pushFeedback({ pitch: e.note, judgement: "wrong", at: e.time });
    } else return;
    this.store.setState({ live });
  }

  private pushFeedback(f: Feedback): void {
    this.feedback.push(f);
    if (this.feedback.length > 64) this.feedback.shift();
  }

  /** Wait-for-me: hold the transport at the next group until it is played. */
  private checkGate(): void {
    const gate = this.gate;
    if (!gate) return;
    while (gate.current() && gate.satisfied()) {
      gate.next();
      this.transport.release();
    }
    const g = gate.current();
    const { pass } = this.transport.chartOf(this.transport.tauAt());
    if (g) this.transport.hold(this.transport.tauOfChart(g.time, pass));
    else this.transport.release();
    this.store.setState({ waitProgress: gate.progress });
  }

  // ---- scheduling ---------------------------------------------------------

  /** Follows play, pause and seeks made with the video's own controls. */
  private followVideo(): void {
    const playing = this.transport.playing;
    const st = this.state.status;
    if (playing && !this.lastTransportPlaying && st !== "playing" && st !== "countin") {
      this.lastTransportPlaying = true;
      this.play();
      return;
    }
    if (!playing && this.lastTransportPlaying && !this.transport.holding) {
      this.lastTransportPlaying = false;
      if (st === "playing") {
        this.stopScheduled();
        this.store.setState({ status: "paused" });
      }
    }
    if (playing) this.lastTransportPlaying = true;
    const gen = this.transport.generation;
    if (gen !== this.lastGeneration) {
      this.lastGeneration = gen;
      if (this.state.status === "playing") {
        this.stopScheduled();
        this.scheduledTau = this.transport.tauAt();
        const { pass } = this.transport.chartOf(this.scheduledTau);
        if (pass === this.state.pass) this.resetScoring(this.transport.position());
        this.gate?.seek(this.transport.position());
      }
    }
  }

  private tick(): void {
    if (this.videoMode) this.followVideo();
    const s = this.state;
    if (s.status !== "playing" && s.status !== "countin") return;
    const tau = this.transport.tauAt();
    const { chart, pass } = this.transport.chartOf(tau);
    if (s.status === "countin" && chart >= this.runFrom) this.store.setState({ status: "playing" });

    if (pass !== s.pass) this.finishPass(pass);
    if (this.gate) this.checkGate();

    let horizon = tau + LOOKAHEAD_SEC * this.transport.rate;
    const hold = this.transport.holdPoint;
    if (hold !== null) horizon = Math.min(horizon, hold);
    if (horizon > this.scheduledTau) {
      for (const seg of this.transport.segments(this.scheduledTau, horizon)) this.scheduleSegment(seg);
      this.scheduledTau = horizon;
    }
    this.flushOffs(horizon);

    if (this.scoring) {
      // Microphone notes arrive about half a second after they sound; wait for them before calling a miss.
      const lag = inputStore.getState().mode === "mic" ? micScoringLagSec() * this.transport.rate : 0;
      const missed = this.scoring.advance(chart - lag);
      if (missed.length) {
        const live = { ...this.state.live, counts: { ...this.state.live.counts } };
        live.counts.miss += missed.length;
        live.judged += missed.length;
        live.combo = 0;
        for (const m of missed) this.pushFeedback({ pitch: m.note.pitch, judgement: "miss", noteId: m.note.id, at: performance.now() });
        this.store.setState({ live });
      }
    }
    const measure = measureAtTime(this.chart, chart);
    if (measure !== s.measure) this.store.setState({ measure });
    if (!s.loop && chart > this.chart.duration + 0.4) this.finish();
  }

  private scheduleSegment(seg: Segment): void {
    const sampler = engine.sampler;
    const audioOffset = offsetStore.getState().audioOffsetMs;
    const s = this.state;
    const whenFor = (tau: number) => engine.contextTimeFor(this.transport.perfAt(tau) - audioOffset);

    for (const c of this.countInTaus)
      if (c.tau >= seg.chartFrom + seg.tauOffset && c.tau < seg.chartTo + seg.tauOffset) scheduleClick(whenFor(c.tau), c.downbeat);

    if (s.metronome)
      for (const b of this.chart.beats)
        if (b.time >= seg.chartFrom && b.time < seg.chartTo && b.time >= this.runFrom - 1e-6)
          scheduleClick(whenFor(b.time + seg.tauOffset), b.downbeat);

    const notes = this.chart.notes;
    for (let i = firstNoteAtOrAfter(notes, seg.chartFrom); i < notes.length; i++) {
      const n = notes[i]!;
      if (n.start >= seg.chartTo) break;
      if (seg.pass === 0 && n.start < this.runFrom - 1e-6) continue;
      if (!this.isAuto(n)) continue;
      const tauOn = n.start + seg.tauOffset;
      sampler?.noteOn(n.pitch, n.velocity, whenFor(tauOn));
      this.pendingOffs.push({ tau: n.end + seg.tauOffset, pitch: n.pitch });
      this.visual(this.transport.perfAt(tauOn), () =>
        inputBus.emit({ type: "noteon", note: n.pitch, velocity: n.velocity, time: performance.now(), source: "playback" }),
      );
    }
  }

  private flushOffs(horizon: number): void {
    if (!this.pendingOffs.length) return;
    const audioOffset = offsetStore.getState().audioOffsetMs;
    const due = this.pendingOffs.filter((o) => o.tau <= horizon);
    if (!due.length) return;
    this.pendingOffs = this.pendingOffs.filter((o) => o.tau > horizon);
    for (const o of due) {
      const perf = this.transport.perfAt(o.tau);
      // End slightly early so a repeated note gets a clean re-strike.
      engine.sampler?.noteOff(o.pitch, engine.contextTimeFor(perf - audioOffset) - 0.012);
      this.visual(perf - 12, () => inputBus.emit({ type: "noteoff", note: o.pitch, time: performance.now(), source: "playback" }));
    }
  }

  private visual(perf: number, fn: () => void): void {
    const id = setTimeout(() => {
      this.visualTimers.delete(id);
      fn();
    }, Math.max(0, perf - performance.now()));
    this.visualTimers.add(id);
  }

  private stopScheduled(): void {
    engine.sampler?.cancelScheduled();
    for (const o of this.pendingOffs) engine.sampler?.noteOff(o.pitch);
    this.pendingOffs = [];
    for (const id of this.visualTimers) clearTimeout(id);
    this.visualTimers.clear();
    for (const note of inputBus.heldNotes())
      if (inputBus.sourceOf(note) === "playback")
        inputBus.emit({ type: "noteoff", note, time: performance.now(), source: "playback" });
  }

  // ---- results ------------------------------------------------------------

  private summarize(): SessionSummary | null {
    if (this.gate) {
      const g = this.gate;
      const total = g.groups.reduce((n, x) => n + x.pitches.length, 0);
      const counts = emptyCounts();
      counts.perfect = g.correct;
      counts.miss = Math.max(0, total - g.correct);
      return {
        mode: "wait",
        total,
        counts,
        wrong: g.wrong,
        accuracy: g.correct + g.wrong ? (g.correct / (g.correct + g.wrong)) * 100 : 0,
        timing: { meanMs: 0, sdMs: 0, binMs: 10, fromMs: -180, histogram: [] },
        velocityConsistency: null,
        hands: {},
        weakSpots: [],
      };
    }
    return this.scoring?.summary(true) ?? null;
  }

  private finishPass(pass: number): void {
    const summary = this.summarize();
    const passes = summary && summary.total ? [...this.state.passes, summary].slice(-20) : this.state.passes;
    this.store.setState({ pass, passes });
    this.resetScoring(this.state.loop?.from ?? 0);
  }

  private finish(): void {
    // A video keeps playing its outro; only the internal clock stops.
    if (!this.videoMode) this.transport.pause();
    this.stopScheduled();
    const summary = this.summarize();
    this.store.setState({ status: "finished", summary });
    if (summary && !this.savedFinal && summary.total > 0) {
      this.savedFinal = true;
      void this.save(summary);
    }
  }

  private async save(summary: SessionSummary): Promise<void> {
    try {
      await (await db()).add("sessions", {
        songId: this.chart.id,
        kind: this.meta.kind,
        startedAt: this.startedAt,
        durationSec: (Date.now() - this.startedAt) / 1000,
        accuracy: summary.accuracy,
        judgements: { ...summary.counts, wrong: summary.wrong },
        skills: this.meta.skills,
        updatedAt: Date.now(),
      });
    } catch {
      /* storage blocked: results stay on screen */
    }
  }
}
