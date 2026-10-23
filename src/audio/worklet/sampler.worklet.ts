/// <reference path="./worklet-globals.d.ts" />
import { SamplerCore } from "./dsp.ts";
import type { FromWorklet, ToWorklet } from "./protocol.ts";

class SamplerProcessor extends AudioWorkletProcessor {
  private readonly core = new SamplerCore(sampleRate);
  private blocks = 0;
  /** Date.now() is the only clock in AudioWorkletGlobalScope; summed over many blocks it averages out. */
  private busyMs = 0;
  private windowBlocks = 0;
  private overBudget = 0;
  private readonly budgetMs = (128 / sampleRate) * 1000;

  constructor() {
    super();
    this.core.onStarted = (probe, frame) => this.send({ type: "started", probe, frame });
    this.port.onmessage = (e: MessageEvent<ToWorklet>) => this.core.post(e.data, currentFrame);
  }

  private send(msg: FromWorklet): void {
    this.port.postMessage(msg);
  }

  override process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    if (!out || out.length < 2) return true;
    const t0 = Date.now();
    this.core.render(out[0]!, out[1]!, currentFrame);
    const dt = Date.now() - t0;
    this.busyMs += dt;
    if (dt > this.budgetMs) this.overBudget++;
    this.windowBlocks++;
    // About 20 stats messages per second at 48 kHz.
    if (++this.blocks % 19 === 0) {
      const { notes, aux } = this.core.activeVoices();
      const load = this.busyMs / (this.windowBlocks * this.budgetMs);
      this.busyMs = 0;
      this.windowBlocks = 0;
      this.send({
        type: "stats",
        voices: notes,
        auxVoices: aux,
        peak: this.core.peak,
        loadedZones: this.core.loadedZones,
        steals: this.core.steals,
        load,
        overBudget: this.overBudget,
      });
    }
    return true;
  }
}

/** Captures its input as 16-bit PCM chunks for WAV export of free play. */
class TapProcessor extends AudioWorkletProcessor {
  private recording = false;
  private chunkL = new Int16Array(16384);
  private chunkR = new Int16Array(16384);
  private fill = 0;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<{ type: "start" | "stop" }>) => {
      if (e.data.type === "start") {
        this.recording = true;
        this.fill = 0;
      } else {
        this.flush();
        this.recording = false;
        this.port.postMessage({ type: "done" });
      }
    };
  }

  private flush(): void {
    if (!this.fill) return;
    const left = this.chunkL.slice(0, this.fill),
      right = this.chunkR.slice(0, this.fill);
    this.port.postMessage({ type: "chunk", left, right }, [left.buffer, right.buffer]);
    this.fill = 0;
  }

  override process(inputs: Float32Array[][]): boolean {
    if (!this.recording) return true;
    const input = inputs[0];
    const l = input?.[0],
      r = input?.[1] ?? l;
    const n = l?.length ?? 128;
    for (let i = 0; i < n; i++) {
      this.chunkL[this.fill] = toInt16(l ? l[i]! : 0);
      this.chunkR[this.fill] = toInt16(r ? r[i]! : 0);
      if (++this.fill === this.chunkL.length) this.flush();
    }
    return true;
  }
}

/**
 * Microphone capture for pitch detection. Sends mono blocks, with the context
 * frame of their first sample, through a MessagePort straight to the worker.
 */
class CaptureProcessor extends AudioWorkletProcessor {
  private out: MessagePort | null = null;
  private block = new Float32Array(4096);
  private fill = 0;
  private blockStart = 0;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<{ type: "port" | "stop" }>) => {
      if (e.data.type === "port") this.out = e.ports[0] ?? null;
      else this.out = null;
    };
  }

  override process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (!this.out || !input || !input[0]) return true;
    const a = input[0],
      b = input[1];
    for (let i = 0; i < a.length; i++) {
      if (this.fill === 0) this.blockStart = currentFrame + i;
      this.block[this.fill++] = b ? (a[i]! + b[i]!) * 0.5 : a[i]!;
      if (this.fill === this.block.length) {
        const samples = this.block;
        // Date.now() lets the worker tell queued (stale) blocks from fresh ones.
        this.out.postMessage({ type: "audio", samples, frame: this.blockStart, rate: sampleRate, postedAt: Date.now() }, [samples.buffer]);
        this.block = new Float32Array(4096);
        this.fill = 0;
      }
    }
    return true;
  }
}

function toInt16(x: number): number {
  const c = x < -1 ? -1 : x > 1 ? 1 : x;
  return c < 0 ? c * 32768 : c * 32767;
}

registerProcessor("playboard-sampler", SamplerProcessor);
registerProcessor("playboard-tap", TapProcessor);
registerProcessor("playboard-capture", CaptureProcessor);
