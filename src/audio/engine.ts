import { audioStore, type OutputInfo } from "@/state/audio-store.ts";
import { getSetting, setSetting } from "@/storage/db.ts";
import { contextTimeHeardAt, heardAt, measure, type ClockPoint, type LatencySample } from "./latency.ts";
import { SampleLoader, supportsOpus } from "./samples/loader.ts";
import type { SampleTier } from "./samples/manifest.ts";
import { SamplerNode } from "./sampler-node.ts";
import type { SamplerParams } from "./worklet/protocol.ts";

const WIRELESS_LABEL = /bluetooth|airpods|buds|beats|bose|jabra|wh-1000|wf-1000|headset|hands-free|\bbt\b/i;
/** Above this, output is very likely Bluetooth or a heavily buffered device. */
const WIRELESS_LATENCY_MS = 60;

export interface MixSettings {
  volume: number;
  room: number;
  dynamics: number;
  resonance: number;
  releaseNoise: number;
  pedalNoise: number;
}

export const DEFAULT_MIX: MixSettings = {
  volume: 0.8,
  room: 0.18,
  dynamics: 0.6,
  resonance: 0.5,
  releaseNoise: 0.7,
  pedalNoise: 0.6,
};

export function defaultTier(): SampleTier {
  if (!supportsOpus()) return "compat";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  if (mobile) return "lite";
  return nav.deviceMemory === undefined || nav.deviceMemory >= 8 ? "studio" : "lite";
}

function roomImpulse(ctx: BaseAudioContext, seconds = 1.8): AudioBuffer {
  const length = Math.round(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, length, ctx.sampleRate);
  let seed = 7;
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      seed = (seed * 16807) % 2147483647;
      const noise = (seed / 2147483647) * 2 - 1;
      const t = i / ctx.sampleRate;
      // Sparse early reflections in the first 60 ms, then a smooth exponential tail.
      const early = t < 0.06 && seed % 97 === 0 ? 0.6 : 0;
      d[i] = (noise * 0.35 + early) * Math.exp(-t * 3.6) * (t < 0.004 ? t / 0.004 : 1);
    }
  }
  return ir;
}

/**
 * Owns the AudioContext and the graph:
 * sampler → pianoBus(dry + room) → master → compressor → analyser → destination.
 */
class AudioEngine {
  ctx: AudioContext | null = null;
  sampler: SamplerNode | null = null;
  master: GainNode | null = null;
  pianoBus: GainNode | null = null;
  metronomeBus: GainNode | null = null;
  analyser: AnalyserNode | null = null;
  private wet: GainNode | null = null;
  private dry: GainNode | null = null;
  private loader: SampleLoader | null = null;
  private starting: Promise<void> | null = null;
  private mix: MixSettings = { ...DEFAULT_MIX };
  private outputTimer: ReturnType<typeof setInterval> | null = null;
  private lastOutputLatency = 0;
  private latencySamples: LatencySample[] = [];

  get running(): boolean {
    return this.ctx?.state === "running" && this.sampler !== null;
  }

  /** Must be called from a user gesture (click, key, tap). */
  start(): Promise<void> {
    if (this.running) return Promise.resolve();
    if (this.ctx && this.sampler) return this.resume();
    this.starting ??= this.create().finally(() => (this.starting = null));
    return this.starting;
  }

  private async resume(): Promise<void> {
    await this.ctx!.resume();
    audioStore.setState({ status: "running" });
  }

