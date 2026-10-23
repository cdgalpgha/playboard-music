import { describe, expect, it } from "vitest";
import { buildChart, type Chart, type RawNote } from "./chart.ts";
import { judge, ScoringEngine, DEFAULT_WINDOWS, windowScale } from "./scoring.ts";

/** Quarter notes at 60 BPM, so beat n starts at n seconds. */
function chart(notes: Partial<RawNote>[]): Chart {
  return buildChart({
    id: "t",
    title: "t",
    composer: "",
    notes: notes.map((n, i) => ({
      pitch: 60,
      startBeat: i,
      durationBeats: 1,
      velocity: 80,
      hand: "R",
      ...n,
    })),
    measures: [0, 4, 8].map((b, i) => ({ label: String(i + 1), startBeat: b, lengthBeats: 4, beats: 4, beatType: 4 })),
    tempo: [{ beat: 0, bpm: 60 }],
    keyFifths: 0,
    license: { kind: "original", attribution: "" },
  });
}

const both = new Set(["L", "R"] as const);

describe("judge", () => {
  it("classifies by absolute delta and sign", () => {
    expect(judge(0, DEFAULT_WINDOWS, 1)).toBe("perfect");
    expect(judge(-40, DEFAULT_WINDOWS, 1)).toBe("perfect");
    expect(judge(41, DEFAULT_WINDOWS, 1)).toBe("good");
    expect(judge(-120, DEFAULT_WINDOWS, 1)).toBe("early");
    expect(judge(150, DEFAULT_WINDOWS, 1)).toBe("late");
    expect(judge(181, DEFAULT_WINDOWS, 1)).toBeNull();
  });

  it("widens windows at slow tempos up to 1.5x", () => {
    expect(windowScale(1)).toBe(1);
    expect(windowScale(0.8)).toBeCloseTo(1.25);
    expect(windowScale(0.25)).toBe(1.5);
    expect(windowScale(1.25)).toBe(1);
  });
});

describe("ScoringEngine", () => {
  it("matches each played note to the nearest unmatched expected note of the same pitch", () => {
    const c = chart([{ pitch: 60 }, { pitch: 62 }, { pitch: 64 }]);
    const s = new ScoringEngine(c, { rate: 1, hands: both });
    expect(s.noteOn(60, 0.01, 80)).toMatchObject({ kind: "hit", judgement: "perfect" });
    expect(s.noteOn(62, 1.06, 80)).toMatchObject({ kind: "hit", judgement: "good" });
    expect(s.noteOn(64, 1.85, 80)).toMatchObject({ kind: "hit", judgement: "early" });
    const r = s.noteOn(64, 2.0, 80);
    // The E4 was already matched, so a second E4 is a wrong note.
    expect(r.kind).toBe("wrong");
  });

  it("reports delta in real time at slower practice tempos", () => {
    const c = chart([{ pitch: 60 }, { pitch: 60 }]);
    const s = new ScoringEngine(c, { rate: 0.5, hands: both });
    // 0.05 chart-seconds late at half speed is 100 ms late in real time.
    const hit = s.noteOn(60, 1.05, 80);
    expect(hit).toMatchObject({ kind: "hit", deltaMs: expect.closeTo(100, 6) });
    // ...which is "good" because windows widen by 1.5x at half speed.
    expect(hit.kind === "hit" && hit.judgement).toBe("good");
  });

  it("marks passed notes as missed and counts them", () => {
    const c = chart([{ pitch: 60 }, { pitch: 62 }, { pitch: 64 }]);
    const s = new ScoringEngine(c, { rate: 1, hands: both });
    s.noteOn(60, 0, 80);
    expect(s.advance(1.1)).toHaveLength(0);
    expect(s.advance(1.2).map((r) => r.note.pitch)).toEqual([62]);
    const sum = s.summary(true);
    expect(sum.counts).toMatchObject({ perfect: 1, miss: 2 });
    expect(sum.accuracy).toBeCloseTo(100 / 3);
  });

  it("only scores the selected hands and range", () => {
    const c = chart([{ hand: "L" }, { hand: "R" }, { hand: "R" }, { hand: "R" }]);
    const s = new ScoringEngine(c, { rate: 1, hands: new Set(["R"]), from: 1, to: 3 });
    expect(s.total).toBe(2);
    expect(s.noteOn(60, 0, 80).kind).toBe("ignored");
    expect(s.noteOn(60, 1, 80).kind).toBe("hit");
    expect(s.summary(true).counts.miss).toBe(1);
  });

  it("applies the wrong-note penalty and finds weak measures", () => {
    const c = chart(Array.from({ length: 8 }, (_, i) => ({ pitch: 60 + i })));
    const s = new ScoringEngine(c, { rate: 1, hands: both });
    for (let i = 0; i < 4; i++) s.noteOn(60 + i, i, 80);
    s.noteOn(90, 4.5, 80);
    s.noteOn(91, 5.5, 80);
    const sum = s.summary(true);
    expect(sum.wrong).toBe(2);
    expect(sum.accuracy).toBeCloseTo(((4 - 0.5) / 8) * 100);
    expect(sum.weakSpots[0]).toMatchObject({ label: "2", errors: 6 });
  });

  it("builds a signed timing histogram and stats", () => {
    const c = chart([{}, {}, {}, {}]);
    const s = new ScoringEngine(c, { rate: 1, hands: both });
    [-0.02, 0.0, 0.03, 0.05].forEach((d, i) => s.noteOn(60, i + d, 80));
    const { timing } = s.summary(true);
    expect(timing.fromMs).toBe(-180);
    expect(timing.histogram).toHaveLength(36);
    expect(timing.histogram.reduce((a, b) => a + b, 0)).toBe(4);
    expect(timing.histogram[16]).toBe(1); // -20 ms falls in [-20, -10)
    expect(timing.meanMs).toBeCloseTo(15);
  });

  it("measures velocity consistency within a dynamic level", () => {
    const c = chart(Array.from({ length: 6 }, () => ({})));
    const even = new ScoringEngine(c, { rate: 1, hands: both });
    const uneven = new ScoringEngine(c, { rate: 1, hands: both });
    for (let i = 0; i < 6; i++) {
      even.noteOn(60, i, 80);
      uneven.noteOn(60, i, i % 2 ? 40 : 110);
    }
    expect(even.summary(true).velocityConsistency).toBeCloseTo(1);
    expect(uneven.summary(true).velocityConsistency!).toBeLessThan(0.6);
  });

  it("matches chords note by note", () => {
    const c = chart([
      { pitch: 60, startBeat: 0 },
      { pitch: 64, startBeat: 0 },
      { pitch: 67, startBeat: 0 },
    ]);
    const s = new ScoringEngine(c, { rate: 1, hands: both });
    for (const p of [67, 60, 64]) expect(s.noteOn(p, 0.012, 90).kind).toBe("hit");
    expect(s.summary(true).counts.perfect).toBe(3);
  });
});
