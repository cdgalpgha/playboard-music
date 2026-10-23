/**
 * MusicXML (score-partwise) → Chart.
 *
 * Supported: multiple parts and staves, divisions changes, backup/forward,
 * chords, ties, grace notes (skipped), fingering, dynamics and <sound dynamics>,
 * tempo from <sound tempo> or <metronome>, repeats with volta endings.
 * Not supported: D.C./D.S./coda jumps (played straight through), timewise files.
 */
import { buildChart, type Chart, type Hand, type LicenseInfo, type RawMeasure, type RawNote, type RawScore } from "../core/chart.ts";
import type { TempoPoint } from "../core/tempo-map.ts";
import { DYNAMIC_VELOCITY } from "./musicxml-writer.ts";

type DOMParserCtor = new () => { parseFromString(s: string, type: string): Document };

const STEP_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const DEFAULT_VELOCITY = 80;

function kids(el: Element, name?: string): Element[] {
  const out: Element[] = [];
  const nodes = el.childNodes;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i] as Element;
    if (n.nodeType === 1 && (!name || n.tagName === name)) out.push(n);
  }
  return out;
}
const child = (el: Element, name: string) => kids(el, name)[0];
const text = (el: Element | undefined, name: string) => (el ? child(el, name)?.textContent?.trim() : undefined);
const num = (el: Element | undefined, name: string) => {
  const t = text(el, name);
  return t === undefined || t === "" ? undefined : Number(t);
};

interface ParsedNote {
  offset: number; // quarter beats from the measure start
  duration: number;
  pitch: number;
  staff: number;
  tieStart: boolean;
  tieStop: boolean;
  finger?: number;
  velocity: number;
}

interface ParsedMeasure {
  label: string;
  length: number; // quarter beats actually filled
  beats: number;
  beatType: number;
  notes: ParsedNote[];
  tempos: { offset: number; bpm: number }[];
  forward: boolean;
  backward: boolean;
  times: number;
  ending: number[] | null;
}

interface PartInfo {
  measures: ParsedMeasure[];
  staves: number;
  clef: string;
}

const BEAT_UNIT_QUARTERS: Record<string, number> = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  "16th": 0.25,
};

