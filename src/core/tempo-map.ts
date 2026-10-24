/** Piecewise-constant tempo, in quarter-note beats. */
export interface TempoPoint {
  /** Position in quarter-note beats. */
  beat: number;
  /** Quarter notes per minute from this point on. */
  bpm: number;
}

export class TempoMap {
  readonly points: TempoPoint[];
  /** Seconds at each point, precomputed. */
  private readonly secs: number[];

  constructor(points: TempoPoint[]) {
    const sorted = [...points].sort((a, b) => a.beat - b.beat);
    if (!sorted.length || sorted[0]!.beat > 0) sorted.unshift({ beat: 0, bpm: sorted[0]?.bpm ?? 120 });
    // Later points at the same beat win.
    this.points = sorted.filter((p, i) => sorted[i + 1]?.beat !== p.beat);
    this.secs = [0];
    for (let i = 1; i < this.points.length; i++) {
      const prev = this.points[i - 1]!;
      this.secs.push(this.secs[i - 1]! + ((this.points[i]!.beat - prev.beat) * 60) / prev.bpm);
    }
  }

  private indexForBeat(beat: number): number {
    let lo = 0,
      hi = this.points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.points[mid]!.beat <= beat) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  beatToSec(beat: number): number {
    const i = this.indexForBeat(beat);
    const p = this.points[i]!;
    return this.secs[i]! + ((beat - p.beat) * 60) / p.bpm;
  }

  secToBeat(sec: number): number {
    let lo = 0,
      hi = this.secs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.secs[mid]! <= sec) lo = mid;
      else hi = mid - 1;
    }
    const p = this.points[lo]!;
    return p.beat + ((sec - this.secs[lo]!) * p.bpm) / 60;
  }

  bpmAt(beat: number): number {
    return this.points[this.indexForBeat(beat)]!.bpm;
  }

  /** A copy with every tempo multiplied by `factor` (1.2 = 20% faster). */
  scaled(factor: number): TempoMap {
    return new TempoMap(this.points.map((p) => ({ beat: p.beat, bpm: p.bpm * factor })));
  }
}
