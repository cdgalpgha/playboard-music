import { describe, expect, it } from "vitest";
import { TempoMap } from "./tempo-map.ts";

describe("TempoMap", () => {
  it("converts beats to seconds at a constant tempo", () => {
    const m = new TempoMap([{ beat: 0, bpm: 120 }]);
    expect(m.beatToSec(4)).toBeCloseTo(2);
    expect(m.secToBeat(2)).toBeCloseTo(4);
  });

  it("integrates tempo changes", () => {
    const m = new TempoMap([
      { beat: 0, bpm: 60 },
      { beat: 4, bpm: 120 },
    ]);
    expect(m.beatToSec(4)).toBeCloseTo(4);
    expect(m.beatToSec(8)).toBeCloseTo(6);
    expect(m.secToBeat(5)).toBeCloseTo(6);
    expect(m.bpmAt(5)).toBe(120);
  });

  it("round-trips arbitrary positions", () => {
    const m = new TempoMap([
      { beat: 0, bpm: 90 },
      { beat: 3.5, bpm: 140 },
      { beat: 10, bpm: 72 },
    ]);
    for (const b of [0, 1.25, 3.5, 7, 10, 12.75]) expect(m.secToBeat(m.beatToSec(b))).toBeCloseTo(b, 9);
  });

  it("adds a starting point when the first tempo is late, and scales", () => {
    const m = new TempoMap([{ beat: 2, bpm: 100 }]);
    expect(m.points[0]).toEqual({ beat: 0, bpm: 100 });
    expect(m.scaled(2).beatToSec(4)).toBeCloseTo(1.2);
  });
});
