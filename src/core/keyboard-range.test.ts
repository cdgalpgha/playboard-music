import { describe, expect, it } from "vitest";
import { detectKeyboardRange, rangeFromDeviceName, visibleRange } from "./keyboard-range.ts";

describe("detectKeyboardRange", () => {
  it("recognises exact standard ranges", () => {
    expect(detectKeyboardRange(21, 108)).toEqual({ keys: 88, low: 21, high: 108 });
    expect(detectKeyboardRange(36, 96)).toEqual({ keys: 61, low: 36, high: 96 });
    expect(detectKeyboardRange(48, 72)).toEqual({ keys: 25, low: 48, high: 72 });
    expect(detectKeyboardRange(28, 103)).toEqual({ keys: 76, low: 28, high: 103 });
  });

  it("keeps an octave-shifted 25-key controller's position", () => {
    expect(detectKeyboardRange(60, 84)).toEqual({ keys: 25, low: 60, high: 84 });
  });

  it("accepts the keys in either order", () => {
    expect(detectKeyboardRange(96, 36).keys).toBe(61);
  });

  it("rounds a partial press up to the next standard size", () => {
    expect(detectKeyboardRange(40, 80)).toEqual({ keys: 49, low: 36, high: 84 });
    expect(detectKeyboardRange(30, 98).keys).toBe(73);
  });

  it("treats anything wider than 76 keys as a full piano", () => {
    expect(detectKeyboardRange(22, 105)).toEqual({ keys: 88, low: 21, high: 108 });
  });
});

describe("rangeFromDeviceName", () => {
  it("reads sizes from common device names", () => {
    expect(rangeFromDeviceName("Keystation 49 MK3")?.keys).toBe(49);
    expect(rangeFromDeviceName("Launchkey 61 MIDI In")?.keys).toBe(61);
    expect(rangeFromDeviceName("MPK mini 3")?.keys).toBe(25);
    expect(rangeFromDeviceName("Roland FP-30X")?.keys).toBe(88);
    expect(rangeFromDeviceName("Yamaha P-125")?.keys).toBe(88);
  });

  it("returns null for unknown devices", () => {
    expect(rangeFromDeviceName("USB MIDI Interface")).toBeNull();
  });
});

describe("visibleRange", () => {
  it("expands black-key edges to white keys", () => {
    expect(visibleRange({ keys: 25, low: 49, high: 73 })).toEqual({ low: 48, high: 74 });
  });
});
