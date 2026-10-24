/**
 * Chords for the computer-key chord mode, the chord book and the practice room
 * (all from Playboard v0.2). A–G play a major chord, Shift makes it minor, and
 * holding Space raises the root a semitone.
 */

export const QUALITIES = {
  major: { label: "Major", suffix: "", intervals: [0, 4, 7] },
  minor: { label: "Minor", suffix: "m", intervals: [0, 3, 7] },
  maj7: { label: "Major 7", suffix: "maj7", intervals: [0, 4, 7, 11] },
  min7: { label: "Minor 7", suffix: "m7", intervals: [0, 3, 7, 10] },
  dom7: { label: "Dominant 7", suffix: "7", intervals: [0, 4, 7, 10] },
  sus2: { label: "Sus 2", suffix: "sus2", intervals: [0, 2, 7] },
  sus4: { label: "Sus 4", suffix: "sus4", intervals: [0, 5, 7] },
  dim: { label: "Diminished", suffix: "dim", intervals: [0, 3, 6] },
} as const;

export type ChordQuality = keyof typeof QUALITIES;
export type Voicing = "triads" | "sevenths";

export const PITCH_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export interface Chord {
  /** MIDI note of the root before inversion. */
  root: number;
  quality: ChordQuality;
  name: string;
  notes: number[];
}

export function chordName(pitchClass: number, quality: ChordQuality): string {
  return PITCH_NAMES[((pitchClass % 12) + 12) % 12]! + QUALITIES[quality].suffix;
}

/** Notes of a chord on `pitchClass` in `octave` (C4 is octave 4), inverted and transposed, clamped to the 88 keys. */
export function chordNotes(pitchClass: number, quality: ChordQuality, octave = 4, inversion = 0, transpose = 0): number[] {
  const notes: number[] = QUALITIES[quality].intervals.map((i) => 12 * (octave + 1) + pitchClass + i);
  for (let i = 0; i < inversion; i++) notes.push(notes.shift()! + 12);
  return notes.map((n) => Math.max(21, Math.min(108, n + transpose)));
}

/** Letter A–G from a key event, by printed character first so other layouts work, else by key position. */
export function chordLetter(key: string, code: string): string | null {
  const k = key.toUpperCase();
  if (k.length === 1 && k in LETTER_PC) return k;
  const m = /^Key([A-G])$/.exec(code);
  return m ? m[1]! : null;
}

export interface ChordKeyOptions {
  minor: boolean;
  sharp: boolean;
  octave: number;
  voicing?: Voicing;
  transpose?: number;
}

/** The chord a letter key plays. The name is the sounding chord, after transposition. */
export function chordFor(letter: string, opts: ChordKeyOptions): Chord | null {
  const pc = LETTER_PC[letter.toUpperCase()];
  if (pc === undefined) return null;
  const transpose = opts.transpose ?? 0;
  const rootPc = pc + (opts.sharp ? 1 : 0);
  const quality: ChordQuality =
    opts.voicing === "sevenths" ? (opts.minor ? "min7" : "maj7") : opts.minor ? "minor" : "major";
  return {
    root: 12 * (opts.octave + 1) + rootPc + transpose,
    quality,
    name: chordName(rootPc + transpose, quality),
    notes: chordNotes(rootPc, quality, opts.octave, 0, transpose),
  };
}

/** Four-bar progressions for the practice room. */
export const PROGRESSIONS: Record<string, [string, ChordQuality][]> = {
  Pop: [
    ["C", "major"],
    ["G", "major"],
    ["A", "minor"],
    ["F", "major"],
  ],
  "R&B": [
    ["D", "min7"],
    ["G", "major"],
    ["C", "maj7"],
    ["A", "min7"],
  ],
  Jazz: [
    ["D", "min7"],
    ["G", "dom7"],
    ["C", "maj7"],
    ["C", "maj7"],
  ],
  Rock: [
    ["E", "major"],
    ["G", "major"],
    ["D", "major"],
    ["A", "major"],
  ],
  Classical: [
    ["C", "major"],
    ["F", "major"],
    ["G", "major"],
    ["C", "major"],
  ],
  "Lo-fi": [
    ["A", "min7"],
    ["F", "maj7"],
    ["C", "maj7"],
    ["G", "major"],
  ],
};

export const letterPitchClass = (letter: string): number => LETTER_PC[letter.toUpperCase()] ?? 0;

/** True when the held notes contain every pitch class of the chord (any octave, any inversion). */
export function holdsChord(held: readonly number[], pitchClass: number, quality: ChordQuality): boolean {
  const pcs = new Set(held.map((n) => n % 12));
  return QUALITIES[quality].intervals.every((i) => pcs.has((pitchClass + i) % 12));
}

/** Timing of a chord against the bar grid, for beat-one scoring. */
export function barTiming(elapsed: number, barSeconds: number): { bar: number; offset: number } {
  const bar = Math.round(elapsed / barSeconds);
  return { bar, offset: elapsed - bar * barSeconds };
}
