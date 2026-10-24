/**
 * Writes MusicXML 4.0 from a compact text notation. Used by scripts/build-content.ts
 * to author built-in lessons and pieces; the app itself only reads MusicXML.
 *
 * Staff notation, one string per staff, measures separated by "|":
 *   E4/q:3     note E4, quarter, finger 3      durations: w h q e s, "." for dotted
 *   [C3 E3 G3]/h:5,3,1   chord with fingers in the written order
 *   r/q        rest                            F#4 Bb3   accidentals
 *   C4/h~      tie into the next note of the same pitch
 *   !mf        dynamic mark from here on (pp p mp mf f ff)
 * A token without a duration reuses the previous duration.
 */

export const DIVISIONS = 12;

const DURATIONS: Record<string, { divs: number; type: string; dots: number }> = {
  w: { divs: 48, type: "whole", dots: 0 },
  "h.": { divs: 36, type: "half", dots: 1 },
  h: { divs: 24, type: "half", dots: 0 },
  "q.": { divs: 18, type: "quarter", dots: 1 },
  q: { divs: 12, type: "quarter", dots: 0 },
  "e.": { divs: 9, type: "eighth", dots: 1 },
  e: { divs: 6, type: "eighth", dots: 0 },
  s: { divs: 3, type: "16th", dots: 0 },
};

export const DYNAMIC_VELOCITY: Record<string, number> = { pp: 36, p: 50, mp: 64, mf: 78, f: 92, ff: 106 };

const STEP_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** Order in which a key signature sharpens (positive fifths) or flattens (negative). */
const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];

export interface ScoreSpec {
  title: string;
  composer: string;
  arranger?: string;
  rights: string;
  keyFifths: number;
  time: [number, number];
  tempo: number;
  /** Staff 1 (treble, right hand) and optionally staff 2 (bass, left hand). */
  staves: string[];
  /** Clef per staff; defaults to G for staff 1 and F for staff 2. */
  clefs?: ("G" | "F")[];
  /** Length of an incomplete first measure, in quarter beats. */
  pickupBeats?: number;
}

interface Token {
  kind: "note" | "chord" | "rest" | "dynamic";
  pitches: { step: string; alter: number; octave: number }[];
  dur: { divs: number; type: string; dots: number };
  fingers: number[];
  tie: boolean;
  dynamic?: string;
}

function parsePitch(text: string): { step: string; alter: number; octave: number } {
  const m = /^([A-G])(#{1,2}|b{1,2})?(-?\d)$/.exec(text);
  if (!m) throw new Error(`Bad pitch "${text}"`);
  const acc = m[2] ?? "";
  const alter = acc.startsWith("#") ? acc.length : -acc.length;
  return { step: m[1]!, alter, octave: Number(m[3]) };
}

export function pitchToMidi(p: { step: string; alter: number; octave: number }): number {
  return (p.octave + 1) * 12 + STEP_PC[p.step]! + p.alter;
}

function tokenize(staff: string): Token[][] {
  let dur = DURATIONS.q!;
  return staff
    .split("|")
    .map((m) => m.trim())
    .filter((m) => m.length > 0)
    .map((measure) =>
      measure.split(/\s+(?![^[]*\])/).map((raw): Token => {
        if (raw.startsWith("!")) {
          const mark = raw.slice(1);
          if (!(mark in DYNAMIC_VELOCITY)) throw new Error(`Unknown dynamic "${raw}"`);
          return { kind: "dynamic", pitches: [], dur, fingers: [], tie: false, dynamic: mark };
        }
        const m = /^(\[[^\]]+\]|[^/:~]+)(?:\/([whqes]\.?))?(?::([\d,]+))?(~)?$/.exec(raw);
        if (!m) throw new Error(`Bad token "${raw}"`);
        if (m[2]) {
          const d = DURATIONS[m[2]];
          if (!d) throw new Error(`Bad duration in "${raw}"`);
          dur = d;
        }
        const fingers = m[3] ? m[3].split(",").map(Number) : [];
        const body = m[1]!;
        if (body === "r") return { kind: "rest", pitches: [], dur, fingers: [], tie: false };
        const pitches = body.startsWith("[")
          ? body.slice(1, -1).trim().split(/\s+/).map(parsePitch)
          : [parsePitch(body)];
        return { kind: pitches.length > 1 ? "chord" : "note", pitches, dur, fingers, tie: Boolean(m[4]) };
      }),
    );
}

function keyAlters(fifths: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (fifths > 0) SHARP_ORDER.slice(0, fifths).forEach((s) => (out[s] = 1));
  if (fifths < 0) FLAT_ORDER.slice(0, -fifths).forEach((s) => (out[s] = -1));
  return out;
}

