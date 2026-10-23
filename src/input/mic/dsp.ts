/** Pure helpers for microphone pitch detection (no TensorFlow, unit-tested). */

export const MODEL_RATE = 22050;
export const FFT_HOP = 256;
/** Samples per model window: 2 s at 22050 Hz minus one hop, from Basic Pitch's constants. */
export const WINDOW_SAMPLES = MODEL_RATE * 2 - FFT_HOP;
export const FRAMES_PER_WINDOW = Math.ceil(WINDOW_SAMPLES / FFT_HOP) - 1;
export const MIDI_OFFSET = 21;
export const PITCHES = 88;

/**
 * Streaming resampler with a windowed-sinc low-pass (Blackman window), so
 * content above the new Nyquist frequency does not alias into the piano range.
 */
export class Resampler {
  private readonly ratio: number;
  private readonly half = 16;
  private readonly cutoff: number;
  private history: Float32Array = new Float32Array(0);
  /** Position of the next output sample, in input samples relative to `history[0]`. */
  private pos = 0;

  constructor(inRate: number, outRate = MODEL_RATE) {
    this.ratio = inRate / outRate;
    this.cutoff = Math.min(1, 1 / this.ratio) * 0.92;
  }

  push(input: Float32Array): Float32Array {
    const buf = new Float32Array(this.history.length + input.length);
    buf.set(this.history);
    buf.set(input, this.history.length);
    const out: number[] = [];
    const h = this.half;
    while (this.pos + h < buf.length) {
      const center = Math.floor(this.pos);
      const frac = this.pos - center;
      let acc = 0,
        norm = 0;
      for (let k = -h + 1; k <= h; k++) {
        const idx = center + k;
        if (idx < 0) continue;
        const x = k - frac;
        const w = 0.42 + 0.5 * Math.cos((Math.PI * x) / h) + 0.08 * Math.cos((2 * Math.PI * x) / h);
        const sinc = x === 0 ? 1 : Math.sin(Math.PI * this.cutoff * x) / (Math.PI * this.cutoff * x);
        const c = sinc * w;
        acc += buf[idx]! * c;
        norm += c;
      }
      out.push(norm ? acc / norm : 0);
      this.pos += this.ratio;
    }
    // Keep enough history for the next block's filter taps.
    const keepFrom = Math.max(0, Math.floor(this.pos) - h);
    this.history = buf.slice(keepFrom);
    this.pos -= keepFrom;
    return Float32Array.from(out);
  }
}

export interface DetectedEvent {
  type: "on" | "off";
  pitch: number;
  velocity: number;
  /** Seconds in the 22050 Hz stream since capture started. */
  streamTime: number;
}

export interface DecoderOptions {
  onsetThreshold: number;
  frameThreshold: number;
  offThreshold: number;
  /** Frames at the window's end ignored as unreliable. */
  edgeFrames: number;
}

export const DEFAULT_DECODER: DecoderOptions = { onsetThreshold: 0.5, frameThreshold: 0.3, offThreshold: 0.2, edgeFrames: 15 };

/**
 * Turns overlapping model windows into note events. Each window is only read
 * from the frame after the last one already decoded up to its stable edge, so
 * an onset is reported once even though windows overlap.
 */
export class OnsetDecoder {
  /** Stream time (s) of the last frame already decoded. */
  private decodedUntil = -Infinity;
  private readonly active = new Map<number, { quiet: number }>();
  private readonly lastOn = new Map<number, number>();
  private readonly opts: DecoderOptions;

  constructor(opts: DecoderOptions = DEFAULT_DECODER) {
    this.opts = opts;
  }

  /**
   * `frames` and `onsets` are row-major [frame][pitch] arrays for one window
   * whose first sample is stream sample `firstSample` (22050 Hz).
   */
  decode(frames: Float32Array, onsets: Float32Array, frameCount: number, firstSample: number): DetectedEvent[] {
    const { onsetThreshold, frameThreshold, offThreshold, edgeFrames } = this.opts;
    const events: DetectedEvent[] = [];
    const end = frameCount - edgeFrames;
    const at = (m: Float32Array, f: number, p: number) => (f >= 0 && f < frameCount ? m[f * PITCHES + p]! : 0);
    const timeOf = (f: number) => (firstSample + f * FFT_HOP) / MODEL_RATE;
    let start = 1;
    while (start < end && timeOf(start) <= this.decodedUntil + 1e-6) start++;
    for (let f = start; f < end; f++) {
      const time = timeOf(f);
      for (let p = 0; p < PITCHES; p++) {
        const o = at(onsets, f, p);
        const isPeak = o >= onsetThreshold && o >= at(onsets, f - 1, p) && o > at(onsets, f + 1, p);
        const sustain = (at(frames, f, p) + at(frames, f + 1, p) + at(frames, f + 2, p)) / 3;
        const pitch = p + MIDI_OFFSET;
        if (isPeak && sustain >= frameThreshold) {
          const prev = this.lastOn.get(pitch);
          if (prev === undefined || time - prev > 0.06) {
            if (this.active.has(pitch)) events.push({ type: "off", pitch, velocity: 0, streamTime: time });
            this.lastOn.set(pitch, time);
            this.active.set(pitch, { quiet: 0 });
            // Basic Pitch has no velocity output; onset confidence and sustain level stand in for it.
            const velocity = Math.round(Math.max(20, Math.min(127, 30 + 60 * sustain + 40 * o)));
            events.push({ type: "on", pitch, velocity, streamTime: time });
          }
          continue;
        }
        const state = this.active.get(pitch);
        if (state) {
          state.quiet = at(frames, f, p) < offThreshold ? state.quiet + 1 : 0;
          if (state.quiet >= 3) {
            this.active.delete(pitch);
            events.push({ type: "off", pitch, velocity: 0, streamTime: timeOf(f - 2) });
          }
        }
      }
      this.decodedUntil = time;
    }
    return events;
  }
}
