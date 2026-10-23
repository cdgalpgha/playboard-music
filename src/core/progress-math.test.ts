import { describe, expect, it } from "vitest";
import { minutesByDay, skillStats, streak } from "./progress-math.ts";

const day = (d: number, h = 18) => new Date(2026, 9, d, h).getTime();
const s = (d: number, min = 10, accuracy = 80, skills = ["rhythm"]) => ({ startedAt: day(d), durationSec: min * 60, accuracy, skills });

describe("progress math", () => {
  it("counts a streak ending today or yesterday", () => {
    const list = [s(20), s(21), s(22)];
    expect(streak(list, day(22, 20))).toEqual({ current: 3, best: 3 });
    expect(streak(list, day(23, 9)).current).toBe(3);
    expect(streak(list, day(24, 9)).current).toBe(0);
  });

  it("finds the best streak across gaps and month ends", () => {
    const list = [s(1), s(2), s(5), s(6), s(7), s(8)];
    expect(streak(list, day(20)).best).toBe(4);
    const across = [new Date(2026, 8, 30, 12).getTime(), new Date(2026, 9, 1, 12).getTime()].map((t) => ({ startedAt: t, durationSec: 60, accuracy: 1, skills: [] }));
    expect(streak(across, new Date(2026, 9, 1, 20).getTime()).current).toBe(2);
  });

  it("sums minutes per day and skill accuracy with trend", () => {
    expect(minutesByDay([s(3, 5), s(3, 7)]).get("2026-10-03")).toBeCloseTo(12);
    const stats = skillStats([s(1, 5, 50), s(2, 5, 60), s(3, 5, 70), s(4, 5, 80), s(5, 5, 90, ["chords"])]);
    expect(stats[0]).toMatchObject({ skill: "rhythm", sessions: 4, accuracy: 65 });
    expect(stats[0]!.trend).toBeCloseTo(10);
  });
});
