import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { LESSONS, loadLessonScore, type Lesson } from "@/content/lessons.ts";
import type { Chart } from "@/core/chart.ts";
import { recordLessonAttempt, type LessonProgress } from "@/storage/progress.ts";
import { PageHeader } from "../controls.tsx";
import { Icon } from "../Icon.tsx";
import { KeyDiagram } from "../KeyDiagram.tsx";
import { PracticePlayer, usePracticeSession } from "../practice/PracticePlayer.tsx";
import { SessionSheet } from "../sheet/SessionSheet.tsx";

function LessonPractice({ lesson, chart, xml }: { lesson: Lesson; chart: Chart; xml: string }) {
  const session = usePracticeSession(chart, { kind: "lesson", skills: lesson.skills }, lesson.practice);
  const [outcome, setOutcome] = useState<{ accuracy: number; passed: boolean; progress: LessonProgress } | null>(null);
  const next = LESSONS.find((l) => l.order === lesson.order + 1);

  useEffect(
    () =>
      session.store.subscribe((s, prev) => {
        if (s.status === "finished" && prev.status !== "finished" && s.summary && s.summary.total > 0) {
          const accuracy = s.summary.accuracy;
          const passed = accuracy >= lesson.pass.accuracy;
          void recordLessonAttempt(lesson.id, accuracy, passed).then((progress) => setOutcome({ accuracy, passed, progress }));
        }
        if (s.status === "countin" || s.status === "playing") setOutcome(null);
      }),
    [session, lesson],
  );

  return (
    <div className="space-y-3">
      {outcome && (
        <div
          role="status"
          className={`card flex flex-wrap items-center gap-4 ${outcome.passed ? "border-green bg-sage-soft" : "border-[#f0d2ad] bg-warn-soft"}`}
        >
          <span className="font-display text-2xl font-bold tabular-nums">{Math.round(outcome.accuracy)}%</span>
          <span className="flex-1 text-sm">
            {outcome.passed
              ? `Lesson complete. Best so far ${Math.round(outcome.progress.best)}%.`
              : `Aim for ${lesson.pass.accuracy}%. Try a slower tempo, loop a weak spot, or turn on Wait for me.`}
          </span>
          {outcome.passed && next && (
            <Link to={`/learn/${next.id}`} className="btn-primary">
              Next: {next.title} <Icon name="arrow" size={16} />
            </Link>
          )}
          {outcome.passed && !next && (
            <Link to="/pieces" className="btn-primary">
              Path complete · practise more pieces <Icon name="arrow" size={16} />
            </Link>
          )}
        </div>
      )}
      <PracticePlayer chart={chart} session={session} above={<SessionSheet session={session} xml={xml} />} />
      <p className="text-xs text-muted">{lesson.license.attribution}</p>
    </div>
  );
}

export default function LessonPage() {
  const { id = "" } = useParams();
  const lesson = LESSONS.find((l) => l.id === id);
  const [score, setScore] = useState<{ xml: string; chart: Chart } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!lesson) return;
    let cancelled = false;
    setScore(null);
    loadLessonScore(lesson).then(
      (s) => !cancelled && setScore(s),
      (e: Error) => !cancelled && setError(e.message),
    );
    return () => {
      cancelled = true;
    };
  }, [lesson]);

  if (!lesson)
    return (
      <PageHeader eyebrow="Learn" title="Lesson not found">
        <Link to="/learn" className="text-green underline">
          Back to the learning path
        </Link>
      </PageHeader>
    );

  return (
    <div className="pb-12">
      <PageHeader eyebrow={`Lesson ${lesson.order} of ${LESSONS.length} · ${lesson.unit}`} title={lesson.title}>
        {lesson.summary}
      </PageHeader>
      <div className="space-y-4 px-4 lg:px-8">
        <section className="grid gap-4 lg:grid-cols-3" aria-label="Lesson steps">
          <div className="card">
            <h2 className="text-base font-bold">In this lesson</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-ink-soft">
              {lesson.goals.map((g) => (
                <li key={g} className="flex gap-2">
                  <Icon name="check" size={16} className="mt-0.5 text-green" />
                  {g}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">Pass with {lesson.pass.accuracy}% or more.</p>
          </div>
          {lesson.steps.map((step, i) => (
            <article key={i} className="card space-y-2">
              <h2 className="text-base font-bold">{step.title}</h2>
              <p className="text-sm leading-relaxed text-ink-soft">{step.body}</p>
              {step.kind === "keys" && <KeyDiagram notes={step.notes} fingers={step.fingers} hand={step.hand} />}
            </article>
          ))}
        </section>
        {error && <p className="text-bad">{error}</p>}
        {score && <LessonPractice key={lesson.id} lesson={lesson} chart={score.chart} xml={score.xml} />}
      </div>
    </div>
  );
}
