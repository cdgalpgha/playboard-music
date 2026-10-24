import type { SamplerLayout, ToWorklet } from "../worklet/protocol.ts";
import { readCachedSample, writeCachedSample } from "./cache.ts";
import type { NoteZoneEntry, SampleTier, TierManifest } from "./manifest.ts";

export interface LoadProgress {
  tier: SampleTier;
  loaded: number;
  total: number;
  bytes: number;
  fromCache: number;
  /** Every key has at least one zone, so the whole keyboard plays. */
  playable: boolean;
  done: boolean;
  error: string | null;
}

type Post = (msg: ToWorklet, transfer?: Transferable[]) => void;

interface Job {
  id: number;
  url: string;
  cacheKey: string;
  sha256: string;
  bytes: number;
  startOffsetMs: number;
  maxSeconds: number;
  /** Marks the end of the first pass (all keys covered). */
  firstPass: boolean;
}

const ID_BASE = { release: 1000, harmonic: 2000, pedal: 3000 } as const;
/** Compat MP3s are 25 s long; cap them so memory stays near the Lite tier. */
const COMPAT_MAX_SECONDS = 9;

export function supportsOpus(): boolean {
  if (typeof Audio === "undefined") return false;
  return new Audio().canPlayType('audio/ogg; codecs="opus"') !== "";
}

/** Picks the velocity layer a typical keyboard touch (~80) lands on. */
export function primaryLayer(manifest: TierManifest): number {
  const root = manifest.zones.filter((z) => z.root === 60);
  const hit = root.find((z) => 80 >= z.lovel && 80 <= z.hivel);
  return hit?.layer ?? manifest.layers[0]!;
}

/** Load order: the primary layer of every zone, nearest middle C first, then the rest. */
export function loadOrder(manifest: TierManifest): { zones: NoteZoneEntry[]; firstPassCount: number } {
  const layer = primaryLayer(manifest);
  const byDistance = (a: NoteZoneEntry, b: NoteZoneEntry) => Math.abs(a.root - 60) - Math.abs(b.root - 60);
  const first = manifest.zones.filter((z) => z.layer === layer).sort(byDistance);
  const rest = manifest.zones
    .filter((z) => z.layer !== layer)
    .sort((a, b) => byDistance(a, b) || Math.abs(a.layer - layer) - Math.abs(b.layer - layer));
  return { zones: [...first, ...rest], firstPassCount: first.length };
}

export function layoutFor(manifest: TierManifest): SamplerLayout {
  return {
    notes: manifest.zones.map((z, i) => ({
      id: i + 1,
      root: z.root,
      lokey: z.lokey,
      hikey: z.hikey,
      lovel: z.lovel,
      hivel: z.hivel,
      rmsDb: z.rmsDb,
    })),
    releases: manifest.releases.map((r, i) => ({ id: ID_BASE.release + i, key: r.key })),
    harmonics: manifest.harmonics.map((h, i) => ({
      id: ID_BASE.harmonic + i,
      root: h.root,
      lokey: h.lokey,
      hikey: h.hikey,
      loud: h.loud,
    })),
    pedal: manifest.pedal.map((p, i) => ({ id: ID_BASE.pedal + i, down: p.down })),
  };
}

function jobsFor(manifest: TierManifest): Job[] {
  const { zones, firstPassCount } = loadOrder(manifest);
  const tier = manifest.tier;
  const cap = tier === "compat" ? COMPAT_MAX_SECONDS : Infinity;
  const jobs: Job[] = zones.map((z, i) => ({
    id: manifest.zones.indexOf(z) + 1,
    url: `/samples/${tier}/${z.file}`,
    cacheKey: `${tier}/${z.file}`,
    sha256: z.sha256,
    bytes: z.bytes,
    startOffsetMs: z.startOffsetMs ?? 0,
    maxSeconds: cap,
    firstPass: i === firstPassCount - 1,
  }));
  const common = (file: string) => ({ url: `/samples/common/${file}`, cacheKey: `common/${file}` });
  const extras: Job[] = [
    ...manifest.pedal.map((p, i) => ({ id: ID_BASE.pedal + i, ...common(p.file), sha256: p.sha256, bytes: p.bytes })),
    ...manifest.releases.map((r, i) => ({ id: ID_BASE.release + i, ...common(r.file), sha256: r.sha256, bytes: r.bytes })),
    ...manifest.harmonics.map((h, i) => ({ id: ID_BASE.harmonic + i, ...common(h.file), sha256: h.sha256, bytes: h.bytes })),
  ].map((j) => ({ ...j, startOffsetMs: 0, maxSeconds: Infinity, firstPass: false }));
  // Pedal and release noises are small: fetch them right after the first pass.
  const firstEnd = firstPassCount;
  return [...jobs.slice(0, firstEnd), ...extras, ...jobs.slice(firstEnd)];
}

