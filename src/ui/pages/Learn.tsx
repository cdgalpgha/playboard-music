import { useEffect, useState } from "react";
import { Link } from "react-router";
import { LESSONS } from "@/content/lessons.ts";
import { lessonProgress, type LessonProgress } from "@/storage/progress.ts";
import { PageHeader } from "../controls.tsx";
import { Icon } from "../Icon.tsx";

export default function Learn() {
  const [progress, setProgress] = useState<Record<string, LessonProgress>>({});
  useEffect(() => void lessonProgress().then(setProgress), []);
  const next = LESSONS.find((l) => !progress[l.id]?.completed);
  const units = [...new Set(LESSONS.map((l) => l.unit))];
  const done = LESSONS.filter((l) => progress[l.id]?.completed).length;

  return (
    <div className="pb-12">
      <PageHeader eyebrow="Learn" title="Your learning path">
        Ten lessons from your first note to a piece with both hands: note reading, rhythm, finger numbers, a scale and
        chords. {done ? `${done} of ${LESSONS.length} complete.` : "Start with lesson 1, or jump in wherever you like."}
      </PageHeader>
      <div className="space-y-6 px-4 lg:px-8">
        {units.map((unit) => (
          <section key={unit} aria-labelledby={`unit-${unit}`}>
            <h2 id={`unit-${unit}`} className="eyebrow mb-2">
              {unit}
            </h2>
            <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {LESSONS.filter((l) => l.unit === unit).map((l) => {
                const p = progress[l.id];
                const isNext = next?.id === l.id;
                return (
                  <li key={l.id}>
                    <Link
                      to={`/learn/${l.id}`}
                      className={`card flex h-full gap-3 transition-shadow hover:shadow-md ${isNext ? "ring-2 ring-green/50" : ""}`}
                    >
                      <span
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${
                          p?.completed ? "bg-green text-white" : "bg-sage-soft text-green-dark"
                        }`}
                        aria-hidden="true"
                      >
                        {p?.completed ? <Icon name="check" size={16} /> : l.order}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-bold text-green-dark">
                          {l.title}
                          {p?.completed && <span className="sr-only"> (completed)</span>}
                        </span>
                        <span className="mt-0.5 block text-sm text-ink-soft">{l.summary}</span>
                        <span className="mt-2 block text-xs text-muted">
                          {isNext ? "Up next · " : ""}
                          {p ? `Best ${Math.round(p.best)}% · pass at ${l.pass.accuracy}%` : `Pass at ${l.pass.accuracy}%`}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
