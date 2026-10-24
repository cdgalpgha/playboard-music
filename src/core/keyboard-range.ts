/** Standard keyboard sizes and their usual MIDI ranges. */
export interface KeyboardRange {
  keys: number;
  low: number;
  high: number;
}

export const STANDARD_RANGES: KeyboardRange[] = [
  { keys: 25, low: 48, high: 72 }, // C3–C5
  { keys: 32, low: 53, high: 84 }, // F3–C6
  { keys: 37, low: 48, high: 84 }, // C3–C6
  { keys: 49, low: 36, high: 84 }, // C2–C6
  { keys: 61, low: 36, high: 96 }, // C2–C7
  { keys: 73, low: 28, high: 100 }, // E1–E7
  { keys: 76, low: 28, high: 103 }, // E1–G7
  { keys: 88, low: 21, high: 108 }, // A0–C8
];

export const FULL_RANGE: KeyboardRange = { keys: 88, low: 21, high: 108 };

/**
 * Infers the keyboard from the lowest and highest keys the player pressed.
 * Controllers with octave-shift buttons may report a transposed range, so the
 * span decides the size and the reported notes decide the position.
 */
export function detectKeyboardRange(lowest: number, highest: number): KeyboardRange {
  const low = Math.min(lowest, highest),
    high = Math.max(lowest, highest);
  const span = high - low + 1;
  const size = STANDARD_RANGES.find((r) => r.keys >= span) ?? FULL_RANGE;
  if (size.keys === 88) return FULL_RANGE;
  if (span === size.keys) return { keys: size.keys, low, high };
  // Partial range pressed: keep the standard shape, shifted to include the played keys.
  const shift = low < size.low ? low - size.low : high > size.high ? high - size.high : 0;
  return { keys: size.keys, low: size.low + shift, high: size.high + shift };
}

/** Guesses the size from a MIDI device name ("Keystation 49", "Launchkey 61", "MPK mini"). */
export function rangeFromDeviceName(name: string): KeyboardRange | null {
  const n = name.toLowerCase();
  const sized = STANDARD_RANGES.find((r) => new RegExp(`(^|\\D)${r.keys}(\\D|$)`).test(n));
  if (sized) return sized;
  if (/mpk ?mini|minilab|launchkey mini|keystep|nanokey/.test(n)) return STANDARD_RANGES[0]!;
  if (/\b(p-?\d{2,3}[a-z]*|fp-?\d{2}[a-z]*|cdp|px-|clavinova|ydp|arius|es\d{2,3}|ca\d{2,3}|kawai|digital piano)\b/.test(n))
    return FULL_RANGE;
  return null;
}

/** The range shown on screen for a keyboard: at least two octaves, starting on a white key. */
export function visibleRange(range: KeyboardRange): { low: number; high: number } {
  const isBlack = (n: number) => [1, 3, 6, 8, 10].includes(((n % 12) + 12) % 12);
  let low = range.low,
    high = range.high;
  while (isBlack(low)) low--;
  while (isBlack(high)) high++;
  return { low: Math.max(21, low), high: Math.min(108, high) };
}
