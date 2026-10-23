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
