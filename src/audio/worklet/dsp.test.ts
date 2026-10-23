import { describe, expect, it } from "vitest";
import { SamplerCore, layerTargetDb, velocityCurve, FIRST_UNDAMPED_KEY } from "./dsp.ts";
import type { SamplerLayout } from "./protocol.ts";

const SR = 48000;

function tone(freq: number, seconds: number, amp = 0.5): Int16Array {
  const out = new Int16Array(Math.round(seconds * SR));
  for (let i = 0; i < out.length; i++) out[i] = Math.round(Math.sin((2 * Math.PI * freq * i) / SR) * amp * 32767);
  return out;
}

/** Two layers at C4 (60) and one at A4 (69); hammer release for 60; pedal samples. */
function makeCore(): SamplerCore {
  const core = new SamplerCore(SR);
  const layout: SamplerLayout = {
    notes: [
      { id: 1, root: 60, lokey: 59, hikey: 61, lovel: 1, hivel: 64, rmsDb: -26 },
      { id: 2, root: 60, lokey: 59, hikey: 61, lovel: 65, hivel: 127, rmsDb: -14 },
      { id: 3, root: 69, lokey: 68, hikey: 70, lovel: 1, hivel: 127, rmsDb: -20 },
      { id: 4, root: 96, lokey: 95, hikey: 97, lovel: 1, hivel: 127, rmsDb: -20 },
    ],
    releases: [{ id: 10, key: 60 }],
    harmonics: [],
    pedal: [
      { id: 20, down: true },
      { id: 21, down: false },
    ],
  };
  core.post({ type: "layout", layout }, 0);
  core.post({ type: "pcm", id: 1, left: tone(261.63, 2, 0.05), right: null }, 0);
  core.post({ type: "pcm", id: 2, left: tone(261.63, 2, 0.2), right: tone(261.63, 2, 0.2) }, 0);
  core.post({ type: "pcm", id: 3, left: tone(440, 2, 0.1), right: null }, 0);
  core.post({ type: "pcm", id: 4, left: tone(2093, 2, 0.1), right: null }, 0);
  core.post({ type: "pcm", id: 10, left: tone(100, 0.3, 0.3), right: null }, 0);
  core.post({ type: "pcm", id: 20, left: tone(80, 0.3, 0.3), right: null }, 0);
  core.post({ type: "pcm", id: 21, left: tone(80, 0.3, 0.3), right: null }, 0);
  core.params.resonance = 0;
  return core;
}

function run(core: SamplerCore, frame: number, blocks: number) {
  const L = new Float32Array(128),
    R = new Float32Array(128);
  let energy = 0,
    peak = 0;
  for (let b = 0; b < blocks; b++) {
    core.render(L, R, frame + b * 128);
    for (let i = 0; i < 128; i++) {
      energy += L[i]! * L[i]! + R[i]! * R[i]!;
      peak = Math.max(peak, Math.abs(L[i]!), Math.abs(R[i]!));
    }
  }
  return { energy, peak, next: frame + blocks * 128, L, R };
}

