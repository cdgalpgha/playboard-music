import { describe, expect, it } from "vitest";
import { contextTimeHeardAt, heardAt, measure, summarize } from "./latency.ts";

const ref = { contextTime: 10, performanceTime: 5000 };

describe("output clock mapping", () => {
  it("maps context time to the moment it is heard and back", () => {
    expect(heardAt(10.5, ref)).toBeCloseTo(5500);
    expect(contextTimeHeardAt(5500, ref)).toBeCloseTo(10.5);
    expect(contextTimeHeardAt(heardAt(12.345, ref), ref)).toBeCloseTo(12.345, 9);
  });
});

describe("measure", () => {
  it("splits total latency into dispatch and audio path", () => {
    // Key at 4990 ms, posted at 4991 ms, voice starts at frame 480000 (10 s at 48 kHz),
    // which the speaker plays at 5000 ms.
    const s = measure(60, "midi", 4990, 4991, 480000, 48000, ref);
    expect(s.dispatchMs).toBeCloseTo(1);
    expect(s.totalMs).toBeCloseTo(10);
    expect(s.audioMs).toBeCloseTo(9);
  });

  it("never reports less than the dispatch time", () => {
    const s = measure(60, "midi", 4990, 4995, 470000, 48000, ref);
    expect(s.totalMs).toBe(5);
    expect(s.audioMs).toBe(0);
  });
});

describe("summarize", () => {
  it("reports median and p95", () => {
    const samples = Array.from({ length: 20 }, (_, i) => ({
      note: 60,
      source: "midi",
      dispatchMs: 0,
      audioMs: i + 1,
      totalMs: i + 1,
      at: 0,
    }));
    expect(summarize(samples)).toEqual({ median: 11, p95: 20, count: 20 });
    expect(summarize([])).toBeNull();
  });
});
