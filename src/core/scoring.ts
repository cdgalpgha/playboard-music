import type { Chart, ChartNote, Hand } from "./chart.ts";

export type Judgement = "perfect" | "good" | "early" | "late" | "miss";

/** Half-widths in real-time milliseconds at full tempo. */
export interface Windows {
  perfect: number;
  good: number;
  ok: number;
}

export const DEFAULT_WINDOWS: Windows = { perfect: 40, good: 90, ok: 180 };

export const JUDGEMENT_WEIGHT: Record<Judgement, number> = { perfect: 1, good: 0.85, early: 0.5, late: 0.5, miss: 0 };
/** Each wrong note costs a quarter of a correct one. */
export const WRONG_NOTE_PENALTY = 0.25;

export interface ScoringOptions {
  /** Practice tempo factor: 0.5 means half speed. */
  rate: number;
  hands: ReadonlySet<Hand>;
  /** Chart-time range being practised. */
  from?: number;
  to?: number;
  windows?: Windows;
}

export type NoteOnResult =
  | { kind: "hit"; note: ChartNote; judgement: Exclude<Judgement, "miss">; deltaMs: number }
  | { kind: "wrong"; pitch: number; time: number; measure: number }
  | { kind: "ignored" };

export interface NoteResult {
  note: ChartNote;
  judgement: Judgement;
  /** Played minus expected, real-time ms. Undefined for misses. */
  deltaMs?: number;
  velocity?: number;
}

export interface WeakSpot {
  measure: number;
  label: string;
  errors: number;
  notes: number;
}

export interface SessionSummary {
  mode: "timed" | "wait";
  total: number;
  counts: Record<Judgement, number>;
  wrong: number;
  /** 0..100, weighted by judgement, minus wrong-note penalties. */
  accuracy: number;
  timing: { meanMs: number; sdMs: number; binMs: number; fromMs: number; histogram: number[] };
  /** 1 means identical velocities within each dynamic level; null when too few notes. */
  velocityConsistency: number | null;
  hands: Partial<Record<Hand, number>>;
  weakSpots: WeakSpot[];
}

export function emptyCounts(): Record<Judgement, number> {
  return { perfect: 0, good: 0, early: 0, late: 0, miss: 0 };
}

export function windowScale(rate: number): number {
  return Math.min(1.5, Math.max(1, 1 / rate));
}

export function judge(deltaMs: number, windows: Windows, scale: number): Exclude<Judgement, "miss"> | null {
  const a = Math.abs(deltaMs);
  if (a <= windows.perfect * scale) return "perfect";
  if (a <= windows.good * scale) return "good";
  if (a <= windows.ok * scale) return deltaMs < 0 ? "early" : "late";
  return null;
}

export class ScoringEngine {
  readonly windows: Windows;
  readonly scale: number;
  private readonly notes: ChartNote[];
  private readonly eligible: Uint8Array;
  private readonly results = new Map<number, NoteResult>();
  private readonly wrongs: { pitch: number; time: number; measure: number }[] = [];
  private missCursor = 0;
  private readonly chartWindow: number;
  private readonly measureLabels: string[];

  private readonly opts: ScoringOptions;

  constructor(chart: Chart, opts: ScoringOptions) {
    this.opts = opts;
    this.windows = opts.windows ?? DEFAULT_WINDOWS;
    this.scale = windowScale(opts.rate);
    this.notes = chart.notes;
    this.measureLabels = chart.measures.map((m) => m.label);
    const from = opts.from ?? -Infinity,
      to = opts.to ?? Infinity;
    this.eligible = new Uint8Array(chart.notes.length);
    for (const n of chart.notes)
      if (opts.hands.has(n.hand) && n.start >= from - 1e-6 && n.start < to - 1e-6) this.eligible[n.id] = 1;
    // The ok window expressed in chart seconds.
    this.chartWindow = (this.windows.ok * this.scale * opts.rate) / 1000;
  }

  get total(): number {
    let n = 0;
    for (const e of this.eligible) n += e;
    return n;
  }

