import { useEffect, useRef, useState } from "react";
import { engine } from "@/audio/engine.ts";
import { scheduleClick } from "@/audio/metronome.ts";
import { analyzeTaps, matchTaps, MIN_TAPS, offsetsFrom, type TapAnalysis } from "@/core/calibration.ts";
import { inputBus } from "@/input/input-bus.ts";
import { clearCalibration, refreshOffsets, saveCalibration, useOffsets } from "@/storage/devices.ts";
import { useAudio } from "@/state/audio-store.ts";
import { useInput } from "@/state/input-store.ts";

const INTERVAL_MS = 600;
const COUNT_IN = 4;
const TARGETS = 16;

type Phase = "idle" | "audio" | "visual" | "done" | "failed";

/** Tap-along calibration: clicks you hear, then flashes you see. */
export function Calibration() {
  const status = useAudio((s) => s.status);
  const outputLabel = useAudio((s) => s.output?.deviceLabel);
  const midiSelected = useInput((s) => s.selectedId);
  const mode = useInput((s) => s.mode);
  const record = useOffsets((s) => s.record);
  const [phase, setPhase] = useState<Phase>("idle");
  const [beat, setBeat] = useState(-1);
  const [flash, setFlash] = useState(false);
  const [message, setMessage] = useState("");
  const taps = useRef<number[]>([]);
  const audioResult = useRef<TapAnalysis | null>(null);
  const cancel = useRef<() => void>(() => undefined);

  useEffect(() => void refreshOffsets(), [outputLabel, midiSelected, mode]);
  useEffect(() => () => cancel.current(), []);

  // Collect taps from every input while a pass runs.
  useEffect(() => {
    if (phase !== "audio" && phase !== "visual") return;
    return inputBus.subscribe((e) => {
      if (e.source === "playback") return;
      if (e.type === "noteon" || (e.type === "pedal" && e.value >= 64)) taps.current.push(e.time);
    });
  }, [phase]);

  const tapButton = (e: React.PointerEvent) => {
    e.preventDefault();
    taps.current.push(e.timeStamp);
  };

  const runAudio = () => {
    const ctx = engine.ctx;
    if (!ctx) return;
    taps.current = [];
    setMessage("");
    setPhase("audio");
    const start = ctx.currentTime + 0.4;
    const clickTimes = Array.from({ length: COUNT_IN + TARGETS }, (_, i) => start + (i * INTERVAL_MS) / 1000);
    clickTimes.forEach((t, i) => scheduleClick(t, i % 4 === 0, 0.9));
    const targets = clickTimes.slice(COUNT_IN).map((t) => engine.heardAt(t));
    const timers = clickTimes.map((t, i) =>
      setTimeout(() => setBeat(i), Math.max(0, engine.heardAt(t) - performance.now())),
    );
    const done = setTimeout(() => {
      const errors = matchTaps(taps.current, targets, INTERVAL_MS * 0.4);
      const result = analyzeTaps(errors);
      setBeat(-1);
      if (!result) {
        setPhase("failed");
        setMessage(`Only ${errors.length} usable taps. Tap every click after the first four, then try again.`);
        return;
      }
      audioResult.current = result;
      runVisual();
    }, targets.at(-1)! - performance.now() + 800);
    cancel.current = () => {
      timers.forEach(clearTimeout);
      clearTimeout(done);
    };
  };

  const runVisual = () => {
    taps.current = [];
    setPhase("visual");
    const targets: number[] = [];
    let next = performance.now() + 1200;
    let count = 0;
    let raf = 0;
    const loop = (ts: number) => {
      if (count < COUNT_IN + TARGETS && ts >= next - 4) {
        // The frame time is when this flash is drawn.
        if (count >= COUNT_IN) targets.push(ts);
        setFlash(true);
        setBeat(count);
        setTimeout(() => setFlash(false), 110);
        count++;
        next += INTERVAL_MS;
      }
      if (count < COUNT_IN + TARGETS) raf = requestAnimationFrame(loop);
      else
        setTimeout(() => {
          const errors = matchTaps(taps.current, targets, INTERVAL_MS * 0.4);
          const visual = analyzeTaps(errors);
          setBeat(-1);
          if (!visual || !audioResult.current) {
            setPhase("failed");
            setMessage(`Only ${errors.length} usable taps on the flashes. Try again.`);
            return;
          }
          const offsets = offsetsFrom(audioResult.current, visual);
          void saveCalibration({
            ...offsets,
            taps: audioResult.current.kept + visual.kept,
            spreadMs: Math.round(Math.max(audioResult.current.spreadMs, visual.spreadMs)),
          });
          setPhase("done");
        }, 800);
    };
    raf = requestAnimationFrame(loop);
    cancel.current = () => cancelAnimationFrame(raf);
  };

  const running = phase === "audio" || phase === "visual";
  return (
    <div className="space-y-3">
      <p>
        Tap along so scores account for your keyboard, screen and speakers. First tap with the clicks you hear, then
        with the flashes you see. Use a piano key, the sustain pedal, Space, or the tap pad. Skip the first{" "}
        {COUNT_IN} of each.
      </p>
      {record ? (
        <p className="rounded-xl bg-sage-soft p-3 text-green-dark" data-testid="calibration-result">
          {record.inputName} → {record.outputName}: input offset <strong>{record.inputOffsetMs.toFixed(0)} ms</strong>,
          audio offset <strong>{record.audioOffsetMs.toFixed(0)} ms</strong> (spread ±{record.spreadMs} ms,{" "}
          {record.taps} taps).
        </p>
      ) : (
        <p className="text-xs text-muted">Not calibrated for this keyboard and output yet. Offsets are 0 ms.</p>
      )}
      {message && <p className="text-bad">{message}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" disabled={status !== "running" || running} onClick={runAudio}>
          {phase === "done" || record ? "Calibrate again" : "Start calibration"}
        </button>
        {record && !running && (
          <button type="button" className="btn-ghost" onClick={() => void clearCalibration()}>
            Reset to 0 ms
          </button>
        )}
      </div>
      {running && (
        <div className="flex items-center gap-5" aria-live="polite">
          <button
            type="button"
            data-testid="cal-pad"
            data-flash={phase === "visual" && flash ? "on" : "off"}
            onPointerDown={tapButton}
            onKeyDown={(e) => {
              if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                e.preventDefault();
                taps.current.push(e.timeStamp);
              }
            }}
            className={`grid h-28 w-28 place-items-center rounded-full border-4 text-lg font-bold transition-none select-none ${
              phase === "visual" && flash ? "border-green bg-green text-white" : "border-sage bg-card text-green-dark"
            }`}
          >
            Tap
          </button>
          <div>
            <div className="font-semibold text-ink">
              {phase === "audio" ? "Tap with each click you hear" : "Tap with each flash you see"}
            </div>
            <div className="text-sm text-ink-soft" data-testid="cal-beat">
              {beat < 0 ? "Get ready…" : beat < COUNT_IN ? `Listen: ${COUNT_IN - beat}` : `${beat - COUNT_IN + 1} / ${TARGETS}`}
            </div>
            <div className="text-xs text-muted">At least {MIN_TAPS} steady taps are needed.</div>
          </div>
        </div>
      )}
    </div>
  );
}
