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
