import { engine, setAudioSession } from "@/audio/engine.ts";
import { inputBus } from "@/input/input-bus.ts";
import { inputStore, type InputState } from "@/state/input-store.ts";
import type { WorkerOut } from "./pitch.worker.ts";

let stream: MediaStream | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let capture: AudioWorkletNode | null = null;
let analyser: AnalyserNode | null = null;
let worker: Worker | null = null;
let levelTimer: ReturnType<typeof setInterval> | null = null;
let inputLatencyMs = 10;
const delays: number[] = [];

const setMic = (patch: Partial<InputState["mic"]>) =>
  inputStore.setState((s) => ({ mic: { ...s.mic, ...patch } }));

/** Seconds that misses are held back in microphone mode, so late detections can still score. */
export function micScoringLagSec(): number {
  const d = inputStore.getState().mic.delayMs;
  return Math.max(0.45, (d || 600) / 1000 + 0.15);
}

/**
 * When a sample captured at context time `t` reached the microphone, in
 * performance.now() ms: the moment `t` is rendered, minus the input latency.
 */
function capturePerf(contextTime: number): number {
  const ctx = engine.ctx!;
  const renderLatency = ((ctx.baseLatency || 0) + (ctx.outputLatency || 0)) * 1000;
  return engine.heardAt(contextTime) - renderLatency - inputLatencyMs;
}

function onWorker(msg: WorkerOut): void {
  if (msg.type === "ready") setMic({ status: "listening", backend: msg.backend, error: "" });
  else if (msg.type === "stats")
    setMic({ blocks: msg.blocks, inferences: msg.inferences, backlogSec: msg.backlogSec, skipped: msg.skipped });
  else if (msg.type === "error") setMic({ status: "error", error: msg.message });
  else if (msg.type === "events") {
    const now = performance.now();
    const notes: number[] = [];
    for (const e of msg.events) {
      const time = capturePerf(e.contextTime);
      if (e.type === "on") {
        delays.push(now - time);
        if (delays.length > 50) delays.shift();
        notes.push(e.pitch);
        inputBus.emit({ type: "noteon", note: e.pitch, velocity: e.velocity, time, source: "mic" });
      } else inputBus.emit({ type: "noteoff", note: e.pitch, time, source: "mic" });
    }
    const sorted = [...delays].sort((a, b) => a - b);
    setMic({
      inferenceMs: Math.round(msg.inferenceMs),
      ...(sorted.length ? { delayMs: Math.round(sorted[sorted.length >> 1]!) } : {}),
      ...(notes.length ? { lastNotes: [...inputStore.getState().mic.lastNotes, ...notes].slice(-12) } : {}),
    });
  }
}

/** Starts listening. Call from a user gesture; asks for microphone permission. */
export async function startMic(): Promise<void> {
  if (worker) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    setMic({ status: "unsupported" });
    return;
  }
  await engine.start();
  const ctx = engine.ctx!;
  setMic({ status: "starting", error: "" });
  setAudioSession("play-and-record");
  try {
    // Processing meant for speech (echo cancellation, noise suppression, AGC) damages music.
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
  } catch (e) {
    setMic({ status: (e as Error).name === "NotAllowedError" ? "denied" : "error", error: (e as Error).message });
    return;
  }
  const settings = stream.getAudioTracks()[0]?.getSettings() as MediaTrackSettings & { latency?: number };
  if (settings?.latency) inputLatencyMs = settings.latency * 1000;
  source = ctx.createMediaStreamSource(stream);
  capture = new AudioWorkletNode(ctx, "playboard-capture", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
  // The capture node must be pulled by the graph; its output is silent.
  const sink = ctx.createGain();
  sink.gain.value = 0;
  analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(capture).connect(sink).connect(ctx.destination);
  source.connect(analyser);
  worker = new Worker(new URL("./pitch.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<WorkerOut>) => onWorker(e.data);
  worker.onerror = (e) => setMic({ status: "error", error: e.message || "The pitch detector failed to start." });
  const channel = new MessageChannel();
  capture.port.postMessage({ type: "port" }, [channel.port1]);
  // `?detector=cpu` forces TensorFlow's CPU backend (for comparing speed on a given machine).
  const backend = new URLSearchParams(location.search).get("detector") === "cpu" ? "cpu" : "webgl";
  worker.postMessage({ type: "init", modelUrl: "/models/basic-pitch/model.json", backend }, [channel.port2]);
  inputStore.setState({ mode: "mic" });
  const buf = new Float32Array(1024);
  levelTimer = setInterval(() => {
    if (!analyser) return;
    analyser.getFloatTimeDomainData(buf);
    let s = 0;
    for (const x of buf) s += x * x;
    setMic({ level: Math.min(1, Math.sqrt(s / buf.length) * 6) });
  }, 100);
}

export function stopMic(): void {
  capture?.port.postMessage({ type: "stop" });
  worker?.postMessage({ type: "stop" });
  worker?.terminate();
  worker = null;
  capture?.disconnect();
  source?.disconnect();
  stream?.getTracks().forEach((t) => t.stop());
  stream = capture = source = analyser = null;
  if (levelTimer) clearInterval(levelTimer);
  levelTimer = null;
  setMic({ status: "off", level: 0 });
  setAudioSession("playback");
  const s = inputStore.getState();
  inputStore.setState({ mode: s.midiStatus === "ready" ? "midi" : "keyboard" });
  inputBus.releaseAll();
}
