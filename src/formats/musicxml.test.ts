import { describe, expect, it } from "vitest";
import { DOMParser } from "@xmldom/xmldom";
import { parseMusicXml, playbackOrder } from "./musicxml.ts";
import { writeMusicXml, type ScoreSpec } from "./musicxml-writer.ts";
import type { LicenseInfo } from "../core/chart.ts";

const license: LicenseInfo = { kind: "original", attribution: "test" };
const parse = (xml: string) => parseMusicXml(xml, "t", license, DOMParser as never);

const spec = (over: Partial<ScoreSpec> = {}): ScoreSpec => ({
  title: "Test",
  composer: "Anon",
  rights: "Public domain",
  keyFifths: 0,
  time: [4, 4],
  tempo: 120,
  staves: ["!mf E4/q:3 D4 C4 D4 | [C4 E4 G4]/h:1,3,5 r/h", "C3/w | G2/h~ G2/h"],
  ...over,
});

describe("MusicXML writer → parser round trip", () => {
  it("keeps pitches, timing, hands, fingers and chords", () => {
    const chart = parse(writeMusicXml(spec()));
    expect(chart.title).toBe("Test");
    expect(chart.composer).toBe("Anon");
    expect(chart.measures).toHaveLength(2);
    const right = chart.notes.filter((n) => n.hand === "R");
    const left = chart.notes.filter((n) => n.hand === "L");
    expect(right.map((n) => n.pitch)).toEqual([64, 62, 60, 62, 60, 64, 67]);
    expect(right[0]).toMatchObject({ start: 0, end: 0.5, finger: 3, velocity: 78, measure: 0 });
    expect(right.slice(4).map((n) => n.start)).toEqual([2, 2, 2]);
    expect(right.slice(4).map((n) => n.finger)).toEqual([1, 3, 5]);
    // The tie merges two halves into one whole note.
    expect(left.map((n) => [n.pitch, n.startBeat, n.durationBeats])).toEqual([
      [48, 0, 4],
      [43, 4, 4],
    ]);
    expect(chart.duration).toBeCloseTo(4);
    expect(chart.beats).toHaveLength(8);
    expect(chart.beats[4]).toEqual({ time: 2, downbeat: true });
  });

  it("writes accidentals against the key and measure", () => {
    const xml = writeMusicXml(spec({ keyFifths: 1, staves: ["F#4/q F4 F4 F#4 | F#4/w"] }));
    const accidentals = [...xml.matchAll(/<accidental>(\w+)<\/accidental>/g)].map((m) => m[1]);
    // F# is in the key; F natural needs a natural sign, then F# needs its sharp back.
    expect(accidentals).toEqual(["natural", "sharp"]);
    expect(parse(xml).notes.map((n) => n.pitch)).toEqual([66, 65, 65, 66, 66]);
  });

  it("handles a pickup measure", () => {
    const chart = parse(writeMusicXml(spec({ pickupBeats: 1, staves: ["G4/q | C5/w"] })));
    expect(chart.measures[0]!.lengthBeats).toBe(1);
    expect(chart.measures[1]!.startBeat).toBe(1);
    expect(chart.notes[1]!.startBeat).toBe(1);
  });

  it("rejects measures with the wrong number of beats", () => {
    expect(() => writeMusicXml(spec({ staves: ["C4/q D4 E4"] }))).toThrow(/3 beats, expected 4/);
  });
});

const wrap = (parts: string, partList = `<score-part id="P1"><part-name>Piano</part-name></score-part>`) =>
  `<?xml version="1.0"?><score-partwise version="4.0"><part-list>${partList}</part-list>${parts}</score-partwise>`;
const note = (step: string, octave: number, dur: number, extra = "") =>
  `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${dur}</duration>${extra}</note>`;