function parsePart(part: Element, keyOut: { fifths: number | null }): PartInfo {
  let divisions = 1;
  let beats = 4,
    beatType = 4;
  let staves = 1;
  let clef = "G";
  // Velocity state: per staff, with a part-wide default.
  const staffVelocity = new Map<number, number>();
  let partVelocity = DEFAULT_VELOCITY;
  const velocityFor = (staff: number) => staffVelocity.get(staff) ?? partVelocity;
  let openEnding: number[] | null = null;
  const measures: ParsedMeasure[] = [];

  for (const m of kids(part, "measure")) {
    let cursor = 0,
      maxCursor = 0,
      lastStart = 0;
    const pm: ParsedMeasure = {
      label: m.getAttribute("number") ?? String(measures.length + 1),
      length: 0,
      beats,
      beatType,
      notes: [],
      tempos: [],
      forward: false,
      backward: false,
      times: 2,
      ending: openEnding,
    };
    const advance = (d: number) => {
      cursor += d;
      maxCursor = Math.max(maxCursor, cursor);
    };
    for (const el of kids(m)) {
      switch (el.tagName) {
        case "attributes": {
          const div = num(el, "divisions");
          if (div) divisions = div;
          const time = child(el, "time");
          if (time) {
            beats = Number(text(time, "beats")?.split("+").reduce((a, b) => a + Number(b), 0) ?? beats) || beats;
            beatType = num(time, "beat-type") ?? beatType;
            pm.beats = beats;
            pm.beatType = beatType;
          }
          const key = child(el, "key");
          if (key && keyOut.fifths === null) keyOut.fifths = num(key, "fifths") ?? 0;
          staves = num(el, "staves") ?? staves;
          const c = child(el, "clef");
          if (c && (c.getAttribute("number") ?? "1") === "1") clef = text(c, "sign") ?? clef;
          break;
        }
        case "direction":
        case "sound": {
          const sound = el.tagName === "sound" ? el : child(el, "sound");
          const offset = cursor / divisions + (num(el, "offset") ?? 0) / divisions;
          const tempo = sound?.getAttribute("tempo");
          let bpm = tempo ? Number(tempo) : NaN;
          if (!Number.isFinite(bpm) && el.tagName === "direction") {
            const metro = el.getElementsByTagName("metronome")[0];
            const unit = text(metro, "beat-unit");
            const perMinute = num(metro, "per-minute");
            if (unit && perMinute) {
              const dotted = metro ? kids(metro, "beat-unit-dot").length > 0 : false;
              bpm = perMinute * (BEAT_UNIT_QUARTERS[unit] ?? 1) * (dotted ? 1.5 : 1);
            }
          }
          if (Number.isFinite(bpm) && bpm > 0) pm.tempos.push({ offset, bpm });
          const staffText = text(el, "staff");
          let velocity: number | undefined;
          const soundDyn = sound?.getAttribute("dynamics");
          if (soundDyn) velocity = (Number(soundDyn) / 100) * 90;
          else if (el.tagName === "direction") {
            const dyn = el.getElementsByTagName("dynamics")[0];
            const mark = dyn ? kids(dyn)[0]?.tagName : undefined;
            if (mark && mark in DYNAMIC_VELOCITY) velocity = DYNAMIC_VELOCITY[mark];
          }
          if (velocity !== undefined) {
            const v = Math.max(1, Math.min(127, Math.round(velocity)));
            if (staffText) staffVelocity.set(Number(staffText), v);
            else {
              partVelocity = v;
              staffVelocity.clear();
            }
          }
          break;
        }
        case "backup":
          cursor = Math.max(0, cursor - (num(el, "duration") ?? 0));
          break;
        case "forward":
          advance(num(el, "duration") ?? 0);
          break;
        case "note": {
          if (child(el, "grace") || child(el, "cue")) break;
          const duration = num(el, "duration") ?? 0;
          const isChord = Boolean(child(el, "chord"));
          const start = isChord ? lastStart : cursor;
          if (!isChord) {
            lastStart = cursor;
            advance(duration);
          }
          const pitchEl = child(el, "pitch");
          if (!pitchEl || child(el, "rest")) break;
          const step = text(pitchEl, "step") ?? "C";
          const pitch = (num(pitchEl, "octave") ?? 4) * 12 + 12 + (STEP_PC[step] ?? 0) + Math.round(num(pitchEl, "alter") ?? 0);
          const staff = num(el, "staff") ?? 1;
          const ties = kids(el, "tie").map((t) => t.getAttribute("type"));
          const fingering = el.getElementsByTagName("fingering")[0]?.textContent?.trim();
          const noteDyn = el.getAttribute("dynamics");
          pm.notes.push({
            offset: start / divisions,
            duration: duration / divisions,
            pitch,
            staff,
            tieStart: ties.includes("start"),
            tieStop: ties.includes("stop"),
            ...(fingering && /^\d/.test(fingering) ? { finger: Number(fingering[0]) } : {}),
            velocity: noteDyn ? Math.max(1, Math.min(127, Math.round((Number(noteDyn) / 100) * 90))) : velocityFor(staff),
          });
          break;
        }
        case "barline": {
          const repeat = child(el, "repeat");
          if (repeat?.getAttribute("direction") === "forward") pm.forward = true;
          if (repeat?.getAttribute("direction") === "backward") {
            pm.backward = true;
            pm.times = Number(repeat.getAttribute("times") ?? 2) || 2;
          }
          const ending = child(el, "ending");
          if (ending) {
            const type = ending.getAttribute("type");
            const numbers = (ending.getAttribute("number") ?? "1")
              .split(/[,\s]+/)
              .filter(Boolean)
              .map(Number);
            if (type === "start") {
              openEnding = numbers;
              pm.ending = numbers;
            } else openEnding = null;
          }
          break;
        }
      }
    }
    pm.length = maxCursor / divisions;
    measures.push(pm);
  }
  return { measures, staves, clef };
}

/** Playback order of measure indices after expanding repeats and voltas. */
export function playbackOrder(measures: Pick<ParsedMeasure, "forward" | "backward" | "times" | "ending">[]): number[] {
  const order: number[] = [];
  const backCount = new Map<number, number>();
  let repeatStart = 0;
  let pass = 1;
  let i = 0;
  while (i < measures.length && order.length < measures.length * 16) {
    const m = measures[i]!;
    if (m.forward && repeatStart !== i) {
      repeatStart = i;
      pass = 1;
    }
    if (m.ending && !m.ending.includes(pass)) {
      i++;
      continue;
    }
    order.push(i);
    if (m.backward) {
      const count = backCount.get(i) ?? 1;
      if (count < m.times) {
        backCount.set(i, count + 1);
        pass = count + 1;
        i = repeatStart;
        continue;
      }
      pass = 1;
      repeatStart = i + 1;
    }
    i++;
  }
  return order;
}

export interface MusicXmlMeta {
  title: string;
  composer: string;
  rights: string;
}

