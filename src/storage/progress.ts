import { db } from "./db.ts";

export interface LessonProgress {
  id: string;
  best: number;
  completed: boolean;
  attempts: number;
  updatedAt: number;
}

const key = (id: string) => `lesson:${id}`;

export async function lessonProgress(): Promise<Record<string, LessonProgress>> {
  try {
    const rows = await (await db()).getAll("progress");
    const out: Record<string, LessonProgress> = {};
    for (const r of rows) if (r.key.startsWith("lesson:")) out[r.key.slice(7)] = r.value as LessonProgress;
    return out;
  } catch {
    return {};
  }
}

/** Records one finished attempt; a lesson stays completed once passed. */
export async function recordLessonAttempt(id: string, accuracy: number, passed: boolean): Promise<LessonProgress> {
  const database = await db();
  const prev = (await database.get("progress", key(id)))?.value as LessonProgress | undefined;
  const value: LessonProgress = {
    id,
    best: Math.max(prev?.best ?? 0, accuracy),
    completed: Boolean(prev?.completed) || passed,
    attempts: (prev?.attempts ?? 0) + 1,
    updatedAt: Date.now(),
  };
  await database.put("progress", { key: key(id), value, updatedAt: value.updatedAt });
  return value;
}
