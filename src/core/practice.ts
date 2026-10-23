import type { ChartNote, Hand } from "./chart.ts";

/** Notes that start together (within `tolerance` chart-seconds) form one onset group. */
export interface OnsetGroup {
  time: number;
  noteIds: number[];
  pitches: number[];
}

export function onsetGroups(
  notes: ChartNote[],
  hands: ReadonlySet<Hand>,
  from = -Infinity,
  to = Infinity,
  tolerance = 0.03,
): OnsetGroup[] {
  const groups: OnsetGroup[] = [];
  for (const n of notes) {
    if (!hands.has(n.hand) || n.start < from - 1e-6 || n.start >= to - 1e-6) continue;
    const last = groups.at(-1);
    if (last && n.start - last.time <= tolerance) {
      last.noteIds.push(n.id);
      if (!last.pitches.includes(n.pitch)) last.pitches.push(n.pitch);
    } else groups.push({ time: n.start, noteIds: [n.id], pitches: [n.pitch] });
  }
  return groups;
}

/**
 * Wait-for-me: the transport stops at each onset group until every pitch in it
 * has been played. Notes played early (before the stop) count.
 */
export class WaitGate {
  private index = 0;
  private readonly pressed = new Set<number>();
  correct = 0;
  wrong = 0;
  /** Groups completed without a wrong note on the way. */
  clean = 0;
  private dirty = false;

  constructor(readonly groups: OnsetGroup[]) {}

  current(): OnsetGroup | null {
    return this.groups[this.index] ?? null;
  }

  seek(chart: number): void {
    this.index = this.groups.findIndex((g) => g.time >= chart - 1e-6);
    if (this.index < 0) this.index = this.groups.length;
    this.pressed.clear();
    this.dirty = false;
  }

  noteOn(pitch: number): "correct" | "wrong" | "repeat" | "done" {
    const g = this.current();
    if (!g) return "done";
    if (!g.pitches.includes(pitch)) {
      this.wrong++;
      this.dirty = true;
      return "wrong";
    }
    if (this.pressed.has(pitch)) return "repeat";
    this.pressed.add(pitch);
    this.correct++;
    return "correct";
  }

  satisfied(): boolean {
    const g = this.current();
    return !g || g.pitches.every((p) => this.pressed.has(p));
  }

  /** Moves to the next group; returns it. */
  next(): OnsetGroup | null {
    if (this.current()) {
      if (!this.dirty) this.clean++;
      this.index++;
    }
    this.pressed.clear();
    this.dirty = false;
    return this.current();
  }

  get progress(): { done: number; total: number } {
    return { done: Math.min(this.index, this.groups.length), total: this.groups.length };
  }
}