const ACCIDENTAL: Record<number, string> = { [-2]: "flat-flat", [-1]: "flat", 0: "natural", 1: "sharp", 2: "double-sharp" };

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function writeMusicXml(spec: ScoreSpec): string {
  const staves = spec.staves.map(tokenize);
  const measureCount = Math.max(...staves.map((s) => s.length));
  const fullDivs = (spec.time[0] * 4 * DIVISIONS) / spec.time[1];
  const clefs = spec.clefs ?? (["G", "F"] as const).slice(0, staves.length);
  const voiceOf = (staff: number) => (staff === 0 ? 1 : 5);
  const openTies = staves.map(() => new Set<number>());
  const measures: string[] = [];

  for (let mi = 0; mi < measureCount; mi++) {
    const expected = mi === 0 && spec.pickupBeats ? spec.pickupBeats * DIVISIONS : fullDivs;
    const parts: string[] = [];
    if (mi === 0) {
      parts.push(
        `<attributes><divisions>${DIVISIONS}</divisions><key><fifths>${spec.keyFifths}</fifths></key>` +
          `<time><beats>${spec.time[0]}</beats><beat-type>${spec.time[1]}</beat-type></time>` +
          `<staves>${staves.length}</staves>` +
          clefs
            .map((c, i) => `<clef number="${i + 1}"><sign>${c}</sign><line>${c === "G" ? 2 : 4}</line></clef>`)
            .join("") +
          `</attributes>`,
        `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit>` +
          `<per-minute>${spec.tempo}</per-minute></metronome></direction-type><sound tempo="${spec.tempo}"/></direction>`,
      );
    }
    staves.forEach((staff, si) => {
      const tokens = staff[mi] ?? [];
      const state: Record<string, number> = {};
      const keyAlter = keyAlters(spec.keyFifths);
      let used = 0;
      if (si > 0) parts.push(`<backup><duration>${expected}</duration></backup>`);
      for (const t of tokens) {
        if (t.kind === "dynamic") {
          parts.push(
            `<direction placement="${si === 0 ? "below" : "above"}"><direction-type><dynamics><${t.dynamic}/></dynamics>` +
              `</direction-type><staff>${si + 1}</staff><sound dynamics="${Math.round(
                (DYNAMIC_VELOCITY[t.dynamic!]! / 90) * 100,
              )}"/></direction>`,
          );
          continue;
        }
        used += t.dur.divs;
        const common = (extra = "") =>
          `<duration>${t.dur.divs}</duration>${extra}<voice>${voiceOf(si)}</voice><type>${t.dur.type}</type>` +
          "<dot/>".repeat(t.dur.dots);
        if (t.kind === "rest") {
          parts.push(`<note><rest/>${common()}<staff>${si + 1}</staff></note>`);
          continue;
        }
        t.pitches.forEach((p, pi) => {
          const midi = pitchToMidi(p);
          const stepKey = `${p.step}${p.octave}`;
          const current = state[stepKey] ?? keyAlter[p.step] ?? 0;
          const accidental = current !== p.alter ? `<accidental>${ACCIDENTAL[p.alter]}</accidental>` : "";
          state[stepKey] = p.alter;
          const tieStop = openTies[si]!.has(midi);
          if (tieStop) openTies[si]!.delete(midi);
          if (t.tie) openTies[si]!.add(midi);
          const ties = (tieStop ? `<tie type="stop"/>` : "") + (t.tie ? `<tie type="start"/>` : "");
          const tied = (tieStop ? `<tied type="stop"/>` : "") + (t.tie ? `<tied type="start"/>` : "");
          const finger = t.fingers[pi];
          const notations =
            tied || finger
              ? `<notations>${tied}${finger ? `<technical><fingering>${finger}</fingering></technical>` : ""}</notations>`
              : "";
          parts.push(
            `<note>${pi > 0 ? "<chord/>" : ""}<pitch><step>${p.step}</step>${p.alter ? `<alter>${p.alter}</alter>` : ""}` +
              `<octave>${p.octave}</octave></pitch>${common(ties)}${accidental}<staff>${si + 1}</staff>${notations}</note>`,
          );
        });
      }
      if (tokens.length && used !== expected)
        throw new Error(`${spec.title}: staff ${si + 1} measure ${mi + 1} has ${used / DIVISIONS} beats, expected ${expected / DIVISIONS}`);
      if (!tokens.length) parts.push(`<note><rest measure="yes"/><duration>${expected}</duration><voice>${voiceOf(si)}</voice><staff>${si + 1}</staff></note>`);
    });
    if (mi === measureCount - 1) parts.push(`<barline location="right"><bar-style>light-heavy</bar-style></barline>`);
    const implicit = mi === 0 && spec.pickupBeats ? ` implicit="yes"` : "";
    measures.push(`<measure number="${spec.pickupBeats ? mi : mi + 1}"${implicit}>${parts.join("")}</measure>`);
  }

  const creators =
    `<creator type="composer">${esc(spec.composer)}</creator>` +
    (spec.arranger ? `<creator type="arranger">${esc(spec.arranger)}</creator>` : "");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n` +
    `<score-partwise version="4.0"><work><work-title>${esc(spec.title)}</work-title></work>` +
    `<identification>${creators}<rights>${esc(spec.rights)}</rights>` +
    `<encoding><software>Playboard content builder</software></encoding></identification>` +
    `<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>` +
    `<part id="P1">\n${measures.join("\n")}\n</part></score-partwise>\n`
  );
}
