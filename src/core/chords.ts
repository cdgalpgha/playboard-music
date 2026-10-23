/** Chord-mode keys from Playboard v0.2: A–G play a major chord, Shift makes it minor, Space raises the root a semitone. */

export type ChordQuality = "major" | "minor";

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const INTERVALS: Record<ChordQuality, number[]> = { major: [0, 4, 7], minor: [0, 3, 7] };
const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

export interface Chord {
  root: number;
  quality: ChordQuality;
  name: string;
  notes: number[];
}

/** Letter A–G from a key event, by printed character first so other layouts work, else by key position. */
export function chordLetter(key: string, code: string): string | null {
  const k = key.toUpperCase();
  if (k.length === 1 && k in LETTER_PC) return k;
  const m = /^Key([A-G])$/.exec(code);
  return m ? m[1]! : null;
}

/** The chord for a letter in the given octave (C4 is octave 4), as MIDI notes clamped to the 88 keys. */
export function chordFor(letter: string, opts: { minor: boolean; sharp: boolean; octave: number }): Chord | null {
  const pc = LETTER_PC[letter.toUpperCase()];
  if (pc === undefined) return null;
  const root = 12 * (opts.octave + 1) + pc + (opts.sharp ? 1 : 0);
  const quality: ChordQuality = opts.minor ? "minor" : "major";
  const notes = INTERVALS[quality].map((i) => Math.max(21, Math.min(108, root + i)));
  return { root, quality, name: NAMES[root % 12]! + (opts.minor ? "m" : ""), notes };
}
