import { createStore, useStore } from "zustand";
import type { LoadProgress } from "@/audio/samples/loader.ts";
import type { SampleTier } from "@/audio/samples/manifest.ts";
import type { SamplerStats } from "@/audio/sampler-node.ts";
import type { LatencySample } from "@/audio/latency.ts";

export type AudioStatus = "locked" | "starting" | "running" | "suspended" | "error";

export interface OutputInfo {
  sampleRate: number;
  baseLatencyMs: number;
  outputLatencyMs: number;
  deviceLabel: string;
  /** Heuristic: label looks wireless or output latency is high. */
  wireless: boolean;
}

export interface AudioState {
  status: AudioStatus;
  error: string | null;
  tier: SampleTier;
  progress: LoadProgress | null;
  stats: SamplerStats;
  output: OutputInfo | null;
  lastLatency: LatencySample | null;
  latencyHistory: LatencySample[];
  outputChanged: boolean;
}

export const audioStore = createStore<AudioState>(() => ({
  status: "locked",
  error: null,
  tier: "lite",
  progress: null,
  stats: { voices: 0, auxVoices: 0, peak: 0, loadedZones: 0, steals: 0, load: 0, overBudget: 0 },
  output: null,
  lastLatency: null,
  latencyHistory: [],
  outputChanged: false,
}));

export function useAudio<T>(selector: (s: AudioState) => T): T {
  return useStore(audioStore, selector);
}
