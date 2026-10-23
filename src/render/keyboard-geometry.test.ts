import { describe, expect, it } from "vitest";
import { keyLayout, noteName, whiteCount } from "./keyboard-geometry.ts";

describe("keyLayout", () => {
  it("lays out a full 88-key piano with 52 white keys", () => {
    const keys = keyLayout(21, 108);
    expect(keys).toHaveLength(88);
    expect(whiteCount(21, 108)).toBe(52);
    const whites = keys.filter((k) => !k.black);
    expect(whites[0]!.x).toBe(0);
    expect(whites.at(-1)!.x + whites.at(-1)!.w).toBeCloseTo(1);
  });

  it("places black keys between their neighbouring white keys", () => {
    const keys = keyLayout(60, 72);
    const cs = keys.find((k) => k.note === 61)!;
    const c = keys.find((k) => k.note === 60)!;
    const d = keys.find((k) => k.note === 62)!;
    expect(cs.black).toBe(true);
    expect(cs.x).toBeGreaterThan(c.x);
    expect(cs.x + cs.w).toBeLessThan(d.x + d.w);
  });
});

describe("noteName", () => {
  it("names notes with octave numbers", () => {
    expect(noteName(60)).toBe("C4");
    expect(noteName(21)).toBe("A0");
    expect(noteName(70)).toBe("A♯4");
    expect(noteName(70, true)).toBe("B♭4");
  });
});
