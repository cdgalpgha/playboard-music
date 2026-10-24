import { describe, expect, it } from "vitest";
import { chordFor, chordLetter } from "./chords.ts";

describe("chord keys", () => {
  it("plays D major on D", () => {
    expect(chordFor("D", { minor: false, sharp: false, octave: 4 })).toMatchObject({ name: "D", notes: [62, 66, 69] });
  });
  it("plays D minor with Shift", () => {
    expect(chordFor("D", { minor: true, sharp: false, octave: 4 })).toMatchObject({ name: "Dm", notes: [62, 65, 69] });
  });
  it("plays D sharp major with Space", () => {
    expect(chordFor("D", { minor: false, sharp: true, octave: 4 })).toMatchObject({ name: "D♯", notes: [63, 67, 70] });
  });
  it("B sharp lands on C of the next octave", () => {
    expect(chordFor("B", { minor: false, sharp: true, octave: 4 })!.notes).toEqual([72, 76, 79]);
  });
  it("reads letters by character, then by key position", () => {
    expect(chordLetter("D", "KeyD")).toBe("D");
    expect(chordLetter("d", "KeyD")).toBe("D");
    expect(chordLetter("в", "KeyD")).toBe("D");
    expect(chordLetter("h", "KeyH")).toBeNull();
  });
});

describe("chord helpers", () => {
  it("sevenths voicing plays maj7 and m7", async () => {
    const { chordFor } = await import("./chords.ts");
    expect(chordFor("C", { minor: false, sharp: false, octave: 4, voicing: "sevenths" })!.notes).toEqual([60, 64, 67, 71]);
    expect(chordFor("D", { minor: true, sharp: false, octave: 4, voicing: "sevenths" })!.name).toBe("Dm7");
  });
  it("transpose shifts notes and the name", async () => {
    const { chordFor } = await import("./chords.ts");
    expect(chordFor("C", { minor: false, sharp: false, octave: 4, transpose: 2 })).toMatchObject({ name: "D", notes: [62, 66, 69] });
  });
  it("inversions move the lowest note up an octave", async () => {
    const { chordNotes } = await import("./chords.ts");
    expect(chordNotes(0, "major", 4, 1)).toEqual([64, 67, 72]);
    expect(chordNotes(0, "major", 4, 2)).toEqual([67, 72, 76]);
  });
  it("holdsChord accepts any octave or inversion", async () => {
    const { holdsChord } = await import("./chords.ts");
    expect(holdsChord([52, 55, 60], 0, "major")).toBe(true);
    expect(holdsChord([60, 63, 67], 0, "major")).toBe(false);
  });
  it("barTiming finds the nearest bar line", async () => {
    const { barTiming } = await import("./chords.ts");
    expect(barTiming(1.95, 2)).toEqual({ bar: 1, offset: expect.closeTo(-0.05, 5) });
    expect(barTiming(2.1, 2)).toEqual({ bar: 1, offset: expect.closeTo(0.1, 5) });
  });
});