export function readMusicXmlMeta(doc: Document): MusicXmlMeta {
  const root = doc.documentElement;
  const work = child(root, "work");
  const ident = child(root, "identification");
  const composer = ident ? kids(ident, "creator").find((c) => c.getAttribute("type") === "composer") : undefined;
  return {
    title: text(work, "work-title") || text(root, "movement-title") || "Untitled",
    composer: composer?.textContent?.trim() ?? "",
    rights: text(ident, "rights") ?? "",
  };
}

export function parseMusicXmlDocument(doc: Document, id: string, license: LicenseInfo): Chart {
  return buildChart({ ...parseMusicXmlRaw(doc), id, license });
}

export function parseMusicXmlRaw(doc: Document): RawScore {
  const root = doc.documentElement;
  if (!root || root.tagName !== "score-partwise")
    throw new Error(
      root?.tagName === "score-timewise"
        ? "Timewise MusicXML is not supported. Export as partwise MusicXML."
        : "This file is not MusicXML (score-partwise).",
    );
  const keyOut = { fifths: null as number | null };
  const parts = kids(root, "part").map((p) => parsePart(p, keyOut));
  const first = parts[0];
  if (!first || !first.measures.length) throw new Error("The MusicXML file has no measures.");

  // Hands: a part with two staves is a grand staff (staff 1 right, staff 2 left).
  // Two single-staff parts are treated as right and left; otherwise the clef decides.
  const singleStaffParts = parts.filter((p) => p.staves < 2).length;
  const handFor = (partIndex: number, staff: number): Hand => {
    const part = parts[partIndex]!;
    if (part.staves >= 2) return staff >= 2 ? "L" : "R";
    if (parts.length === 2 && singleStaffParts === 2) return partIndex === 0 ? "R" : "L";
    return part.clef === "F" ? "L" : "R";
  };

  const order = playbackOrder(first.measures);
  const rawMeasures: RawMeasure[] = [];
  const notes: RawNote[] = [];
  const tempo: TempoPoint[] = [];
  const openTies = new Map<string, RawNote>();
  let beat = 0;

  for (const index of order) {
    const length = Math.max(...parts.map((p) => p.measures[index]?.length ?? 0));
    const fm = first.measures[index]!;
    const nominal = (fm.beats * 4) / fm.beatType;
    const lengthBeats = length > 0 ? length : nominal;
    rawMeasures.push({
      label: fm.label,
      startBeat: beat,
      lengthBeats,
      beats: fm.beats,
      beatType: fm.beatType,
      sourceIndex: index,
    });
    parts.forEach((part, pi) => {
      const m = part.measures[index];
      if (!m) return;
      if (pi === 0) for (const t of m.tempos) tempo.push({ beat: beat + t.offset, bpm: t.bpm });
      for (const n of m.notes) {
        const key = `${pi}:${n.staff}:${n.pitch}`;
        const start = beat + n.offset;
        const open = openTies.get(key);
        if (n.tieStop && open && Math.abs(open.startBeat + open.durationBeats - start) < 1e-3) {
          open.durationBeats += n.duration;
          if (!n.tieStart) openTies.delete(key);
          continue;
        }
        const raw: RawNote = {
          pitch: n.pitch,
          startBeat: start,
          durationBeats: n.duration,
          velocity: n.velocity,
          hand: handFor(pi, n.staff),
          ...(n.finger ? { finger: n.finger } : {}),
        };
        notes.push(raw);
        if (n.tieStart) openTies.set(key, raw);
        else openTies.delete(key);
      }
    });
    beat += lengthBeats;
  }

  const meta = readMusicXmlMeta(doc);
  return {
    title: meta.title,
    composer: meta.composer,
    notes: notes.filter((n) => n.durationBeats > 0),
    measures: rawMeasures,
    tempo: tempo.length ? tempo : [{ beat: 0, bpm: 120 }],
    keyFifths: keyOut.fifths ?? 0,
  };
}

export function parseXml(xml: string, Parser: DOMParserCtor = globalThis.DOMParser as unknown as DOMParserCtor): Document {
  const doc = new Parser().parseFromString(xml, "application/xml");
  if (!doc?.documentElement || doc.getElementsByTagName("parsererror").length)
    throw new Error("The MusicXML file is not well-formed XML.");
  return doc;
}

export function parseMusicXml(
  xml: string,
  id: string,
  license: LicenseInfo,
  Parser: DOMParserCtor = globalThis.DOMParser as unknown as DOMParserCtor,
): Chart {
  return parseMusicXmlDocument(parseXml(xml, Parser), id, license);
}
