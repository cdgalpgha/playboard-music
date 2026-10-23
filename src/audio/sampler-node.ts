import workletUrl from "./worklet/sampler.worklet.ts?worker&url";
import type { FromWorklet, SamplerParams, ToWorklet } from "./worklet/protocol.ts";

export interface SamplerStats {
  voices: number;
  auxVoices: number;
  peak: number;
  loadedZones: number;
  steals: number;
  load: number;
  overBudget: number;
}

/** Main-thread proxy for the sampler worklet. Every call is a single postMessage. */
export class SamplerNode {
  readonly node: AudioWorkletNode;
  stats: SamplerStats = { voices: 0, auxVoices: 0, peak: 0, loadedZones: 0, steals: 0, load: 0, overBudget: 0 };
  onStats: ((s: SamplerStats) => void) | null = null;
  private readonly probes = new Map<number, (frame: number) => void>();
  private nextProbe = 1;

  static async create(ctx: AudioContext): Promise<SamplerNode> {
    await ctx.audioWorklet.addModule(workletUrl);
    return new SamplerNode(ctx);
  }

  private constructor(ctx: AudioContext) {
    this.node = new AudioWorkletNode(ctx, "playboard-sampler", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this.node.port.onmessage = (e: MessageEvent<FromWorklet>) => {
      const msg = e.data;
      if (msg.type === "stats") {
        const { type: _type, ...stats } = msg;
        this.stats = stats;
        this.onStats?.(stats);
      } else if (msg.type === "started") {
        this.probes.get(msg.probe)?.(msg.frame);
        this.probes.delete(msg.probe);
      }
    };
  }

  post(msg: ToWorklet, transfer: Transferable[] = []): void {
    this.node.port.postMessage(msg, transfer);
  }

  noteOn(note: number, velocity: number, when?: number): void {
    this.post(when === undefined ? { type: "noteOn", note, velocity } : { type: "noteOn", note, velocity, when });
  }

  /** Note-on that reports the frame at which the voice started. */
  noteOnProbe(note: number, velocity: number, onStarted: (frame: number) => void): void {
    const probe = this.nextProbe++;
    this.probes.set(probe, onStarted);
    this.post({ type: "noteOn", note, velocity, probe });
  }

  noteOff(note: number, when?: number): void {
    this.post(when === undefined ? { type: "noteOff", note } : { type: "noteOff", note, when });
  }

  pedal(value: number, when?: number): void {
    this.post(when === undefined ? { type: "pedal", value } : { type: "pedal", value, when });
  }

  allOff(): void {
    this.post({ type: "allOff" });
  }

  setParams(params: Partial<SamplerParams>): void {
    this.post({ type: "params", params });
  }
}
