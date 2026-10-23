/**
 * Builds built-in content: writes MusicXML for every piece and lesson, checks
 * that each file parses back into the expected notes, and writes the catalog.
 *
 * Usage: node scripts/build-content.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOMParser } from "@xmldom/xmldom";
import { writeMusicXml } from "../src/formats/musicxml-writer.ts";
import { parseMusicXml } from "../src/formats/musicxml.ts";
import { PIECES } from "../content/pieces.ts";
import { LESSONS } from "../content/lessons.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "content", "pieces");
mkdirSync(outDir, { recursive: true });

const catalog = PIECES.map((piece) => {
  if (!piece.license?.attribution) throw new Error(`${piece.id}: every item needs a license record`);
  const xml = writeMusicXml(piece.score);
  const chart = parseMusicXml(xml, piece.id, piece.license, DOMParser as never);
  if (!chart.notes.length) throw new Error(`${piece.id}: no notes after parsing`);
  writeFileSync(join(outDir, `${piece.id}.musicxml`), xml);
  console.log(
    `${piece.id}: ${chart.measures.length} measures, ${chart.notes.length} notes, ${chart.duration.toFixed(1)} s`,
  );
  return {
    id: piece.id,
    kind: "piece" as const,
    title: piece.score.title,
    composer: piece.score.composer,
    arranger: piece.score.arranger,
    level: piece.level,
    skills: piece.skills,
    description: piece.description,
    license: piece.license,
    chartUrl: `/content/pieces/${piece.id}.musicxml`,
    measures: chart.measures.length,
    durationSec: Math.round(chart.duration),
  };
});

const catalogPath = join(root, "src", "content", "builtin", "pieces.json");
mkdirSync(dirname(catalogPath), { recursive: true });
writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
console.log(`Wrote ${catalog.length} pieces to ${catalogPath}`);

const lessonDir = join(root, "public", "content", "lessons");
mkdirSync(lessonDir, { recursive: true });
const lessons = LESSONS.map((lesson, order) => {
  if (!lesson.license?.attribution) throw new Error(`${lesson.id}: every lesson needs a license record`);
  let chartUrl: string;
  let measures: number;
  let durationSec: number;
  if (lesson.pieceRef) {
    const piece = catalog.find((p) => p.id === lesson.pieceRef);
    if (!piece) throw new Error(`${lesson.id}: unknown piece ${lesson.pieceRef}`);
    ({ chartUrl, measures, durationSec } = piece);
  } else if (lesson.score) {
    const xml = writeMusicXml(lesson.score);
    const chart = parseMusicXml(xml, lesson.id, lesson.license, DOMParser as never);
    const hands = new Set(chart.notes.map((n) => n.hand));
    for (const h of lesson.practice.hands)
      if (!hands.has(h)) throw new Error(`${lesson.id}: practises hand ${h} but the score has no ${h} notes`);
    writeFileSync(join(lessonDir, `${lesson.id}.musicxml`), xml);
    chartUrl = `/content/lessons/${lesson.id}.musicxml`;
    measures = chart.measures.length;
    durationSec = Math.round(chart.duration);
    console.log(`${lesson.id}: ${measures} measures, ${chart.notes.length} notes`);
  } else throw new Error(`${lesson.id}: needs a score or a pieceRef`);
  const { score: _score, pieceRef: _ref, ...meta } = lesson;
  return { ...meta, order: order + 1, chartUrl, measures, durationSec };
});
const lessonsPath = join(root, "src", "content", "builtin", "lessons.json");
writeFileSync(lessonsPath, JSON.stringify(lessons, null, 2) + "\n");
console.log(`Wrote ${lessons.length} lessons to ${lessonsPath}`);
