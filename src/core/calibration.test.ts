import { describe, expect, it } from "vitest";
import { analyzeTaps, matchTaps, offsetsFrom } from "./calibration.ts";

describe("matchTaps", () => {
  it("pairs taps with the nearest target and ignores far taps", () => {
    const targets = [1000, 1600, 2200, 2800];
    expect(matchTaps([1030, 1590, 2500, 2830], targets, 250)).toEqual([30, -10, 30]);
  });

  it("does not reuse a target for two taps", () => {
    expect(matchTaps([1000, 1010], [1000, 1600], 300)).toEqual([0]);
  });
});

describe("analyzeTaps", () => {
  it("needs at least eight taps", () => {
    expect(analyzeTaps([10, 12, 11])).toBeNull();
  });

  it("returns the median and drops outliers", () => {
    const errors = [22, 25, 19, 24, 21, 23, 26, 20, 180, -150];
    const a = analyzeTaps(errors)!;
    expect(a.kept).toBe(8);
    expect(a.dropped).toBe(2);
    expect(a.medianMs).toBeCloseTo(22.5);
    expect(a.spreadMs).toBeGreaterThan(0);
    expect(a.spreadMs).toBeLessThan(6);
  });
});

describe("offsetsFrom", () => {
  it("separates input latency from unreported audio latency", () => {
    const visual = { medianMs: 18, spreadMs: 5, kept: 10, dropped: 0 };
    const audio = { medianMs: 43, spreadMs: 6, kept: 10, dropped: 0 };
    expect(offsetsFrom(audio, visual)).toEqual({ inputOffsetMs: 18, audioOffsetMs: 25 });
  });
});