/** SHA-256 as hex, or null where SubtleCrypto is unavailable (plain-http LAN dev). */
async function sha256Hex(data: ArrayBuffer): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toInt16(buffer: AudioBuffer, startOffsetMs: number, maxSeconds: number): Int16Array[] {
  const rate = buffer.sampleRate;
  const start = Math.min(buffer.length, Math.round((startOffsetMs / 1000) * rate));
  const end = Math.min(buffer.length, start + Math.round(maxSeconds * rate));
  const fade = end - start < buffer.length - start ? Math.min(Math.round(0.3 * rate), (end - start) >> 2) : 0;
  const out: Int16Array[] = [];
  for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) {
    const src = buffer.getChannelData(c);
    const dst = new Int16Array(end - start);
    for (let i = 0; i < dst.length; i++) {
      let x = src[start + i]!;
      const fromEnd = dst.length - i;
      if (fromEnd <= fade) x *= 0.5 - 0.5 * Math.cos((Math.PI * fromEnd) / fade);
      const c2 = x < -1 ? -1 : x > 1 ? 1 : x;
      dst[i] = c2 < 0 ? c2 * 32768 : c2 * 32767;
    }
    out.push(dst);
  }
  return out;
}

export class SampleLoader {
  private generation = 0;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly post: Post,
    private readonly onProgress: (p: LoadProgress) => void,
  ) {}

  cancel(): void {
    this.generation++;
  }

  async load(tier: SampleTier): Promise<LoadProgress> {
    const generation = ++this.generation;
    const progress: LoadProgress = {
      tier,
      loaded: 0,
      total: 0,
      bytes: 0,
      fromCache: 0,
      playable: false,
      done: false,
      error: null,
    };
    const report = () => generation === this.generation && this.onProgress({ ...progress });
    try {
      const response = await fetch(`/samples/${tier}/manifest.json`);
      if (!response.ok) throw new Error(`Sample manifest: HTTP ${response.status}`);
      const manifest = (await response.json()) as TierManifest;
      if (generation !== this.generation) return progress;
      this.post({ type: "clear" });
      this.post({ type: "layout", layout: layoutFor(manifest) });
      const jobs = jobsFor(manifest);
      progress.total = jobs.length;
      report();
      let cursor = 0;
      const worker = async () => {
        while (cursor < jobs.length && generation === this.generation) {
          const job = jobs[cursor++]!;
          await this.loadOne(job, progress);
          if (generation !== this.generation) return;
          progress.loaded++;
          if (job.firstPass) progress.playable = true;
          report();
        }
      };
      await Promise.all(Array.from({ length: 4 }, worker));
      progress.playable = true;
      progress.done = true;
      report();
    } catch (error) {
      progress.error = error instanceof Error ? error.message : String(error);
      report();
      throw error;
    }
    return progress;
  }

  private async loadOne(job: Job, progress: LoadProgress): Promise<void> {
    let data = await readCachedSample(job.cacheKey, job.sha256);
    if (data) {
      progress.fromCache++;
    } else {
      const response = await fetch(job.url);
      if (!response.ok) throw new Error(`${job.url}: HTTP ${response.status}`);
      data = await response.arrayBuffer();
      const digest = await sha256Hex(data);
      if (digest !== null && digest !== job.sha256) throw new Error(`${job.url}: checksum mismatch`);
      await writeCachedSample(job.cacheKey, job.sha256, data.slice(0));
    }
    progress.bytes += job.bytes;
    const buffer = await this.ctx.decodeAudioData(data);
    const [left, right] = toInt16(buffer, job.startOffsetMs, job.maxSeconds);
    if (!left) throw new Error(`${job.url}: no audio channels`);
    const transfer: Transferable[] = [left.buffer];
    if (right) transfer.push(right.buffer);
    this.post({ type: "pcm", id: job.id, left, right: right ?? null }, transfer);
  }
}
