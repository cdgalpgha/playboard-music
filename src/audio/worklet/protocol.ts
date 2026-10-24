/** Messages between the main thread and the sampler worklet. */

export interface NoteZoneInfo {
  id: number;
  root: number;
  lokey: number;
  hikey: number;
  lovel: number;
  hivel: number;
  /** RMS level of the first 300 ms, dBFS. Used to make velocity gain continuous. */
  rmsDb: number;
}

export interface ReleaseZoneInfo {
  id: number;
  key: number;
}

export interface HarmonicZoneInfo {
  id: number;
  root: number;
  lokey: number;
  hikey: number;
  /** Salamander splits string-resonance releases at velocity 45. */
  loud: boolean;
}

export interface PedalZoneInfo {
  id: number;
  down: boolean;
}

export interface SamplerLayout {
  notes: NoteZoneInfo[];
  releases: ReleaseZoneInfo[];
  harmonics: HarmonicZoneInfo[];
  pedal: PedalZoneInfo[];
}

export interface SamplerParams {
  /** Linear output gain. */
  gain: number;
  /** 0..1. How much velocity attenuates on top of the recorded layer levels. */
  dynamics: number;
  /** 0..1. Sympathetic resonance send while the sustain pedal is down. */
  resonance: number;
  /** 0..1. Hammer-release and string-resonance release samples. */
  releaseNoise: number;
  /** 0..1. Pedal mechanism samples. */
  pedalNoise: number;
}

export const DEFAULT_PARAMS: SamplerParams = {
  gain: 0.9,
  dynamics: 0.6,
  resonance: 0.5,
  releaseNoise: 0.7,
  pedalNoise: 0.6,
};

export type ToWorklet =
  | { type: "layout"; layout: SamplerLayout }
  | { type: "pcm"; id: number; left: Int16Array; right: Int16Array | null }
  | { type: "clear" }
  | {
      type: "noteOn";
      note: number;
      velocity: number;
      /** Context time in seconds. Omitted means "as soon as possible". */
      when?: number;
      /** Opaque id echoed back in a `started` message, for latency probes. */
      probe?: number;
    }
  | { type: "noteOff"; note: number; when?: number }
  | { type: "pedal"; value: number; when?: number }
  | { type: "allOff" }
  /** Drops queued (future) events without touching voices that are already sounding. */
  | { type: "cancelScheduled" }
  | { type: "params"; params: Partial<SamplerParams> };

export type FromWorklet =
  | { type: "started"; probe: number; frame: number }
  | {
      type: "stats";
      voices: number;
      auxVoices: number;
      peak: number;
      loadedZones: number;
      steals: number;
      /** Share of real time spent rendering since the last stats message (0..1, ±1 ms resolution). */
      load: number;
      /** Blocks whose render took at least the block's own duration, since start. */
      overBudget: number;
    };
