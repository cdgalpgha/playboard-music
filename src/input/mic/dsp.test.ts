import { describe, expect, it } from "vitest";
import { FFT_HOP, MIDI_OFFSET, MODEL_RATE, OnsetDecoder, PITCHES, Resampler } from "./dsp.ts";

function rms(x: Float32Array, from = 0, to = x.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i]! * x[i]!;
  return Math.sqrt(s / Math.max(1, to - from));
}

describe("Resampler", () => {
  it("converts 48 kHz to 22.05 kHz with the right length, across block boundaries", () => {
    const r = new Resampler(48000);
    let total = 0;
    for (let b = 0; b < 10; b++) total += r.push(new Float32Array(4800)).length;
    expect(total).toBeGreaterThan(MODEL_RATE * 0.99 - 40);
    expect(total).toBeLessThan(MODEL_RATE * 1.0 + 1);
  });

  it("passes a 440 Hz tone and rejects a 15 kHz tone", () => {
    const tone = (f: number) => Float32Array.from({ length: 48000 }, (_, i) => Math.sin((2 * Math.PI * f * i) / 48000));
    const low = new Resampler(48000).push(tone(440));
    const high = new Resampler(48000).push(tone(15000));
    expect(rms(low, 1000, 20000)).toBeGreaterThan(0.65);
    expect(rms(high, 1000, 20000)).toBeLessThan(0.05);
  });
});

/** Builds model output for `n` frames with given (frame, pitch, onset, sustain-frames) notes. */
function window(n: number, notes: { f: number; pitch: number; len: number; onset?: number }[]) {
  const frames = new Float32Array(n * PITCHES),
    onsets = new Float32Array(n * PITCHES);
  for (const note of notes) {
    const p = note.pitch - MIDI_OFFSET;
    onsets[note.f * PITCHES + p] = note.onset ?? 0.9;
    for (let f = note.f; f < Math.min(n, note.f + note.len); f++) frames[f * PITCHES + p] = 0.8;
  }
  return { frames, onsets };
}

describe("OnsetDecoder", () => {
  it("emits note-on at the onset frame time and note-off after the note fades", () => {
    const d = new OnsetDecoder();
    const w = window(172, [{ f: 20, pitch: 60, len: 30 }]);
    const events = d.decode(w.frames, w.onsets, 172, 0);
    expect(events[0]).toMatchObject({ type: "on", pitch: 60, streamTime: (20 * FFT_HOP) / MODEL_RATE });
    expect(events[0]!.velocity).toBeGreaterThan(60);
    expect(events[1]).toMatchObject({ type: "off", pitch: 60 });
    expect(events[1]!.streamTime).toBeCloseTo((50 * FFT_HOP) / MODEL_RATE, 2);
  });

  it("reports an onset once when overlapping windows both contain it", () => {
    const d = new OnsetDecoder();
    // First window covers stream frames 0..171; the next starts 22 frames later.
    const a = window(172, [{ f: 150, pitch: 64, len: 40 }]);
    const b = window(172, [{ f: 128, pitch: 64, len: 40 }]);
    const first = d.decode(a.frames, a.onsets, 172, 0);
    const second = d.decode(b.frames, b.onsets, 172, 22 * FFT_HOP);
    const ons = [...first, ...second].filter((e) => e.type === "on");
    expect(ons).toHaveLength(1);
    expect(ons[0]!.streamTime).toBeCloseTo((150 * FFT_HOP) / MODEL_RATE, 5);
  });

  it("ignores weak onsets and onsets without a sustained pitch", () => {
    const d = new OnsetDecoder();
    const w = window(172, [
      { f: 10, pitch: 72, len: 20, onset: 0.3 },
      { f: 40, pitch: 74, len: 1 },
    ]);
    expect(d.decode(w.frames, w.onsets, 172, 0).filter((e) => e.type === "on")).toHaveLength(0);
  });

  it("detects the three notes of a chord", () => {
    const d = new OnsetDecoder();
    const w = window(172, [60, 64, 67].map((pitch) => ({ f: 30, pitch, len: 40 })));
    expect(
      d
        .decode(w.frames, w.onsets, 172, 0)
        .filter((e) => e.type === "on")
        .map((e) => e.pitch),
    ).toEqual([60, 64, 67]);
  });
});