  private async create(): Promise<void> {
    audioStore.setState({ status: "starting", error: null });
    try {
      const ctx = new AudioContext({ latencyHint: "interactive" });
      this.ctx = ctx;
      // Resume inside the gesture, before any await, so autoplay policy allows it.
      const resumed = ctx.resume();
      this.sampler = await SamplerNode.create(ctx);
      this.buildGraph(ctx, this.sampler);
      await resumed;
      ctx.onstatechange = () => {
        if (ctx.state === "suspended" || ctx.state === "interrupted")
          audioStore.setState({ status: "suspended" });
        else if (ctx.state === "running") audioStore.setState({ status: "running" });
      };
      this.mix = { ...DEFAULT_MIX, ...(await getSetting<Partial<MixSettings>>("mix", {})) };
      this.applyMix();
      this.sampler.onStats = (stats) => audioStore.setState({ stats });
      audioStore.setState({ status: "running" });
      this.watchOutput();
      const tier = await getSetting<SampleTier>("tier", defaultTier());
      void this.loadTier(tier === "compat" || supportsOpus() ? tier : "compat");
    } catch (error) {
      audioStore.setState({ status: "error", error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  private buildGraph(ctx: AudioContext, sampler: SamplerNode): void {
    this.pianoBus = ctx.createGain();
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    const room = ctx.createConvolver();
    room.buffer = roomImpulse(ctx);
    this.metronomeBus = ctx.createGain();
    this.master = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    // Safety only: catches overs from dense pedalled passages without pumping normal playing.
    compressor.threshold.value = -6;
    compressor.knee.value = 6;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.12;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    sampler.node.connect(this.dry);
    sampler.node.connect(room);
    room.connect(this.wet);
    this.dry.connect(this.pianoBus);
    this.wet.connect(this.pianoBus);
    this.pianoBus.connect(this.master);
    this.metronomeBus.connect(this.master);
    this.master.connect(compressor);
    compressor.connect(this.analyser);
    this.analyser.connect(ctx.destination);
  }

  async loadTier(tier: SampleTier): Promise<void> {
    if (!this.ctx || !this.sampler) return;
    const sampler = this.sampler;
    this.loader?.cancel();
    this.loader = new SampleLoader(this.ctx, (msg, transfer) => sampler.post(msg, transfer), (progress) =>
      audioStore.setState({ progress }),
    );
    audioStore.setState({ tier });
    await setSetting("tier", tier);
    try {
      await this.loader.load(tier);
    } catch (error) {
      // A browser that claims Opus support but cannot decode it falls back to MP3.
      if (tier !== "compat" && error instanceof Error && /decode|EncodingError/i.test(`${error.name} ${error.message}`))
        await this.loadTier("compat");
    }
  }

  getMix(): MixSettings {
    return { ...this.mix };
  }

  setMix(patch: Partial<MixSettings>): void {
    this.mix = { ...this.mix, ...patch };
    this.applyMix();
    void setSetting("mix", this.mix);
  }

  private applyMix(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.wet || !this.dry || !this.sampler) return;
    const t = ctx.currentTime;
    this.master.gain.setTargetAtTime(this.mix.volume, t, 0.02);
    this.wet.gain.setTargetAtTime(this.mix.room * 0.9, t, 0.03);
    this.dry.gain.setTargetAtTime(1 - this.mix.room * 0.2, t, 0.03);
    const params: Partial<SamplerParams> = {
      dynamics: this.mix.dynamics,
      resonance: this.mix.resonance,
      releaseNoise: this.mix.releaseNoise,
      pedalNoise: this.mix.pedalNoise,
    };
    this.sampler.setParams(params);
  }

  /** Pairs a context time with the moment it reaches the speaker. */
  clock(): ClockPoint {
    const ctx = this.ctx;
    if (!ctx) return { contextTime: 0, performanceTime: performance.now() };
    const ts = ctx.getOutputTimestamp?.();
    if (ts && ts.performanceTime && ts.contextTime !== undefined && ts.performanceTime > 0)
      return { contextTime: ts.contextTime, performanceTime: ts.performanceTime };
    const latency = (ctx.baseLatency || 0) + (ctx.outputLatency || 0);
    return { contextTime: ctx.currentTime - latency, performanceTime: performance.now() };
  }

  /** Context time whose sound will be heard at `perfMs`. */
  contextTimeFor(perfMs: number): number {
    return contextTimeHeardAt(perfMs, this.clock());
  }

  /** performance.now() at which a context time will be heard. */
  heardAt(contextTime: number): number {
    return heardAt(contextTime, this.clock());
  }

  /** Live note-on from an input device, with a latency probe. */
  playInput(note: number, velocity: number, inputMs: number, source: string): void {
    const ctx = this.ctx,
      sampler = this.sampler;
    if (!ctx || !sampler) return;
    const postedMs = performance.now();
    sampler.noteOnProbe(note, velocity, (frame) => {
      const sample = measure(note, source, inputMs, postedMs, frame, ctx.sampleRate, this.clock());
      this.latencySamples = [...this.latencySamples.slice(-199), sample];
      audioStore.setState({ lastLatency: sample, latencyHistory: this.latencySamples });
    });
  }

  private watchOutput(): void {
    const update = async () => {
      const ctx = this.ctx;
      if (!ctx) return;
      let label = "";
      try {
        const devices = await navigator.mediaDevices?.enumerateDevices?.();
        const sinkId = (ctx as AudioContext & { sinkId?: string }).sinkId || "default";
        const out = devices?.find((d) => d.kind === "audiooutput" && (d.deviceId === sinkId || d.deviceId === "default"));
        label = out?.label ?? "";
      } catch {
        /* enumerateDevices unavailable */
      }
      const outputLatencyMs = (ctx.outputLatency || 0) * 1000;
      const info: OutputInfo = {
        sampleRate: ctx.sampleRate,
        baseLatencyMs: (ctx.baseLatency || 0) * 1000,
        outputLatencyMs,
        deviceLabel: label,
        wireless: WIRELESS_LABEL.test(label) || outputLatencyMs > WIRELESS_LATENCY_MS,
      };
      const prev = audioStore.getState().output;
      const changed =
        prev !== null &&
        (prev.deviceLabel !== info.deviceLabel || Math.abs(outputLatencyMs - this.lastOutputLatency) > 20);
      this.lastOutputLatency = outputLatencyMs;
      audioStore.setState({ output: info, ...(changed ? { outputChanged: true } : {}) });
    };
    void update();
    navigator.mediaDevices?.addEventListener?.("devicechange", () => void update());
    this.outputTimer ??= setInterval(() => void update(), 3000);
  }

  acknowledgeOutputChange(): void {
    audioStore.setState({ outputChanged: false });
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    const ctx = this.ctx as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!ctx?.setSinkId) throw new Error("This browser cannot choose an audio output device.");
    await ctx.setSinkId(deviceId === "default" ? "" : deviceId);
  }

  allOff(): void {
    this.sampler?.allOff();
    this.sampler?.pedal(0);
  }
}

export const engine = new AudioEngine();
