/** Streaks, daily goals and skill stats from finished sessions. Pure; dates are local calendar days. */

export interface SessionLike {
  startedAt: number;
  durationSec: number;
  accuracy: number;
  skills: string[];
}

export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function previousDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return dayKey(new Date(y, m - 1, d - 1, 12).getTime());
}

export function minutesByDay(sessions: SessionLike[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of sessions) out.set(dayKey(s.startedAt), (out.get(dayKey(s.startedAt)) ?? 0) + s.durationSec / 60);
  return out;
}

/** Consecutive days with practice, ending today (or yesterday, if today has none yet). */
export function streak(sessions: SessionLike[], now = Date.now()): { current: number; best: number } {
  const days = new Set(sessions.map((s) => dayKey(s.startedAt)));
  let cursor = dayKey(now);
  if (!days.has(cursor)) cursor = previousDay(cursor);
  let current = 0;
  while (days.has(cursor)) {
    current++;
    cursor = previousDay(cursor);
  }
  const sorted = [...days].sort();
  let best = 0,
    run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && previousDay(sorted[i]!) === sorted[i - 1] ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return { current, best };
}

export function skillStats(sessions: SessionLike[]): { skill: string; sessions: number; accuracy: number; trend: number }[] {
  const by = new Map<string, number[]>();
  for (const s of [...sessions].sort((a, b) => a.startedAt - b.startedAt))
    for (const k of s.skills) by.set(k, [...(by.get(k) ?? []), s.accuracy]);
  return [...by.entries()]
    .map(([skill, acc]) => {
      const recent = acc.slice(-3),
        early = acc.slice(0, 3);
      const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
      return { skill, sessions: acc.length, accuracy: mean(acc), trend: acc.length >= 4 ? mean(recent) - mean(early) : 0 };
    })
    .sort((a, b) => b.sessions - a.sessions);
}
