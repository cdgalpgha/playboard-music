import { describe, expect, it } from "vitest";
import { applyEdits, majorKeyName, transposeFifths } from "./transforms.ts";
import type { RawScore } from "./chart.ts";

const raw: RawScore = {
  title: "t",
  composer: "",
  keyFifths: 0,
  tempo: [
    { beat: 0, bpm: 100 },
    { beat: 8, bpm: 80 },
  ],
  measures: [{ label: "1", startBeat: 0, lengthBeats: 4, beats: 4, beatType: 4 }],
  notes: [
    { pitch: 60, startBeat: 0, durationBeats: 1, velocity: 80, hand: "R" },
    { pitch: 22, startBeat: 1, durationBeats: 1, velocity: 80, hand: "L" },
    { pitch: 107, startBeat: 2, durationBeats: 1, velocity: 80, hand: "R" },
  ],
};

describe("transposeFifths", () => {
  it("walks the circle of fifths", () => {
    expect(transposeFifths(0, 2)).toBe(2); // C → D
    expect(transposeFifths(0, -2)).toBe(-2); // C → B♭
    expect(transposeFifths(1, 5)).toBe(0); // G → C
    expect(transposeFifths(0, 6)).toBe(6); // C → F♯
    expect(majorKeyName(transposeFifths(0, 3))).toBe("E♭");
  });
});

describe("applyEdits", () => {
  it("transposes notes and the key, and keeps notes on the keyboard", () => {
    const up = applyEdits(raw, { transpose: 3, tempo: 1 });
    expect(up.notes.map((n) => n.pitch)).toEqual([63, 25, 98]);
    expect(up.keyFifths).toBe(-3);
    const down = applyEdits(raw, { transpose: -2, tempo: 1 });
    expect(down.notes.map((n) => n.pitch)).toEqual([58, 32, 105]);
  });

  it("scales every tempo point", () => {
    expect(applyEdits(raw, { transpose: 0, tempo: 0.5 }).tempo).toEqual([
      { beat: 0, bpm: 50 },
      { beat: 8, bpm: 40 },
    ]);
  });

  it("does not modify its input", () => {
    applyEdits(raw, { transpose: 5, tempo: 2 });
    expect(raw.notes[0]!.pitch).toBe(60);
    expect(raw.tempo[0]!.bpm).toBe(100);
  });
});