describe("MusicXML parser", () => {
  it("expands repeats with first and second endings", () => {
    const xml = wrap(`<part id="P1">
      <measure number="1"><attributes><divisions>1</divisions><time><beats>1</beats><beat-type>4</beat-type></time></attributes>
        <barline location="left"><repeat direction="forward"/></barline>${note("C", 4, 1)}</measure>
      <measure number="2"><barline location="left"><ending number="1" type="start"/></barline>${note("D", 4, 1)}
        <barline location="right"><ending number="1" type="stop"/><repeat direction="backward"/></barline></measure>
      <measure number="3"><barline location="left"><ending number="2" type="start"/></barline>${note("E", 4, 1)}
        <barline location="right"><ending number="2" type="stop"/></barline></measure>
      <measure number="4">${note("F", 4, 1)}</measure></part>`);
    const chart = parse(xml);
    expect(chart.notes.map((n) => n.pitch)).toEqual([60, 62, 60, 64, 65]);
    expect(chart.measures.map((m) => m.sourceIndex)).toEqual([0, 1, 0, 2, 3]);
  });

  it("computes the order for a simple repeat without a forward sign", () => {
    const m = (backward = false) => ({ forward: false, backward, times: 2, ending: null });
    expect(playbackOrder([m(), m(true), m()])).toEqual([0, 1, 0, 1, 2]);
  });

  it("uses backup for a second voice and skips grace notes", () => {
    const xml = wrap(`<part id="P1"><measure number="1">
      <attributes><divisions>2</divisions><staves>2</staves></attributes>
      ${note("E", 5, 4, "<staff>1</staff>")}${note("D", 5, 4, "<staff>1</staff>")}
      <note><grace/><pitch><step>B</step><octave>4</octave></pitch><staff>1</staff></note>
      <backup><duration>8</duration></backup>
      ${note("C", 3, 8, "<staff>2</staff>")}</measure></part>`);
    const chart = parse(xml);
    expect(chart.notes.map((n) => [n.pitch, n.startBeat, n.hand])).toEqual([
      [48, 0, "L"],
      [76, 0, "R"],
      [74, 2, "R"],
    ]);
  });

  it("reads tempo from metronome marks and tempo changes", () => {
    const xml = wrap(`<part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>
      <direction><direction-type><metronome><beat-unit>half</beat-unit><per-minute>30</per-minute></metronome></direction-type></direction>
      ${note("C", 4, 4)}</measure>
      <measure number="2"><direction><sound tempo="120"/></direction>${note("D", 4, 4)}</measure></part>`);
    const chart = parse(xml);
    expect(chart.tempo).toEqual([
      { beat: 0, bpm: 60 },
      { beat: 4, bpm: 120 },
    ]);
    expect(chart.notes[1]!.start).toBeCloseTo(4);
    expect(chart.duration).toBeCloseTo(6);
  });

  it("assigns two single-staff parts to right and left hands", () => {
    const xml = wrap(
      `<part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>${note("C", 5, 4)}</measure></part>
       <part id="P2"><measure number="1"><attributes><divisions>1</divisions><clef><sign>F</sign><line>4</line></clef></attributes>${note("C", 3, 4)}</measure></part>`,
      `<score-part id="P1"><part-name>RH</part-name></score-part><score-part id="P2"><part-name>LH</part-name></score-part>`,
    );
    expect(parse(xml).notes.map((n) => [n.pitch, n.hand])).toEqual([
      [48, "L"],
      [72, "R"],
    ]);
  });

  it("applies dynamics to following notes", () => {
    const xml = wrap(`<part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>
      ${note("C", 4, 1)}<direction><direction-type><dynamics><ff/></dynamics></direction-type></direction>${note("D", 4, 1)}
      <direction><sound dynamics="50"/></direction>${note("E", 4, 1)}${note("F", 4, 1)}</measure></part>`);
    expect(parse(xml).notes.map((n) => n.velocity)).toEqual([80, 106, 45, 45]);
  });

  it("explains unsupported or broken files", () => {
    expect(() => parse(`<score-timewise/>`)).toThrow(/Timewise/);
    expect(() => parse(`<html/>`)).toThrow(/not MusicXML/);
  });
});