  /** Scores a played note-on at chart time `t`. */
  noteOn(pitch: number, t: number, velocity: number): NoteOnResult {
    const from = this.opts.from ?? -Infinity,
      to = this.opts.to ?? Infinity;
    if (t < from - this.chartWindow || t > to + this.chartWindow) return { kind: "ignored" };
    let best: ChartNote | null = null;
    let bestDelta = Infinity;
    // Notes are sorted by start: scan the window around t.
    let lo = 0,
      hi = this.notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.notes[mid]!.start < t - this.chartWindow) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < this.notes.length; i++) {
      const n = this.notes[i]!;
      if (n.start > t + this.chartWindow) break;
      if (n.pitch !== pitch || !this.eligible[n.id] || this.results.has(n.id)) continue;
      const d = Math.abs(t - n.start);
      if (d < bestDelta) {
        bestDelta = d;
        best = n;
      }
    }
    if (!best) {
      const measure = this.nearestMeasure(t);
      this.wrongs.push({ pitch, time: t, measure });
      return { kind: "wrong", pitch, time: t, measure };
    }
    const deltaMs = ((t - best.start) / this.opts.rate) * 1000;
    const judgement = judge(deltaMs, this.windows, this.scale)!;
    this.results.set(best.id, { note: best, judgement, deltaMs, velocity });
    return { kind: "hit", note: best, judgement, deltaMs };
  }

  /** Marks notes whose window has passed as missed. Returns the new misses. */
  advance(t: number): NoteResult[] {
    const missed: NoteResult[] = [];
    while (this.missCursor < this.notes.length) {
      const n = this.notes[this.missCursor]!;
      if (n.start + this.chartWindow >= t) break;
      if (this.eligible[n.id] && !this.results.has(n.id)) {
        const r: NoteResult = { note: n, judgement: "miss" };
        this.results.set(n.id, r);
        missed.push(r);
      }
      this.missCursor++;
    }
    return missed;
  }

  resultFor(noteId: number): NoteResult | undefined {
    return this.results.get(noteId);
  }

  private nearestMeasure(t: number): number {
    let best = 0,
      bestD = Infinity;
    const lo = Math.max(0, this.missCursor - 8);
    for (let i = lo; i < this.notes.length; i++) {
      const n = this.notes[i]!;
      const d = Math.abs(n.start - t);
      if (d < bestD) {
        bestD = d;
        best = n.measure;
      }
      if (n.start > t + 2) break;
    }
    return best;
  }

  /** Final summary. Notes never reached count as missed only if `untilEnd` is true. */
  summary(untilEnd = false): SessionSummary {
    if (untilEnd) this.advance(Infinity);
    const counts = emptyCounts();
    const deltas: number[] = [];
    const perHand: Record<Hand, { score: number; total: number }> = { L: { score: 0, total: 0 }, R: { score: 0, total: 0 } };
    const perMeasure = new Map<number, { errors: number; notes: number }>();
    const byLevel = new Map<number, number[]>();
    let score = 0;
    for (const r of this.results.values()) {
      counts[r.judgement]++;
      const w = JUDGEMENT_WEIGHT[r.judgement];
      score += w;
      perHand[r.note.hand].score += w;
      perHand[r.note.hand].total++;
      if (r.deltaMs !== undefined) deltas.push(r.deltaMs);
      const m = perMeasure.get(r.note.measure) ?? { errors: 0, notes: 0 };
      m.notes++;
      if (r.judgement === "miss" || r.judgement === "early" || r.judgement === "late") m.errors++;
      perMeasure.set(r.note.measure, m);
      if (r.velocity !== undefined) {
        const list = byLevel.get(r.note.velocity) ?? [];
        list.push(r.velocity);
        byLevel.set(r.note.velocity, list);
      }
    }
    for (const w of this.wrongs) {
      const m = perMeasure.get(w.measure) ?? { errors: 0, notes: 0 };
      m.errors++;
      perMeasure.set(w.measure, m);
    }
    const judged = this.results.size;
    const accuracy = judged ? Math.max(0, (score - WRONG_NOTE_PENALTY * this.wrongs.length) / judged) * 100 : 0;
    const mean = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;
    const sd = deltas.length > 1 ? Math.sqrt(deltas.reduce((a, b) => a + (b - mean) ** 2, 0) / (deltas.length - 1)) : 0;
    const binMs = 10,
      fromMs = -Math.ceil((this.windows.ok * this.scale) / binMs) * binMs;
    const histogram = new Array<number>(Math.round((-fromMs * 2) / binMs)).fill(0);
    for (const d of deltas) {
      const bin = Math.min(histogram.length - 1, Math.max(0, Math.floor((d - fromMs) / binMs)));
      histogram[bin]!++;
    }
    const cvs: number[] = [];
    for (const list of byLevel.values()) {
      if (list.length < 4) continue;
      const m = list.reduce((a, b) => a + b, 0) / list.length;
      const s = Math.sqrt(list.reduce((a, b) => a + (b - m) ** 2, 0) / list.length);
      cvs.push(s / m);
    }
    const hands: Partial<Record<Hand, number>> = {};
    for (const h of ["L", "R"] as const) if (perHand[h].total) hands[h] = (perHand[h].score / perHand[h].total) * 100;
    const weakSpots = [...perMeasure.entries()]
      .filter(([, v]) => v.errors > 0)
      .map(([measure, v]) => ({ measure, label: this.measureLabels[measure] ?? String(measure + 1), ...v }))
      .sort((a, b) => b.errors / Math.max(1, b.notes) - a.errors / Math.max(1, a.notes) || b.errors - a.errors)
      .slice(0, 3);
    return {
      mode: "timed",
      total: this.total,
      counts,
      wrong: this.wrongs.length,
      accuracy,
      timing: { meanMs: mean, sdMs: sd, binMs, fromMs, histogram },
      velocityConsistency: cvs.length ? Math.max(0, Math.min(1, 1 - cvs.reduce((a, b) => a + b, 0) / cvs.length)) : null,
      hands,
      weakSpots,
    };
  }
}
