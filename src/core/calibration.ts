/**
 * Tap-along calibration.
 * Audio pass: taps against clicks placed with the reported output latency.
 *   error = input latency + the player's habit + output latency the browser does not report
 * Visual pass: taps against flashes.
 *   error = input latency + the player's habit + display latency
 * inputOffsetMs  = visual median   (subtracted from input timestamps when scoring)
 * audioOffsetMs  = audio − visual  (audio is scheduled this much earlier so it lines up with visuals)
 */

export const MIN_TAPS = 8;

export interface TapAnalysis {
  medianMs: number;
  /** Robust standard deviation (1.4826 × MAD). */
  spreadMs: number;
  kept: number;
  dropped: number;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Pairs each tap with the nearest target; taps farther than `maxDistanceMs` are ignored. */
export function matchTaps(taps: number[], targets: number[], maxDistanceMs: number): number[] {
  const errors: number[] = [];
  const used = new Set<number>();
  for (const tap of taps) {
    let best = -1,
      bestD = Infinity;
    targets.forEach((t, i) => {
      const d = Math.abs(tap - t);
      if (d < bestD && !used.has(i)) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0 && bestD <= maxDistanceMs) {
      used.add(best);
      errors.push(tap - targets[best]!);
    }
  }
  return errors;
}

/** Median and spread after dropping taps more than 2.5 MAD from the median. */
export function analyzeTaps(errors: number[]): TapAnalysis | null {
  if (errors.length < MIN_TAPS) return null;
  const m = median(errors);
  // A floor of 4 ms keeps a very steady player's near-identical taps from being called outliers.
  const mad = Math.max(4, median(errors.map((e) => Math.abs(e - m))));
  const kept = errors.filter((e) => Math.abs(e - m) <= 2.5 * mad);
  if (kept.length < MIN_TAPS) return null;
  const km = median(kept);
  return {
    medianMs: km,
    spreadMs: 1.4826 * median(kept.map((e) => Math.abs(e - km))),
    kept: kept.length,
    dropped: errors.length - kept.length,
  };
}

export function offsetsFrom(audio: TapAnalysis, visual: TapAnalysis): { inputOffsetMs: number; audioOffsetMs: number } {
  return {
    inputOffsetMs: Math.round(visual.medianMs * 10) / 10,
    audioOffsetMs: Math.round((audio.medianMs - visual.medianMs) * 10) / 10,
  };
}
