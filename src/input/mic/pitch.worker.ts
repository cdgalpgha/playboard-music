/// <reference lib="webworker" />
/**
 * Microphone note detection with Spotify's Basic Pitch model (Apache 2.0),
 * run with TensorFlow.js in a worker. Two-second windows go through the model
 * about every 255 ms; new onsets are decoded from the stable part of each
 * window and posted with their AudioContext time.
 *
 * Windows are chosen by position, not by arrival: each one ends at most
 * MAX_STEP after the previous one, so consecutive windows always overlap and
 * no audio is skipped. A fast device always analyses the newest audio; a slow
 * one catches up window by window, and only skips ahead (leaving a gap) when
 * it is more than MAX_BACKLOG behind.
 */
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";
import "@tensorflow/tfjs-backend-cpu";
import { loadGraphModel, type GraphModel } from "@tensorflow/tfjs-converter";
import { DEFAULT_DECODER, FFT_HOP, MODEL_RATE, OnsetDecoder, PITCHES, Resampler, WINDOW_SAMPLES } from "./dsp.ts";

declare const self: DedicatedWorkerGlobalScope;

/** 22 model frames between inferences (about 255 ms). */
const HOP_SAMPLES = 22 * FFT_HOP;
const EDGE_SAMPLES = DEFAULT_DECODER.edgeFrames * FFT_HOP;
/** Largest step between window ends that keeps their stable parts overlapping (about 1.8 s). */
const MAX_STEP = WINDOW_SAMPLES - EDGE_SAMPLES - 4 * FFT_HOP;
const MAX_BACKLOG = MODEL_RATE * 6;
const RING_SAMPLES = MAX_BACKLOG + WINDOW_SAMPLES + MODEL_RATE;

export type WorkerIn = { type: "init"; modelUrl: string; backend?: "webgl" | "cpu" } | { type: "stop" };
export type WorkerOut =
  | { type: "ready"; backend: string }
  | { type: "error"; message: string }
  | { type: "stats"; blocks: number; samples: number; inferences: number; backlogSec: number; skipped: number }
  | {
      type: "events";
      events: { type: "on" | "off"; pitch: number; velocity: number; contextTime: number }[];
      inferenceMs: number;
    };

let model: GraphModel | null = null;
let resampler: Resampler | null = null;
let decoder = new OnsetDecoder();
const ring = new Float32Array(RING_SAMPLES);
let written = 0;
/** Stream sample at which the last analysed window ended. */
let lastEnd = 0;
let skipped = 0;
/** Context time (s) of the first captured sample. */
let streamStart: number | null = null;
let audioPort: MessagePort | null = null;
let blocks = 0;
let inferences = 0;
let lastStats = 0;

const post = (m: WorkerOut) => self.postMessage(m);

async function init(modelUrl: string, backend?: string): Promise<void> {
  try {
    try {
      if (backend === "cpu") throw new Error("CPU requested");
      await tf.setBackend("webgl");
      await tf.ready();
    } catch {
      await tf.setBackend("cpu");
      await tf.ready();
    }
    model = await loadGraphModel(modelUrl);
    // Warm up so the first real window is not slow.
    tf.tidy(() => {
      model!.execute(tf.zeros([1, WINDOW_SAMPLES, 1]), ["Identity_1", "Identity_2"]);
    });
    post({ type: "ready", backend: tf.getBackend() });
  } catch (e) {
    post({ type: "error", message: e instanceof Error ? e.message : String(e) });
  }
}

function append(samples: Float32Array): void {
  for (let i = 0; i < samples.length; i++) ring[(written + i) % RING_SAMPLES] = samples[i]!;
  written += samples.length;
}

/** The window ending at stream sample `end`, zero-padded before the stream began. */
function windowEnding(end: number): Float32Array {
  const data = new Float32Array(WINDOW_SAMPLES);
  const first = end - WINDOW_SAMPLES;
  for (let i = Math.max(0, -first); i < WINDOW_SAMPLES; i++) data[i] = ring[(first + i) % RING_SAMPLES]!;
  return data;
}

function infer(): void {
  if (!model || streamStart === null || written - lastEnd < HOP_SAMPLES) return;
  let end = Math.min(written, lastEnd + MAX_STEP);
  if (written - end > MAX_BACKLOG) {
    // This device analyses slower than real time: jump ahead and accept a gap.
    end = written;
    skipped++;
  }
  lastEnd = end;
  const firstSample = end - WINDOW_SAMPLES;
  const data = windowEnding(end);
  const t0 = performance.now();
  try {
    const [framesT, onsetsT] = tf.tidy(() => model!.execute(tf.tensor3d(data, [1, WINDOW_SAMPLES, 1]), ["Identity_1", "Identity_2"]) as tf.Tensor[]);
    const frameCount = framesT!.shape[1]!;
    // Synchronous readback: blocking is fine in a worker, and the WebGL backend's async
    // readback polls through `window`, which workers do not have.
    const frames = framesT!.dataSync() as Float32Array;
    const onsets = onsetsT!.dataSync() as Float32Array;
    framesT!.dispose();
    onsetsT!.dispose();
    if (frames.length !== frameCount * PITCHES) throw new Error("Unexpected Basic Pitch output shape.");
    const start = streamStart;
    const events = decoder.decode(frames, onsets, frameCount, firstSample).map((e) => ({
      type: e.type,
      pitch: e.pitch,
      velocity: e.velocity,
      contextTime: start + e.streamTime,
    }));
    inferences++;
    post({ type: "events", events, inferenceMs: performance.now() - t0 });
  } catch (e) {
    post({ type: "error", message: e instanceof Error ? e.message : String(e) });
  }
}

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  if (msg.type === "init") {
    audioPort = e.ports[0] ?? null;
    if (audioPort)
      audioPort.onmessage = (m: MessageEvent<{ type: "audio"; samples: Float32Array; frame: number; rate: number; postedAt: number }>) => {
        const { samples, frame, rate, postedAt } = m.data;
        if (!resampler) {
          resampler = new Resampler(rate, MODEL_RATE);
          streamStart = frame / rate;
          decoder = new OnsetDecoder();
        }
        append(resampler.push(samples));
        blocks++;
        if (performance.now() - lastStats > 1000) {
          lastStats = performance.now();
          post({ type: "stats", blocks, samples: written, inferences, backlogSec: (written - lastEnd) / MODEL_RATE, skipped });
        }
        // Blocks that waited in the queue during a slow analysis are appended without
        // analysing; once the queue is drained, one window catches up on all of them.
        if (Date.now() - postedAt < 150) infer();
      };
    void init(msg.modelUrl, msg.backend);
  } else if (msg.type === "stop") {
    audioPort?.close();
    audioPort = null;
    resampler = null;
    streamStart = null;
    written = 0;
    lastEnd = 0;
  }
};
