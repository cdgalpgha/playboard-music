import type { RawScore } from "./chart.ts";

export interface ChartEdits {
  /** Semitones, -12..12. */
  transpose: number;
  /** Tempo factor applied to the notated tempo, 0.25..2. */
  tempo: number;
}

export const NO_EDITS: ChartEdits = { transpose: 0, tempo: 1 };

const MAJOR_KEYS = ["C", "G", "D", "A", "E", "B", "F♯", "D♭", "A♭", "E♭", "B♭", "F"];

/** New key signature after transposing: each semitone moves 7 steps round the circle of fifths. */
export function transposeFifths(fifths: number, semitones: number): number {
  let f = (((fifths + 7 * semitones) % 12) + 12) % 12;
  if (f > 6) f -= 12;
  return f;
}

export function majorKeyName(fifths: number): string {
  return MAJOR_KEYS[((fifths % 12) + 12) % 12]!;
}

/** Applies transposition and tempo. Notes pushed off the 88 keys move back by octaves. */
export function applyEdits(raw: RawScore, edits: ChartEdits): RawScore {
  const t = Math.max(-12, Math.min(12, Math.round(edits.transpose)));
  const factor = Math.max(0.25, Math.min(2, edits.tempo));
  return {
    ...raw,
    notes: raw.notes.map((n) => {
      let pitch = n.pitch + t;
      while (pitch < 21) pitch += 12;
      while (pitch > 108) pitch -= 12;
      return { ...n, pitch };
    }),
    tempo: raw.tempo.map((p) => ({ beat: p.beat, bpm: p.bpm * factor })),
    keyFifths: transposeFifths(raw.keyFifths, t),
  };
}
