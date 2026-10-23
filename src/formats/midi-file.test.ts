import { describe, expect, it } from "vitest";
import { defaultTrackRoles, midiToRaw, parseMidiFile } from "./midi-file.ts";
import { writeMidiFile, type WriterEvent } from "./midi-writer.ts";

const buf = (u8: Uint8Array) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
const note = (pitch: number, start: number, len: number, velocity = 80, channel = 0): WriterEvent[] => [
  { tick: start, type: "on", pitch, velocity, channel },
  { tick: start + len, type: "off", pitch, channel },
];

describe("parseMidiFile", () => {
  it("reads notes, tempo, time signature and track names", () => {
    const file = writeMidiFile([
      [
        { tick: 0, type: "name", text: "Right hand" },
        { tick: 0, type: "tempo", bpm: 90 },
        { tick: 0, type: "timesig", numerator: 3, denominator: 4 },
        ...note(60, 0, 480, 100),
        ...note(64, 480, 240),
      ],
    ]);
    const midi = parseMidiFile(buf(file));
    expect(midi.format).toBe(0);
    expect(midi.ticksPerQuarter).toBe(480);
    expect(midi.tempos).toEqual([{ tick: 0, bpm: 90 }]);
    expect(midi.timeSignatures).toEqual([{ tick: 0, numerator: 3, denominator: 4 }]);
    expect(midi.tracks[0]!.name).toBe("Right hand");
    expect(midi.tracks[0]!.notes).toEqual([
      { pitch: 60, channel: 0, startTick: 0, endTick: 480, velocity: 100 },
      { pitch: 64, channel: 0, startTick: 480, endTick: 720, velocity: 80 },
    ]);
  });

  it("handles running status with note-on velocity 0 as note-off", () => {
    const file = writeMidiFile([[...note(60, 0, 100), ...note(62, 100, 100), ...note(64, 200, 100)]], 96, true);
    const notes = parseMidiFile(buf(file)).tracks[0]!.notes;
    expect(notes.map((n) => [n.pitch, n.startTick, n.endTick])).toEqual([
      [60, 0, 100],
      [62, 100, 200],
      [64, 200, 300],
    ]);
  });

  it("pairs overlapping notes of the same pitch first-in, first-out", () => {
    const file = writeMidiFile([
      [
        { tick: 0, type: "on", pitch: 60, velocity: 90 },
        { tick: 100, type: "on", pitch: 60, velocity: 50 },
        { tick: 200, type: "off", pitch: 60 },
        { tick: 300, type: "off", pitch: 60 },
      ],
    ]);
    expect(parseMidiFile(buf(file)).tracks[0]!.notes.map((n) => [n.startTick, n.endTick, n.velocity])).toEqual([
      [0, 200, 90],
      [100, 300, 50],
    ]);
  });

  it("decodes multi-byte variable-length deltas", () => {
    const file = writeMidiFile([[...note(60, 20000, 300000)]]);
    const n = parseMidiFile(buf(file)).tracks[0]!.notes[0]!;
    expect([n.startTick, n.endTick]).toEqual([20000, 320000]);
  });

  it("skips the drum channel and closes notes left open", () => {
    const file = writeMidiFile([
      [...note(36, 0, 100, 100, 9), { tick: 0, type: "on", pitch: 72, velocity: 70 }, { tick: 500, type: "cc", controller: 7, value: 100 }],
    ]);
    const t = parseMidiFile(buf(file)).tracks[0]!;
    expect(t.notes).toEqual([{ pitch: 72, channel: 0, startTick: 0, endTick: 500, velocity: 70 }]);
  });

  it("reads SMPTE timing as seconds at 120 BPM", () => {
    const file = writeMidiFile([[...note(60, 0, 1000)]]);
    // Patch the division to SMPTE 25 fps, 40 ticks per frame (1000 ticks per second).
    file[12] = 256 - 25;
    file[13] = 40;
    const midi = parseMidiFile(buf(file));
    expect(midi.ticksPerQuarter).toBe(500);
    expect(midi.tempos).toEqual([{ tick: 0, bpm: 120 }]);
  });

  it("rejects files that are not MIDI", () => {
    expect(() => parseMidiFile(new TextEncoder().encode("hello world, not midi").buffer as ArrayBuffer)).toThrow(/MThd/);
  });
});

describe("midiToRaw", () => {
  const twoTracks = () =>
    parseMidiFile(
      buf(
        writeMidiFile([
          [{ tick: 0, type: "tempo", bpm: 120 }],
          [{ tick: 0, type: "name", text: "Melody" }, ...note(72, 0, 480), ...note(74, 480, 480)],
          [{ tick: 0, type: "name", text: "Bass" }, ...note(48, 0, 960)],
        ]),
      ),
    );

  it("assigns the lower track to the left hand", () => {
    const midi = twoTracks();
    expect(defaultTrackRoles(midi)).toEqual(["skip", "R", "L"]);
    const raw = midiToRaw(midi, defaultTrackRoles(midi), { title: "t" });
    expect(raw.notes.map((n) => [n.pitch, n.hand, n.startBeat, n.durationBeats])).toEqual([
      [72, "R", 0, 1],
      [74, "R", 1, 1],
      [48, "L", 0, 2],
    ]);
    expect(raw.tempo).toEqual([{ beat: 0, bpm: 120 }]);
  });

  it("splits a single track at middle C and builds 4/4 measures by default", () => {
    const midi = parseMidiFile(buf(writeMidiFile([[...note(60, 0, 480), ...note(55, 0, 480), ...note(64, 1920, 480)]])));
    const raw = midiToRaw(midi, defaultTrackRoles(midi), { title: "t" });
    expect(raw.notes.map((n) => n.hand).sort()).toEqual(["L", "R", "R"]);
    expect(raw.measures.map((m) => [m.startBeat, m.lengthBeats])).toEqual([
      [0, 4],
      [4, 4],
    ]);
  });

  it("honours skipped tracks", () => {
    const midi = twoTracks();
    const raw = midiToRaw(midi, ["skip", "R", "skip"], { title: "t" });
    expect(raw.notes.every((n) => n.pitch >= 72)).toBe(true);
  });
});
