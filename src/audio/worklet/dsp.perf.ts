import { describe, expect, it } from "vitest";
import { SamplerCore } from "./dsp.ts";
import type { SamplerLayout } from "./protocol.ts";

const SR = 48000;
const BLOCK_BUDGET_MS = (128 / SR) * 1000;

function pianoLikeCore(): SamplerCore {
  const core = new SamplerCore(SR);
  const roots = [21, ...Array.from({ length: 28 }, (_, i) => 24 + i * 3), 108];
  const notes: SamplerLayout["notes"] = [];
  let id = 1;
  for (const root of roots)
    for (const [lovel, hivel] of [
      [1, 44],
      [45, 72],
      [73, 100],
      [101, 127],
    ] as const)
      notes.push({ id: id++, root, lokey: root - 1, hikey: root + 1, lovel, hivel, rmsDb: -20 });
  core.post({ type: "layout", layout: { notes, releases: [], harmonics: [], pedal: [] } }, 0);
  const pcm = new Int16Array(SR * 10);
  for (let i = 0; i < pcm.length; i++) pcm[i] = (Math.sin(i * 0.03) * 8000) | 0;
  for (const z of notes) core.post({ type: "pcm", id: z.id, left: pcm, right: pcm.slice() }, 0);
  return core;
}

/**
 * Ten fingers striking a new chord every 200 ms with the pedal held, walking
 * across all 88 keys so sustained voices accumulate until the pool is full.
 */
function stress(core: SamplerCore, blocks: number): number[] {
  const L = new Float32Array(128),
    R = new Float32Array(128);
  const times: number[] = [];
  core.post({ type: "pedal", value: 127 }, 0);
  let chord = 0;
  for (let b = 0; b < blocks; b++) {
    const frame = b * 128;
    if (b % 75 === 0) {
      for (let finger = 0; finger < 10; finger++) {
        const note = 21 + ((chord * 37 + finger * 9) % 88);
        core.post({ type: "noteOn", note, velocity: 40 + ((chord * 13 + finger * 7) % 87) }, frame);
        core.post({ type: "noteOff", note, when: (frame + 9000) / SR }, frame);
      }
      chord++;
    }
    const t0 = performance.now();
    core.render(L, R, frame);
    times.push(performance.now() - t0);
  }
  return times;
}

describe("sampler render cost", () => {
  it("renders a block well inside the real-time budget with the pool full", () => {
    const loaded = pianoLikeCore();
    const times = stress(loaded, 8000).slice(1000).sort((a, b) => a - b);
    const p = (q: number) => times[Math.floor(q * (times.length - 1))]!;
    console.log(
      `[perf] active voices=${loaded.activeVoices().notes} steals=${loaded.steals} ` +
        `budget=${BLOCK_BUDGET_MS.toFixed(3)} ms median=${p(0.5).toFixed(3)} ` +
        `p99=${p(0.99).toFixed(3)} max=${p(1).toFixed(3)} ms ` +
        `(median ${((p(0.5) / BLOCK_BUDGET_MS) * 100).toFixed(1)}% of budget)`,
    );
    expect(p(0.99)).toBeLessThan(BLOCK_BUDGET_MS);
  });
});
