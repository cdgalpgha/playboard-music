import { TempoMap, type TempoPoint } from "./tempo-map.ts";

export type Hand = "L" | "R";

export interface ChartNote {
  /** Index in `Chart.notes`, which is sorted by start then pitch. */
  id: number;
  pitch: number;
  /** Seconds at the notated tempo. */
  start: number;
  end: number;
  /** Quarter-note beats from the start of the piece. */
  startBeat: number;
  durationBeats: number;
  /** 1..127. From dynamics in MusicXML or note velocity in MIDI. */
  velocity: number;
  hand: Hand;
  finger?: number;
  /** Index into `Chart.measures`. */
  measure: number;
}

export interface Measure {
  index: number;
  /** The printed measure number. */
  label: string;
  startBeat: number;
  /** Length in quarter-note beats. */
  lengthBeats: number;
  start: number;
  end: number;
  /** Time signature in force. */
  beats: number;
  beatType: number;
  /** Measure index in the source file (differs from `index` after repeats are expanded). */
  sourceIndex: number;
}

export interface LicenseInfo {
  kind: "public-domain" | "original" | "user-private" | "licensed";
  /** Human-readable credit line shown with the piece. */
  attribution: string;
  source?: string;
  licenseId?: string;
}

export interface Chart {
  id: string;
  title: string;
  composer: string;
  notes: ChartNote[];
  measures: Measure[];
  tempo: TempoPoint[];
  /** Seconds of every counted beat (time-signature unit), for metronome and grid. */
  beats: { time: number; downbeat: boolean }[];
  duration: number;
  keyFifths: number;
  license: LicenseInfo;
}

export interface RawNote {
  pitch: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
  hand: Hand;
  finger?: number;
}

export interface RawMeasure {
  label: string;
  startBeat: number;
  lengthBeats: number;
  beats: number;
  beatType: number;
  sourceIndex?: number;
}

/** A score in beats, before tempo edits and transposition are applied. */
export interface RawScore {
  title: string;
  composer: string;
  notes: RawNote[];
  measures: RawMeasure[];
  tempo: TempoPoint[];
  keyFifths: number;
}

/** Builds a chart from beat-based notes and measures. */
export function buildChart(input: {
  id: string;
  title: string;
  composer: string;
  notes: RawNote[];
  measures: RawMeasure[];
  tempo: TempoPoint[];
  keyFifths: number;
  license: LicenseInfo;
}): Chart {
  const map = new TempoMap(input.tempo);
  const measures: Measure[] = input.measures.map((m, index) => ({
    index,
    label: m.label,
    startBeat: m.startBeat,
    lengthBeats: m.lengthBeats,
    start: map.beatToSec(m.startBeat),
    end: map.beatToSec(m.startBeat + m.lengthBeats),
    beats: m.beats,
    beatType: m.beatType,
    sourceIndex: m.sourceIndex ?? index,
  }));
  const measureAt = (beat: number) => {
    let lo = 0,
      hi = measures.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (measures[mid]!.startBeat <= beat + 1e-6) lo = mid;
      else hi = mid - 1;
    }
    return Math.max(0, lo);
  };
  const sorted = [...input.notes].sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch);
  const notes: ChartNote[] = sorted.map((n, id) => ({
    id,
    pitch: n.pitch,
    startBeat: n.startBeat,
    durationBeats: n.durationBeats,
    start: map.beatToSec(n.startBeat),
    end: map.beatToSec(n.startBeat + n.durationBeats),
    velocity: n.velocity,
    hand: n.hand,
    ...(n.finger ? { finger: n.finger } : {}),
    measure: measureAt(n.startBeat),
  }));
  const beats: Chart["beats"] = [];
  for (const m of measures) {
    const unit = 4 / m.beatType;
    // Compound meters (6/8, 9/8, 12/8) count dotted-quarter beats.
    const step = m.beatType === 8 && m.beats % 3 === 0 && m.beats > 3 ? unit * 3 : unit;
    for (let b = 0; b < m.lengthBeats - 1e-6; b += step)
      beats.push({ time: map.beatToSec(m.startBeat + b), downbeat: b === 0 });
  }
  const lastMeasure = measures.at(-1);
  const duration = Math.max(lastMeasure?.end ?? 0, notes.reduce((t, n) => Math.max(t, n.end), 0));
  return {
    id: input.id,
    title: input.title,
    composer: input.composer,
    notes,
    measures,
    tempo: map.points,
    beats,
    duration,
    keyFifths: input.keyFifths,
    license: input.license,
  };
}

export function pitchRange(chart: Chart): { low: number; high: number } {
  if (!chart.notes.length) return { low: 60, high: 72 };
  let low = 127,
    high = 0;
  for (const n of chart.notes) {
    low = Math.min(low, n.pitch);
    high = Math.max(high, n.pitch);
  }
  return { low, high };
}

/** Index of the first note with start >= t (binary search). */
export function firstNoteAtOrAfter(notes: ChartNote[], t: number): number {
  let lo = 0,
    hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid]!.start < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function measureAtTime(chart: Chart, t: number): number {
  const ms = chart.measures;
  let lo = 0,
    hi = ms.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ms[mid]!.start <= t) lo = mid;
    else hi = mid - 1;
  }
  return Math.max(0, lo);
}
