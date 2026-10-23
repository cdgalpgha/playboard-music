import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useMediaQuery } from "../useMediaQuery.ts";
import { engine, type MixSettings } from "@/audio/engine.ts";
import { Metronome } from "@/audio/metronome.ts";
import { recorder, Recorder, MAX_TAKE_SECONDS, type Take } from "@/audio/recorder.ts";
import { TIER_LABELS } from "@/audio/samples/manifest.ts";
import { inputBus } from "@/input/input-bus.ts";
import { enableChordKeys } from "@/input/computer-keyboard.ts";
import { visibleRange, FULL_RANGE } from "@/core/keyboard-range.ts";
import { useAudio } from "@/state/audio-store.ts";
import { inputStore, useInput } from "@/state/input-store.ts";
import { noteName } from "@/render/keyboard-geometry.ts";
import { PageHeader, Slider, Stat } from "../controls.tsx";
import { Icon } from "../Icon.tsx";
import { LatencyPanel } from "../LatencyPanel.tsx";
import { PianoKeyboard } from "../PianoKeyboard.tsx";
import { StartAudioButton } from "../StartAudioButton.tsx";

const subscribe = (cb: () => void) => inputBus.subscribeView(cb);
const snapshot = () => inputBus.version;

function HeldNotes() {
  useSyncExternalStore(subscribe, snapshot);
  const notes = inputBus.heldNotes();
  return (
    <div className="flex min-h-7 flex-wrap items-center gap-1.5" aria-live="polite">
      {notes.length ? (
        notes.map((n) => (
          <span key={n} className="rounded-md bg-stage-2 px-2 py-0.5 text-xs font-semibold text-white tabular-nums">
            {noteName(n)} <span className="text-white/50">{inputBus.velocityOf(n)}</span>
          </span>
        ))
      ) : (
        <span className="text-xs text-white/50">Play something</span>
      )}
      <span
        className={`ml-auto rounded-md px-2 py-0.5 text-xs font-semibold ${
          inputBus.pedalDown ? "bg-rh text-stage" : "bg-stage-2 text-white/50"
        }`}
      >
        Pedal {inputBus.pedalDown ? "down" : "up"}
      </span>
    </div>
  );
}

function OutputMeter() {
  const peak = useAudio((s) => s.stats.peak);
  const db = peak > 0 ? 20 * Math.log10(peak) : -90;
  const pct = Math.max(0, Math.min(100, ((db + 48) / 48) * 100));
  return (
    <div className="flex items-center gap-2" aria-label={`Output level ${db > -90 ? db.toFixed(0) : "-∞"} dB`}>
      <span className="h-2 w-28 overflow-hidden rounded-full bg-line">
        <span
          className={`block h-full ${db > -1 ? "bg-bad" : db > -6 ? "bg-lh" : "bg-green"}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="w-12 text-xs text-muted tabular-nums">{db > -90 ? `${db.toFixed(0)} dB` : "—"}</span>
    </div>
  );
}

function MetronomeControl() {
  const metronome = useRef<Metronome | null>(null);
  const [running, setRunning] = useState(false);
  const [bpm, setBpm] = useState(90);
  const [beat, setBeat] = useState(-1);
  const audioRunning = useAudio((s) => s.status === "running");
  useEffect(() => () => metronome.current?.stop(), []);
  const toggle = () => {
    metronome.current ??= new Metronome();
    const m = metronome.current;
    m.onBeat = (b) => setBeat(b % m.beatsPerBar);
    if (m.running) {
      m.stop();
      setRunning(false);
      setBeat(-1);
    } else {
      m.setBpm(bpm);
      m.start();
      setRunning(true);
    }
  };
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="w-44">
        <Slider
          label="Metronome tempo"
          value={bpm}
          min={30}
          max={220}
          step={1}
          format={(v) => `${v} BPM`}
          onChange={(v) => {
            setBpm(v);
            metronome.current?.setBpm(v);
          }}
        />
      </div>
      <button type="button" className="btn-secondary" aria-pressed={running} disabled={!audioRunning} onClick={toggle}>
        <Icon name="metronome" size={16} />
        {running ? "Stop metronome" : "Metronome"}
      </button>
      <div className="flex gap-1.5 pb-3" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-2.5 w-2.5 rounded-full ${beat === i ? (i === 0 ? "bg-lh" : "bg-green") : "bg-line"}`} />
        ))}
      </div>
    </div>
  );
}

