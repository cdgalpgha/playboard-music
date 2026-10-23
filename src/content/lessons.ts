import type { Hand, LicenseInfo } from "@/core/chart.ts";
import { parseMusicXml } from "@/formats/musicxml.ts";
import data from "./builtin/lessons.json";
import { assertLicensed, type CatalogItem } from "./catalog.ts";

export type LessonStep =
  | { kind: "text"; title: string; body: string }
  | { kind: "keys"; title: string; body: string; notes: number[]; fingers?: number[]; hand: Hand };

export interface Lesson {
  id: string;
  order: number;
  unit: string;
  title: string;
  summary: string;
  skills: string[];
  goals: string[];
  steps: LessonStep[];
  practice: { hands: Hand[]; rate: number; wait: boolean; metronome: boolean; autoplayOther: boolean };
  pass: { accuracy: number };
  license: LicenseInfo;
  chartUrl: string;
  measures: number;
  durationSec: number;
}

export const LESSONS = data as Lesson[];

export function lessonItem(l: Lesson): CatalogItem {
  return assertLicensed({
    id: l.id,
    kind: "lesson",
    title: l.title,
    composer: "",
    level: Math.ceil(l.order / 3),
    skills: l.skills,
    description: l.summary,
    license: l.license,
    chartUrl: l.chartUrl,
    measures: l.measures,
    durationSec: l.durationSec,
  });
}

export async function loadLessonScore(l: Lesson): Promise<{ xml: string; chart: ReturnType<typeof parseMusicXml> }> {
  const response = await fetch(l.chartUrl);
  if (!response.ok) throw new Error(`${l.chartUrl}: HTTP ${response.status}`);
  const xml = await response.text();
  return { xml, chart: parseMusicXml(xml, l.id, l.license) };
}