describe("SamplerCore", () => {
  it("is silent with no notes and sounds after note-on", () => {
    const core = makeCore();
    expect(run(core, 0, 4).energy).toBe(0);
    core.post({ type: "noteOn", note: 60, velocity: 100 }, 512);
    expect(run(core, 512, 4).energy).toBeGreaterThan(0.1);
    expect(core.activeVoices().notes).toBe(1);
  });

  it("starts a scheduled note on its exact frame inside a block", () => {
    const core = makeCore();
    let started = -1;
    core.onStarted = (_probe, frame) => (started = frame);
    core.post({ type: "noteOn", note: 60, velocity: 100, when: 200 / SR, probe: 7 }, 128);
    const L = new Float32Array(128),
      R = new Float32Array(128);
    core.render(L, R, 128);
    expect(started).toBe(200);
    // Frames before the start offset (72) stay silent; the next sine sample is non-zero.
    expect(L.slice(0, 72).every((x) => x === 0)).toBe(true);
    expect(L[73]).not.toBe(0);
  });

  it("keeps a released note ringing while the pedal is down, damps on pedal up", () => {
    const core = makeCore();
    core.post({ type: "pedal", value: 127 }, 0);
    core.post({ type: "noteOn", note: 60, velocity: 90 }, 0);
    run(core, 0, 10);
    core.post({ type: "noteOff", note: 60 }, 1280);
    const held = run(core, 1280, 40);
    expect(core.activeVoices().notes).toBe(1);
    core.post({ type: "pedal", value: 0 }, held.next);
    // Damper falls: after ~2 s the voice is gone.
    run(core, held.next, Math.ceil((2 * SR) / 128));
    expect(core.activeVoices().notes).toBe(0);
  });

  it("damps on note-off without pedal and plays the hammer release sample", () => {
    const core = makeCore();
    core.post({ type: "noteOn", note: 60, velocity: 90 }, 0);
    run(core, 0, 4);
    core.post({ type: "noteOff", note: 60 }, 512);
    run(core, 512, 1);
    expect(core.activeVoices().aux).toBe(1);
  });

  it("lets undamped treble keys ring after note-off", () => {
    const core = makeCore();
    core.post({ type: "noteOn", note: 96, velocity: 90 }, 0);
    run(core, 0, 4);
    expect(96).toBeGreaterThanOrEqual(FIRST_UNDAMPED_KEY);
    core.post({ type: "noteOff", note: 96 }, 512);
    run(core, 512, 200);
    expect(core.activeVoices().notes).toBe(1);
  });

  it("plays pedal mechanism samples on pedal transitions only", () => {
    const core = makeCore();
    core.post({ type: "pedal", value: 100 }, 0);
    core.post({ type: "pedal", value: 110 }, 0);
    run(core, 0, 1);
    expect(core.activeVoices().aux).toBe(1);
  });

  it("selects the velocity layer and keeps loudness monotonic across the layer split", () => {
    const peaks: number[] = [];
    for (const vel of [40, 60, 64, 65, 70, 100, 127]) {
      const core = makeCore();
      core.post({ type: "noteOn", note: 60, velocity: vel }, 0);
      peaks.push(run(core, 0, 20).peak);
    }
    for (let i = 1; i < peaks.length; i++) expect(peaks[i]!).toBeGreaterThan(peaks[i - 1]!);
    // No jump at the 64/65 boundary larger than 1 dB.
    expect(20 * Math.log10(peaks[3]! / peaks[2]!)).toBeLessThan(1);
  });

  it("re-striking a key fades the previous voice", () => {
    const core = makeCore();
    core.post({ type: "pedal", value: 127 }, 0);
    core.post({ type: "noteOn", note: 60, velocity: 90 }, 0);
    core.post({ type: "noteOff", note: 60 }, 0);
    core.post({ type: "noteOn", note: 60, velocity: 90 }, 0);
    run(core, 0, Math.ceil((0.6 * SR) / 128));
    expect(core.activeVoices().notes).toBe(1);
  });

  it("caps polyphony at 96 voices by stealing", () => {
    const core = makeCore();
    core.post({ type: "pedal", value: 127 }, 0);
    let frame = 0;
    for (let i = 0; i < 120; i++) {
      core.post({ type: "noteOn", note: 59 + (i % 3), velocity: 30 + (i % 90) }, frame);
      core.post({ type: "noteOff", note: 59 + (i % 3) }, frame);
      // Fresh key each time so re-strike fading does not hide the cap.
      core.post({ type: "noteOn", note: 68 + (i % 3), velocity: 80 }, frame);
      frame = run(core, frame, 1).next;
    }
    expect(core.activeVoices().notes).toBeLessThanOrEqual(96);
  });

  it("borrows the nearest loaded zone while a key's own zone is loading", () => {
    const core = makeCore();
    core.post({ type: "noteOn", note: 64, velocity: 90 }, 0);
    expect(run(core, 0, 4).energy).toBeGreaterThan(0);
  });

  it("all-notes-off silences everything quickly", () => {
    const core = makeCore();
    for (const n of [59, 60, 61, 68, 69]) core.post({ type: "noteOn", note: n, velocity: 100 }, 0);
    run(core, 0, 4);
    core.post({ type: "allOff" }, 512);
    run(core, 512, Math.ceil((0.15 * SR) / 128));
    expect(core.activeVoices()).toEqual({ notes: 0, aux: 0 });
  });

  it("pedal resonance stays bounded and decays after pedal up", () => {
    const core = makeCore();
    core.params.resonance = 1;
    core.post({ type: "pedal", value: 127 }, 0);
    for (const n of [59, 60, 61, 68, 69, 70]) core.post({ type: "noteOn", note: n, velocity: 127 }, 0);
    const loud = run(core, 0, Math.ceil(SR / 128));
    expect(loud.peak).toBeLessThan(1.0001);
    core.post({ type: "allOff" }, loud.next);
    core.post({ type: "pedal", value: 0 }, loud.next);
    const after = run(core, loud.next, Math.ceil(SR / 128));
    const tail = run(core, after.next, 20);
    expect(tail.peak).toBeLessThan(1e-3);
  });
});

describe("velocity helpers", () => {
  it("interpolates and extrapolates layer levels", () => {
    const layers = [
      { lovel: 1, hivel: 63, rmsDb: -30 },
      { lovel: 64, hivel: 127, rmsDb: -12 },
    ];
    expect(layerTargetDb(layers, 32)).toBeCloseTo(-30, 5);
    expect(layerTargetDb(layers, 95.5)).toBeCloseTo(-12, 5);
    expect(layerTargetDb(layers, 64)).toBeGreaterThan(-30);
    expect(layerTargetDb(layers, 64)).toBeLessThan(-12);
    expect(layerTargetDb(layers, 1)).toBeLessThan(-30);
  });

  it("velocity curve is 1 at full velocity and falls with dynamics", () => {
    expect(velocityCurve(127, 0.6)).toBeCloseTo(1);
    expect(velocityCurve(40, 0.6)).toBeLessThan(velocityCurve(80, 0.6));
    expect(velocityCurve(40, 0)).toBe(1);
  });
});
