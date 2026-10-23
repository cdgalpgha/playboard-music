import { useEffect, useState } from "react";
import { Link } from "react-router";
import { LESSONS } from "@/content/lessons.ts";
import { dayKey, minutesByDay, skillStats, streak } from "@/core/progress-math.ts";
import { db, getSetting, setSetting, type SessionRecord } from "@/storage/db.ts";
import { lessonProgress, type LessonProgress } from "@/storage/progress.ts";
import { PageHeader, Stat } from "../controls.tsx";

const label = (skill: string) => skill.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

export default function Progress() {
  const [sessions, setSessions] = useState<SessionRecord[] | null>(null);
  const [lessons, setLessons] = useState<Record<string, LessonProgress>>({});
  const [goal, setGoal] = useState(10);
  useEffect(() => {
    void (async () => {
      try {
        setSessions(await (await db()).getAllFromIndex("sessions", "byStart"));
      } catch {
        setSessions([]);
      }
      setLessons(await lessonProgress());
      setGoal(await getSetting("dailyGoalMinutes", 10));
    })();
  }, []);
  if (!sessions) return <p className="p-8 text-sm text-muted">Loading…</p>;

  const minutes = minutesByDay(sessions);
  const today = minutes.get(dayKey(Date.now())) ?? 0;
  const st = streak(sessions);
  const skills = skillStats(sessions);
  const days = Array.from({ length: 14 }, (_, i) => dayKey(Date.now() - (13 - i) * 86_400_000));
  const done = LESSONS.filter((l) => lessons[l.id]?.completed).length;
  const recent = [...sessions].reverse().slice(0, 8);

  return (
    <div className="pb-12">
      <PageHeader eyebrow="Progress" title="Your practice">
        Everything here is stored on this device. A session counts when you finish a piece, lesson or loop pass.
      </PageHeader>
      <div className="space-y-4 px-4 lg:px-8">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="card">
            <Stat label="Streak" value={`${st.current} ${st.current === 1 ? "day" : "days"}`} hint={`Best ${st.best}`} />
          </div>
          <div className="card" data-testid="daily-goal">
            <Stat label="Today" value={`${Math.round(today)} / ${goal} min`} hint={today >= goal ? "Daily goal reached" : "Daily goal"} />
            <span className="mt-2 block h-2 overflow-hidden rounded-full bg-line">
              <span className="block h-full bg-green" style={{ width: `${Math.min(100, (today / goal) * 100)}%` }} />
            </span>
          </div>
          <div className="card">
            <Stat label="Lessons" value={`${done} / ${LESSONS.length}`} hint="completed" />
          </div>
          <div className="card">
            <Stat label="Sessions" value={sessions.length} hint={`${Math.round([...minutes.values()].reduce((a, b) => a + b, 0))} min in total`} />
          </div>
        </div>

        <section className="card" aria-labelledby="days-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="days-title" className="text-base font-bold">
              Last 14 days
            </h2>
            <label className="flex items-center gap-2 text-sm">
              Daily goal
              <select
                className="rounded-lg border border-line bg-card px-2 py-1"
                value={goal}
                onChange={(e) => {
                  const g = Number(e.target.value);
                  setGoal(g);
                  void setSetting("dailyGoalMinutes", g);
                }}
              >
                {[5, 10, 15, 20, 30, 45, 60].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ol className="mt-3 flex h-28 items-end gap-1.5" aria-label="Minutes practised per day">
            {days.map((d) => {
              const m = minutes.get(d) ?? 0;
              return (
                <li key={d} className="flex flex-1 flex-col items-center gap-1" aria-label={`${d}: ${Math.round(m)} minutes`}>
                  <span className={`w-full rounded-t ${m >= goal ? "bg-green" : "bg-sage"}`} style={{ height: `${Math.min(100, (m / Math.max(goal, 1)) * 70)}px` }} />
                  <span className="text-[10px] text-muted">{d.slice(8)}</span>
                </li>
              );
            })}
          </ol>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card" aria-labelledby="skills-title">
            <h2 id="skills-title" className="text-base font-bold">
              Skills
            </h2>
            {skills.length ? (
              <ul className="mt-2 space-y-2 text-sm">
                {skills.map((k) => (
                  <li key={k.skill} className="flex items-center gap-3">
                    <span className="w-40 shrink-0">{label(k.skill)}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                      <span className="block h-full bg-green" style={{ width: `${k.accuracy}%` }} />
                    </span>
                    <span className="w-24 text-right text-xs text-muted tabular-nums">
                      {Math.round(k.accuracy)}%{k.trend ? ` · ${k.trend > 0 ? "+" : ""}${Math.round(k.trend)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">
                Finish a <Link to="/learn" className="text-green underline">lesson</Link> or piece to see skill stats.
              </p>
            )}
          </section>
          <section className="card" aria-labelledby="recent-title">
            <h2 id="recent-title" className="text-base font-bold">
              Recent sessions
            </h2>
            <ul className="mt-2 divide-y divide-line text-sm">
              {recent.map((r) => (
                <li key={r.id} className="flex justify-between gap-3 py-1.5">
                  <span>
                    {LESSONS.find((l) => l.id === r.songId)?.title ?? r.songId}
                    <span className="block text-xs text-muted">{new Date(r.startedAt).toLocaleString()}</span>
                  </span>
                  <span className="font-semibold tabular-nums">{Math.round(r.accuracy)}%</span>
                </li>
              ))}
              {!recent.length && <li className="py-1.5 text-muted">No sessions yet.</li>}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
