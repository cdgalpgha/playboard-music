import { describe, expect, it } from "vitest";
import { parseMidiMessage } from "./midi-message.ts";

describe("parseMidiMessage", () => {
  it("parses note-on with channel and velocity", () => {
    expect(parseMidiMessage([0x93, 60, 100])).toEqual({ kind: "noteon", channel: 3, note: 60, velocity: 100 });
  });

  it("treats note-on with velocity 0 as note-off", () => {
    expect(parseMidiMessage([0x90, 64, 0])).toMatchObject({ kind: "noteoff", note: 64 });
  });

  it("parses note-off with release velocity", () => {
    expect(parseMidiMessage([0x8f, 21, 40])).toEqual({ kind: "noteoff", channel: 15, note: 21, velocity: 40 });
  });

  it("parses the sustain pedal controller", () => {
    expect(parseMidiMessage([0xb0, 64, 127])).toEqual({ kind: "cc", channel: 0, controller: 64, value: 127 });
  });

  it("ignores system and real-time messages and truncated data", () => {
    expect(parseMidiMessage([0xf8])).toEqual({ kind: "other" });
    expect(parseMidiMessage([0xfe])).toEqual({ kind: "other" });
    expect(parseMidiMessage([0xf0, 0x7e, 0xf7])).toEqual({ kind: "other" });
    expect(parseMidiMessage([0x90, 60])).toEqual({ kind: "other" });
    expect(parseMidiMessage([])).toEqual({ kind: "other" });
    expect(parseMidiMessage([60, 100])).toEqual({ kind: "other" });
  });

  it("masks data bytes to 7 bits", () => {
    expect(parseMidiMessage([0x90, 0xbc, 0xff])).toMatchObject({ note: 60, velocity: 127 });
  });

  it("ignores pitch bend, aftertouch and program change", () => {
    expect(parseMidiMessage([0xe0, 0, 64]).kind).toBe("other");
    expect(parseMidiMessage([0xd0, 40]).kind).toBe("other");
    expect(parseMidiMessage([0xc0, 1]).kind).toBe("other");
  });
});
