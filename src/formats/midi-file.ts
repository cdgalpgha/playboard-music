/**
 * Standard MIDI File (SMF) reader: formats 0, 1 and 2, PPQ and SMPTE timing,
 * running status, sysex and meta events. Produces notes per track and channel.
 */
import type { Hand, RawMeasure, RawNote, RawScore } from "../core/chart.ts";
import type { TempoPoint } from "../core/tempo-map.ts";

export interface MidiNote {
  pitch: number;
  startTick: number;
  endTick: number;
  velocity: number;
  channel: number;
}

export interface MidiTrack {
  index: number;
  name: string;
  notes: MidiNote[];
  channels: number[];
}

export interface ParsedMidi {
  format: number;
  /** Ticks per quarter note. SMPTE files are converted to 120 BPM ticks. */
  ticksPerQuarter: number;
  tracks: MidiTrack[];
  tempos: { tick: number; bpm: number }[];
  timeSignatures: { tick: number; numerator: number; denominator: number }[];
  keySignatures: { tick: number; fifths: number; minor: boolean }[];
  endTick: number;
}

const DRUM_CHANNEL = 9;

class Reader {
  pos = 0;
  private readonly view: DataView;
  private readonly end: number;

  constructor(view: DataView, end = view.byteLength) {
    this.view = view;
    this.end = end;
  }
  get done(): boolean {
    return this.pos >= this.end;
  }
  u8(): number {
    if (this.pos >= this.end) throw new Error("Unexpected end of MIDI data.");
    return this.view.getUint8(this.pos++);
  }
  u16(): number {
    const v = this.view.getUint16(this.pos);
    this.pos += 2;
    return v;
  }
  u32(): number {
    const v = this.view.getUint32(this.pos);
    this.pos += 4;
    return v;
  }
  text(n: number): string {
    let s = "";
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.u8());
    return s;
  }
  /** Variable-length quantity, at most four bytes. */
  vlq(): number {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const b = this.u8();
      value = (value << 7) | (b & 0x7f);
      if (!(b & 0x80)) return value;
    }
    throw new Error("Invalid variable-length value in MIDI file.");
  }
  skip(n: number): void {
    this.pos += n;
  }
}

function decodeName(raw: string): string {
  // Track names are usually Latin-1 or UTF-8; try UTF-8 first.
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(raw, (c) => c.charCodeAt(0))).trim();
  } catch {
    return raw.trim();
  }
}

export function parseMidiFile(buffer: ArrayBuffer): ParsedMidi {
  const view = new DataView(buffer);
  const r = new Reader(view);
  if (buffer.byteLength < 14 || r.text(4) !== "MThd") throw new Error("This is not a Standard MIDI File (no MThd header).");
  const headerLength = r.u32();
  const format = r.u16();
  const trackCount = r.u16();
  const division = r.u16();
  r.skip(headerLength - 6);
  if (format > 2) throw new Error(`Unsupported MIDI format ${format}.`);

  let ticksPerQuarter: number;
  let smpteTicksPerSecond = 0;
  if (division & 0x8000) {
    const fps = 256 - (division >> 8);
    const perFrame = division & 0xff;
    smpteTicksPerSecond = (fps === 29 ? 29.97 : fps) * perFrame;
    // At 120 BPM a quarter note lasts 0.5 s.
    ticksPerQuarter = smpteTicksPerSecond / 2;
  } else ticksPerQuarter = division || 480;

  const tracks: MidiTrack[] = [];
  const tempos: ParsedMidi["tempos"] = [];
  const timeSignatures: ParsedMidi["timeSignatures"] = [];
  const keySignatures: ParsedMidi["keySignatures"] = [];
  let endTick = 0;
  let formatTwoOffset = 0;

  for (let t = 0; t < trackCount && !r.done; t++) {
    const id = r.text(4);
    const length = r.u32();
    const chunkEnd = Math.min(buffer.byteLength, r.pos + length);
    if (id !== "MTrk") {
      r.pos = chunkEnd;
      t--;
      continue;
    }
    const tr = new Reader(view, chunkEnd);
    tr.pos = r.pos;
    // Format 2 tracks are independent sequences: play them one after another.
    let tick = format === 2 ? formatTwoOffset : 0;
    let status = 0;
    let name = "";
    const notes: MidiNote[] = [];
    const open = new Map<number, { startTick: number; velocity: number }[]>();
    const closeNote = (channel: number, pitch: number, at: number) => {
      const stack = open.get(channel * 128 + pitch);
      const first = stack?.shift();
      if (first && at > first.startTick) notes.push({ pitch, channel, startTick: first.startTick, endTick: at, velocity: first.velocity });
    };
    while (!tr.done) {
      tick += tr.vlq();
      let byte = tr.u8();
      if (byte < 0x80) {
        // Running status: reuse the previous status byte.
        if (!status) throw new Error("MIDI data byte without a status byte.");
        tr.pos--;
        byte = status;
      }
      if (byte === 0xff) {
        const type = tr.u8();
        const len = tr.vlq();
        const start = tr.pos;
        if (type === 0x51 && len >= 3) {
          const uspq = (tr.u8() << 16) | (tr.u8() << 8) | tr.u8();
          // Rounded to 0.001 BPM: files store whole microseconds, so 90 BPM reads back as 89.99995.
          if (uspq > 0 && !smpteTicksPerSecond) tempos.push({ tick, bpm: Math.round(60_000_000_000 / uspq) / 1000 });
        } else if (type === 0x58 && len >= 2) {
          timeSignatures.push({ tick, numerator: tr.u8(), denominator: 2 ** tr.u8() });
        } else if (type === 0x59 && len >= 2) {
          const sf = tr.u8();
          keySignatures.push({ tick, fifths: sf > 127 ? sf - 256 : sf, minor: tr.u8() === 1 });
        } else if (type === 0x03 && !name) {
          name = decodeName(tr.text(len));
        } else if (type === 0x2f) {
          tr.pos = start + len;
          break;
        }
        tr.pos = start + len;
        continue;
      }
      if (byte === 0xf0 || byte === 0xf7) {
        tr.skip(tr.vlq());
        continue;
      }
      status = byte;
      const type = byte & 0xf0;
      const channel = byte & 0x0f;
      const a = tr.u8();
      const b = type === 0xc0 || type === 0xd0 ? 0 : tr.u8();
      if (type === 0x90 && b > 0) {
        const key = channel * 128 + a;
        const stack = open.get(key) ?? [];
        stack.push({ startTick: tick, velocity: b });
        open.set(key, stack);
      } else if (type === 0x80 || (type === 0x90 && b === 0)) {
        closeNote(channel, a, tick);
      }
    }
    // Close anything left hanging at the end of the track.
    for (const [key, stack] of open) for (let i = stack.length; i > 0; i--) closeNote(key >> 7, key & 127, tick);
    endTick = Math.max(endTick, tick);
    if (format === 2) formatTwoOffset = tick;
    const melodic = notes.filter((n) => n.channel !== DRUM_CHANNEL);
    tracks.push({
      index: tracks.length,
      name,
      notes: melodic.sort((x, y) => x.startTick - y.startTick || x.pitch - y.pitch),
      channels: [...new Set(melodic.map((n) => n.channel))].sort((x, y) => x - y),
    });
    r.pos = chunkEnd;
  }

  if (smpteTicksPerSecond) tempos.splice(0, tempos.length, { tick: 0, bpm: 120 });
  return {
    format,
    ticksPerQuarter,
    tracks,
    tempos: tempos.sort((x, y) => x.tick - y.tick),
    timeSignatures: timeSignatures.sort((x, y) => x.tick - y.tick),
    keySignatures,
    endTick,
  };
}

