/** Shape of public/samples/<tier>/manifest.json, written by scripts/build-samples.py. */

export type SampleTier = "lite" | "studio" | "compat";

interface FileEntry {
  file: string;
  seconds: number;
  sha256: string;
  bytes: number;
  rmsDb: number;
  /** Lead-in to skip at load time (Compat MP3s only). */
  startOffsetMs?: number;
}

export interface NoteZoneEntry extends FileEntry {
  root: number;
  lokey: number;
  hikey: number;
  lovel: number;
  hivel: number;
  layer: number;
}

export interface ReleaseEntry extends FileEntry {
  key: number;
}

export interface HarmonicEntry extends FileEntry {
  root: number;
  lokey: number;
  hikey: number;
  loud: boolean;
}

export interface PedalEntry extends FileEntry {
  down: boolean;
}

export interface TierManifest {
  version: 1;
  tier: SampleTier;
  source: string;
  sampleRate: number;
  codec: "opus" | "mp3";
  layers: number[];
  zones: NoteZoneEntry[];
  releases: ReleaseEntry[];
  harmonics: HarmonicEntry[];
  pedal: PedalEntry[];
}

export const TIER_LABELS: Record<SampleTier, { name: string; detail: string }> = {
  lite: { name: "Lite", detail: "2 velocity layers · 3.7 MB · for phones and first visits" },
  studio: { name: "Studio", detail: "4 velocity layers · 18 MB · string resonance releases" },
  compat: { name: "Compatibility", detail: "1 velocity layer MP3 · for browsers without Opus" },
};

export function sampleUrl(tier: SampleTier, group: "zone" | "common", file: string): string {
  return `/samples/${group === "zone" ? tier : "common"}/${file}`;
}
