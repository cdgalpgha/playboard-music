import { describe, expect, it } from "vitest";
import { Transport } from "./transport.ts";
import { onsetGroups, WaitGate } from "./practice.ts";
import { buildChart } from "./chart.ts";

function clock() {
  let t = 1000;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("Transport", () => {
  it("advances at the practice rate and pauses", () => {
    const c = clock();
    const tr = new Transport(c.now);
    tr.setRate(0.5);
    tr.play();
    c.advance(2000);
    expect(tr.position()).toBeCloseTo(1);
    tr.pause();
    c.advance(5000);
    expect(tr.position()).toBeCloseTo(1);
    tr.play();
    c.advance(1000);
    expect(tr.position()).toBeCloseTo(1.5);
  });

  it("maps wall time to τ and back", () => {
    const c = clock();
    const tr = new Transport(c.now);
    tr.seek(3);
    tr.play();
    expect(tr.perfAt(4)).toBeCloseTo(2000);
    expect(tr.tauAt(2000)).toBeCloseTo(4);
  });

  it("changes rate without jumping", () => {
    const c = clock();
    const tr = new Transport(c.now);
    tr.play();
    c.advance(1000);
    tr.setRate(2);
    expect(tr.position()).toBeCloseTo(1);
    c.advance(1000);
    expect(tr.position()).toBeCloseTo(3);
  });

  it("wraps a loop and counts passes", () => {
    const c = clock();
    const tr = new Transport(c.now);
    tr.setLoop({ from: 2, to: 4 });
    expect(tr.position()).toBe(2);
    tr.play();
    c.advance(2500);
    expect(tr.chartOf(tr.tauAt())).toEqual({ chart: 2.5, pass: 1 });
    c.advance(2000);
    expect(tr.chartOf(tr.tauAt())).toEqual({ chart: 2.5, pass: 2 });
    expect(tr.tauOfChart(2.5, 2)).toBeCloseTo(tr.tauAt());
  });

  it("splits a look-ahead window at loop boundaries", () => {
    const tr = new Transport(clock().now);
    tr.setLoop({ from: 2, to: 4 });
    expect(tr.segments(3.5, 6.5)).toEqual([
      { chartFrom: 3.5, chartTo: 4, tauOffset: 0, pass: 0 },
      { chartFrom: 2, chartTo: 4, tauOffset: 2, pass: 1 },
      { chartFrom: 2, chartTo: 2.5, tauOffset: 4, pass: 2 },
    ]);
    tr.setLoop(null);
    expect(tr.segments(1, 2)).toEqual([{ chartFrom: 1, chartTo: 2, tauOffset: 0, pass: 0 }]);
  });

  it("holds at a wait point and resumes from it", () => {
    const c = clock();
    const tr = new Transport(c.now);
    tr.play();
    tr.hold(1);
    c.advance(3000);
    expect(tr.position()).toBe(1);
    expect(tr.holding).toBe(true);
    tr.release();
    c.advance(500);
    expect(tr.position()).toBeCloseTo(1.5);
  });
});

describe("WaitGate", () => {
  const chart = buildChart({
    id: "w",
    title: "",
    composer: "",
    notes: [
      { pitch: 60, startBeat: 0, durationBeats: 1, velocity: 80, hand: "R" },
      { pitch: 48, startBeat: 0, durationBeats: 1, velocity: 80, hand: "L" },
      { pitch: 62, startBeat: 1, durationBeats: 1, velocity: 80, hand: "R" },
    ],
    measures: [{ label: "1", startBeat: 0, lengthBeats: 4, beats: 4, beatType: 4 }],
    tempo: [{ beat: 0, bpm: 60 }],
    keyFifths: 0,
    license: { kind: "original", attribution: "" },
  });

  it("groups simultaneous onsets per selected hands", () => {
    expect(onsetGroups(chart.notes, new Set(["L", "R"])).map((g) => g.pitches)).toEqual([[48, 60], [62]]);
    expect(onsetGroups(chart.notes, new Set(["R"])).map((g) => g.pitches)).toEqual([[60], [62]]);
  });

  it("is satisfied only when every pitch of the group is played", () => {
    const gate = new WaitGate(onsetGroups(chart.notes, new Set(["L", "R"])));
    expect(gate.noteOn(60)).toBe("correct");
    expect(gate.satisfied()).toBe(false);
    expect(gate.noteOn(65)).toBe("wrong");
    expect(gate.noteOn(48)).toBe("correct");
    expect(gate.satisfied()).toBe(true);
    gate.next();
    expect(gate.current()?.pitches).toEqual([62]);
    gate.noteOn(62);
    gate.next();
    expect(gate.current()).toBeNull();
    expect({ correct: gate.correct, wrong: gate.wrong, clean: gate.clean }).toEqual({ correct: 3, wrong: 1, clean: 1 });
  });
});