function RecorderControl() {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [take, setTake] = useState<Take | null>(null);
  const [replaying, setReplaying] = useState(false);
  const audioRunning = useAudio((s) => s.status === "running");

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => {
      const e = recorder.elapsed();
      setElapsed(e);
      if (e >= MAX_TAKE_SECONDS) void stop();
    }, 250);
    return () => clearInterval(t);
  });

  const stop = async () => {
    const result = await recorder.stop();
    setRecording(false);
    setTake(result);
  };

  const download = (kind: "wav" | "mid") => {
    if (!take) return;
    const url = URL.createObjectURL(kind === "wav" ? Recorder.wav(take) : Recorder.midi(take));
    const a = document.createElement("a");
    a.href = url;
    a.download = `playboard-take-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${kind}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const notes = take?.events.filter((e) => e.type === "on").length ?? 0;
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {recording ? (
        <button type="button" className="btn-primary bg-bad hover:bg-bad/90" onClick={() => void stop()}>
          <Icon name="stop" size={16} /> Stop · {mmss(elapsed)}
        </button>
      ) : (
        <button
          type="button"
          className="btn-secondary"
          disabled={!audioRunning || replaying}
          onClick={() => {
            recorder.start();
            setRecording(true);
            setElapsed(0);
          }}
        >
          <Icon name="record" size={16} className="text-bad" /> Record
        </button>
      )}
      {take && !recording && (
        <>
          <span className="text-sm text-ink-soft">
            Take: {notes} notes · {mmss(take.duration)}
          </span>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              if (replaying) {
                recorder.stopReplay();
                setReplaying(false);
              } else {
                setReplaying(true);
                recorder.replay(take, () => setReplaying(false));
              }
            }}
          >
            <Icon name={replaying ? "stop" : "replay"} size={16} /> {replaying ? "Stop replay" : "Replay"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => download("wav")} disabled={!take.left.length}>
            <Icon name="download" size={16} /> Export WAV
          </button>
          <button type="button" className="btn-secondary" onClick={() => download("mid")} disabled={!notes}>
            <Icon name="download" size={16} /> Export MIDI
          </button>
        </>
      )}
    </div>
  );
}

export default function FreePlay() {
  const status = useAudio((s) => s.status);
  const tier = useAudio((s) => s.tier);
  const voices = useAudio((s) => s.stats.voices + s.stats.auxVoices);
  const range = useInput((s) => s.range);
  const devices = useInput((s) => s.devices);
  const midiDevices = devices.filter((d) => d.connected);
  const qwertyOctave = useInput((s) => s.qwertyOctave);
  const qwertyVelocity = useInput((s) => s.qwertyVelocity);
  const qwertyMode = useInput((s) => s.qwertyMode);
  const lastChord = useInput((s) => s.lastChord);
  useEffect(() => enableChordKeys(), []);
  const chords = qwertyMode === "chords";
  const [mix, setMix] = useState<MixSettings>(() => engine.getMix());
  const [full, setFull] = useState(range.keys === 88);
  useEffect(() => {
    if (status === "running") setMix(engine.getMix());
  }, [status]);
  const narrow = useMediaQuery("(max-width: 639px)");
  const [windowStart, setWindowStart] = useState(48);
  const fullView = visibleRange(full ? FULL_RANGE : range);
  // Phones get a two-octave window so keys stay wide enough to touch.
  const view = narrow
    ? { low: Math.max(fullView.low, windowStart), high: Math.min(fullView.high, windowStart + 24) }
    : fullView;
  const shiftWindow = (delta: number) =>
    setWindowStart((w) => Math.max(fullView.low - (fullView.low % 12), Math.min(fullView.high - 24, w + delta)));
  const update = (patch: Partial<MixSettings>) => {
    setMix((m) => ({ ...m, ...patch }));
    engine.setMix(patch);
  };

  return (
    <div className="pb-12">
      <PageHeader eyebrow="Free play" title="The studio grand">
        Salamander Grand Piano (Yamaha C5) with velocity layers, damper and release sounds, sustain-pedal resonance and
        pedal mechanics. Play with a MIDI keyboard, the on-screen keys, or your computer keyboard.
      </PageHeader>

      <div className="space-y-4 px-4 lg:px-8">
        <section className="overflow-hidden rounded-2xl bg-stage text-white shadow-lg" aria-label="Instrument">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 lg:px-5">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold tracking-[0.14em] text-white/50 uppercase">
                {TIER_LABELS[tier].name} tier · {voices} voices
              </div>
              {chords && (
                <div className="text-2xl font-bold" aria-live="polite" data-testid="current-chord">
                  {lastChord || "Press A–G"}
                </div>
              )}
              <HeldNotes />
            </div>
            <OutputMeter />
            {status !== "running" && <StartAudioButton />}
          </div>
          <PianoKeyboard
            low={view.low}
            high={view.high}
            labels={chords ? "chords" : "c"}
            qwertyOctave={qwertyOctave}
            className="h-44 sm:h-52"
          />
          {narrow && (
            <div className="flex items-center justify-between px-3 py-2 text-xs text-white/70">
              <button type="button" className="btn-ghost text-white/80" onClick={() => shiftWindow(-12)}>
                ◀ Octave down
              </button>
              <span>
                {noteName(view.low)}–{noteName(view.high)}
              </span>
              <button type="button" className="btn-ghost text-white/80" onClick={() => shiftWindow(12)}>
                Octave up ▶
              </button>
            </div>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-soft">
          <span>
            {midiDevices.length ? `MIDI: ${midiDevices.map((d) => d.name).join(", ")}` : "No MIDI keyboard connected"}
          </span>
          <div className="inline-flex rounded-lg border border-line bg-white p-0.5" role="group" aria-label="Computer keys">
            {(["chords", "notes"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={qwertyMode === m}
                className={`rounded-md px-3 py-1 font-semibold ${qwertyMode === m ? "bg-green text-white" : "text-ink-soft"}`}
                onClick={(e) => {
                  inputStore.setState({ qwertyMode: m, lastChord: "" });
                  e.currentTarget.blur();
                }}
              >
                {m === "chords" ? "Chord mode" : "Piano mode"}
              </button>
            ))}
          </div>
          {chords ? (
            <span>
              <span className="kbd">A</span>–<span className="kbd">G</span> major, <span className="kbd">Shift</span> +
              key minor, <span className="kbd">Space</span> + key sharp, <span className="kbd">Z</span>/
              <span className="kbd">X</span> octave (C{qwertyOctave})
            </span>
          ) : (
            <span>
              Computer keys <span className="kbd">A</span>–<span className="kbd">'</span> play from C{qwertyOctave},{" "}
              <span className="kbd">Z</span>/<span className="kbd">X</span> octave, <span className="kbd">Space</span>{" "}
              sustain
            </span>
          )}
          {range.keys !== 88 && (
            <button type="button" className="underline" onClick={() => setFull(!full)}>
              {full ? `Show my ${range.keys} keys` : "Show all 88 keys"}
            </button>
          )}
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="card space-y-4" aria-labelledby="sound-title">
            <h2 id="sound-title" className="text-base font-bold">
              Sound
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Slider label="Volume" value={mix.volume} onChange={(v) => update({ volume: v })} />
              <Slider label="Room" value={mix.room} onChange={(v) => update({ room: v })} />
              <Slider
                label="Touch dynamics"
                value={mix.dynamics}
                onChange={(v) => update({ dynamics: v })}
                format={(v) => (v < 0.3 ? "Flat" : v < 0.7 ? "Natural" : "Wide")}
              />
              <Slider label="Pedal resonance" value={mix.resonance} onChange={(v) => update({ resonance: v })} />
              <Slider label="Release noise" value={mix.releaseNoise} onChange={(v) => update({ releaseNoise: v })} />
              <Slider label="Pedal noise" value={mix.pedalNoise} onChange={(v) => update({ pedalNoise: v })} />
              <Slider
                label="Computer-key velocity"
                value={qwertyVelocity}
                min={20}
                max={127}
                step={1}
                format={(v) => String(v)}
                onChange={(v) => inputStore.setState({ qwertyVelocity: v })}
              />
            </div>
          </section>

          <section className="card space-y-5" aria-labelledby="tools-title">
            <h2 id="tools-title" className="text-base font-bold">
              Practice tools
            </h2>
            <MetronomeControl />
            <RecorderControl />
            <p className="text-xs text-muted">
              Takes stay in this tab until you leave the page. Export WAV saves the piano with room sound, without the
              metronome; Export MIDI saves the notes, velocities and pedal. Up to 10 minutes per take.
            </p>
          </section>
        </div>

        <LatencyPanel />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="card">
            <Stat label="Polyphony" value="96 voices" hint="plus 48 release/pedal voices" />
          </div>
          <div className="card">
            <Stat label="Engine" value="AudioWorklet" hint="4-point interpolation" />
          </div>
          <div className="card">
            <Stat label="Source" value="48 kHz / 24-bit" hint="Salamander Grand V3" />
          </div>
          <div className="card">
            <Stat label="Keyboard" value={`${range.keys} keys`} hint={`${noteName(range.low)}–${noteName(range.high)}`} />
          </div>
        </div>
      </div>
    </div>
  );
}
