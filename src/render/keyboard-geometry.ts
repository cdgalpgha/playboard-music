/** Horizontal piano layout shared by the DOM keyboard and the falling-notes canvas. */

export interface KeyRect {
  note: number;
  black: boolean;
  /** Left edge, as a fraction of the keyboard width. */
  x: number;
  /** Width, as a fraction of the keyboard width. */
  w: number;
}

const BLACK_PCS = new Set([1, 3, 6, 8, 10]);
/** Black keys sit slightly off the white-key boundary, as on a real keyboard. */
const BLACK_SHIFT: Record<number, number> = { 1: -0.08, 3: 0.08, 6: -0.1, 8: 0, 10: 0.1 };
export const BLACK_WIDTH = 0.6;

export function isBlack(note: number): boolean {
  return BLACK_PCS.has(((note % 12) + 12) % 12);
}

export function whiteCount(low: number, high: number): number {
  let n = 0;
  for (let k = low; k <= high; k++) if (!isBlack(k)) n++;
  return n;
}

/** Key rectangles for [low, high]; low and high should be white keys. */
export function keyLayout(low: number, high: number): KeyRect[] {
  const whites = whiteCount(low, high);
  const unit = 1 / whites;
  const keys: KeyRect[] = [];
  let whiteIndex = 0;
  for (let note = low; note <= high; note++) {
    if (isBlack(note)) {
      const pc = ((note % 12) + 12) % 12;
      const center = whiteIndex + (BLACK_SHIFT[pc] ?? 0);
      keys.push({ note, black: true, x: (center - BLACK_WIDTH / 2) * unit, w: BLACK_WIDTH * unit });
    } else {
      keys.push({ note, black: false, x: whiteIndex * unit, w: unit });
      whiteIndex++;
    }
  }
  return keys;
}

const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const FLAT_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];

export function noteName(note: number, flats = false): string {
  const pc = ((note % 12) + 12) % 12;
  return (flats ? FLAT_NAMES : NAMES)[pc]! + (Math.floor(note / 12) - 1);
}
