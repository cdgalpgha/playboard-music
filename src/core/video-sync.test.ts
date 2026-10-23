import { describe, expect, it } from "vitest";
import { VideoClock } from "./video-clock.ts";
import { SyncMap } from "./sync-map.ts";

/**
 * A simulated player whose reported time is refreshed about every `updateMs`
 * (with jitter and a phase unrelated to our polls), like a postMessage bridge.
 */
function simulatedPlayer(updateMs: number, interpolates: boolean, rate = 1) {
  let seed = 12345;
  const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let nextUpdate = 37;
  let lastUpdatePerf = 0;
  let reported = 0;
  return {
    truth: (perf: number) => (perf / 1000) * rate,
    poll(perf: number): number {
      while (perf >= nextUpdate) {
        lastUpdatePerf = nextUpdate;
        reported = (lastUpdatePerf / 1000) * rate;
        nextUpdate += updateMs * (0.8 + 0.4 * random());
      }
      return interpolates ? reported + ((perf - lastUpdatePerf) / 1000) * rate : reported;
    },
  };
}

function track(clock: VideoClock, player: ReturnType<typeof simulatedPlayer>, rate = 1, seconds = 20) {
  const errors: number[] = [];
  // Poll every 100 ms; render every 16.7 ms.
  for (let perf = 0; perf <= seconds * 1000; perf += 1000 / 60) {
    if (Math.floor(perf / 100) !== Math.floor((perf - 1000 / 60) / 100))
      clock.observe({ time: player.poll(perf), rate, playing: true }, perf);
    if (perf > 5000) errors.push(clock.time(perf) - player.truth(perf));
  }
  const mean = errors.reduce((a, b) => a + b, 0) / errors.length;
  const max = Math.max(...errors.map(Math.abs));
  return { meanMs: mean * 1000, maxMs: max * 1000 };
}

describe("VideoClock", () => {
  it("tracks a player that interpolates its own time", () => {
    const clock = new VideoClock();
    clock.observe({ time: 0, rate: 1, playing: false }, 0);
    const r = track(clock, simulatedPlayer(250, true));
    expect(Math.abs(r.meanMs)).toBeLessThan(5);
    expect(r.maxMs).toBeLessThan(10);
    expect(clock.sourceInterpolates).toBe(true);
  });

  it("removes the bias of a stale, coarse player", () => {
    const clock = new VideoClock();
    clock.observe({ time: 0, rate: 1, playing: false }, 0);
    const r = track(clock, simulatedPlayer(250, false));
    expect(clock.sourceInterpolates).toBe(false);
    // Naive use of the stale value would lag by ~125 ms on average.
    expect(Math.abs(r.meanMs)).toBeLessThan(15);
    expect(r.maxMs).toBeLessThan(60);
  });

  it("follows the playback rate", () => {
    const clock = new VideoClock();
    clock.observe({ time: 0, rate: 0.5, playing: false }, 0);
    const r = track(clock, simulatedPlayer(250, true, 0.5), 0.5);
    expect(Math.abs(r.meanMs)).toBeLessThan(5);
  });

  it("snaps on seeks and bumps the generation", () => {
    const clock = new VideoClock();
    clock.observe({ time: 10, rate: 1, playing: true }, 0);
    const g = clock.generation;
    clock.observe({ time: 10.1, rate: 1, playing: true }, 100);
    expect(clock.generation).toBe(g);
    clock.observe({ time: 42, rate: 1, playing: true }, 200);
    expect(clock.generation).toBe(g + 1);
    expect(clock.time(200)).toBeCloseTo(42);
  });

  it("holds still while paused and corrects small errors by only a few milliseconds", () => {
    const clock = new VideoClock();
    clock.observe({ time: 5, rate: 1, playing: false }, 0);
    expect(clock.time(1000)).toBe(5);
    clock.observe({ time: 5, rate: 1, playing: true }, 1000);
    const a = clock.time(1500);
    clock.observe({ time: 5.45, rate: 1, playing: true }, 1500);
    // A 50 ms error is slewed in gradually: the step back is a few ms, not 50.
    expect(clock.time(1500)).toBeGreaterThan(a - 0.01);
  });

  it("predicts wall time for a future video time", () => {
    const clock = new VideoClock();
    clock.observe({ time: 2, rate: 2, playing: true }, 1000);
    expect(clock.perfAt(4)).toBeCloseTo(2000);
  });
});

describe("SyncMap", () => {
  it("is the identity with no anchors, and shifts by the offset", () => {
    const m = new SyncMap();
    expect(m.videoToChart(12)).toBe(12);
    const late = m.withOffset(250);
    expect(late.videoToChart(12)).toBeCloseTo(11.75);
    expect(late.chartToVideo(11.75)).toBeCloseTo(12);
  });

  it("uses one anchor as a start point at slope 1", () => {
    const m = new SyncMap([{ videoSec: 7.5, chartSec: 0 }]);
    expect(m.videoToChart(7.5)).toBe(0);
    expect(m.videoToChart(10)).toBeCloseTo(2.5);
    expect(m.chartToVideo(1)).toBeCloseTo(8.5);
  });

  it("interpolates between anchors and extrapolates the edge slopes", () => {
    const m = new SyncMap([
      { videoSec: 10, chartSec: 0 },
      { videoSec: 20, chartSec: 8 },
      { videoSec: 30, chartSec: 20 },
    ]);
    expect(m.videoToChart(15)).toBeCloseTo(4);
    expect(m.videoToChart(25)).toBeCloseTo(14);
    expect(m.videoToChart(5)).toBeCloseTo(-4);
    expect(m.videoToChart(35)).toBeCloseTo(26);
    for (const c of [-3, 0, 4, 8, 13, 20, 27]) expect(m.videoToChart(m.chartToVideo(c))).toBeCloseTo(c, 9);
    expect(m.slopeAt(15)).toBeCloseTo(0.8);
  });

  it("drops anchors that would make the map non-invertible", () => {
    const m = new SyncMap([
      { videoSec: 10, chartSec: 5 },
      { videoSec: 12, chartSec: 4 },
      { videoSec: 14, chartSec: 7 },
    ]);
    expect(m.anchors.map((a) => a.chartSec)).toEqual([5, 7]);
  });

  it("fits tapped beats to a tempo and offset", () => {
    // The video plays the chart 10% slower and starts 3 s in; taps jitter by ±20 ms.
    const beats = Array.from({ length: 8 }, (_, i) => i * 0.5);
    const jitter = [0.02, -0.01, 0.015, -0.02, 0.0, 0.01, -0.015, 0.02];
    const taps = beats.map((b, i) => 3 + b * 1.1 + jitter[i]!);
    const m = new SyncMap().withTaps(taps, beats)!;
    expect(m.videoToChart(3)).toBeCloseTo(0, 1);
    expect(m.slopeAt(4)).toBeCloseTo(1 / 1.1, 1);
    expect(new SyncMap().withTaps([1, 2], [0, 1])).toBeNull();
  });

  it("moves a fitted map with a new start point, keeping its tempo", () => {
    const m = new SyncMap([
      { videoSec: 10, chartSec: 0 },
      { videoSec: 30, chartSec: 10 },
    ]).withStart(12, 0);
    expect(m.videoToChart(12)).toBeCloseTo(0);
    expect(m.slopeAt(20)).toBeCloseTo(0.5);
  });
});