export type TrackRole = Hand | "skip";

/**
 * Default hands: with two or more tracks that have notes, the track with the
 * lowest average pitch is the left hand. A single track is split at middle C.
 */
export function defaultTrackRoles(midi: ParsedMidi): TrackRole[] {
  const withNotes = midi.tracks.filter((t) => t.notes.length);
  const roles: TrackRole[] = midi.tracks.map(() => "skip");
  if (withNotes.length === 0) return roles;
  if (withNotes.length === 1) {
    roles[withNotes[0]!.index] = "R";
    return roles;
  }
  const avg = (t: MidiTrack) => t.notes.reduce((s, n) => s + n.pitch, 0) / t.notes.length;
  const lowest = withNotes.reduce((a, b) => (avg(a) <= avg(b) ? a : b));
  for (const t of withNotes) roles[t.index] = t === lowest ? "L" : "R";
  return roles;
}

export function midiToRaw(midi: ParsedMidi, roles: TrackRole[], meta: { title: string; composer?: string }): RawScore {
  const tpq = midi.ticksPerQuarter;
  const beat = (tick: number) => tick / tpq;
  const tracks = midi.tracks.filter((t) => roles[t.index] !== "skip" && t.notes.length);
  // When one track carries both hands, split it at middle C.
  const singleTrack = tracks.length === 1;
  const notes: RawNote[] = [];
  for (const t of tracks)
    for (const n of t.notes)
      notes.push({
        pitch: n.pitch,
        startBeat: beat(n.startTick),
        durationBeats: beat(n.endTick - n.startTick),
        velocity: n.velocity,
        hand: singleTrack ? (n.pitch < 60 ? "L" : "R") : (roles[t.index] as Hand),
      });

  const tempo: TempoPoint[] = midi.tempos.length ? midi.tempos.map((x) => ({ beat: beat(x.tick), bpm: x.bpm })) : [{ beat: 0, bpm: 120 }];

  // Measures from time signatures (default 4/4), covering every note.
  const lastBeat = Math.max(beat(midi.endTick), ...notes.map((n) => n.startBeat + n.durationBeats), 0);
  const sigs = midi.timeSignatures.length ? midi.timeSignatures : [{ tick: 0, numerator: 4, denominator: 4 }];
  const measures: RawMeasure[] = [];
  let at = 0,
    sigIndex = 0;
  while (at < lastBeat - 1e-6 || measures.length === 0) {
    while (sigIndex + 1 < sigs.length && beat(sigs[sigIndex + 1]!.tick) <= at + 1e-6) sigIndex++;
    const sig = sigs[sigIndex]!;
    const length = (sig.numerator * 4) / sig.denominator;
    measures.push({
      label: String(measures.length + 1),
      startBeat: at,
      lengthBeats: length,
      beats: sig.numerator,
      beatType: sig.denominator,
    });
    at += length;
    if (measures.length > 5000) break;
  }

  return {
    title: meta.title,
    composer: meta.composer ?? "",
    notes,
    measures,
    tempo,
    keyFifths: midi.keySignatures[0]?.fifths ?? 0,
  };
}
