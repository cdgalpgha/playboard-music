import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link, useNavigate } from "react-router";
import { videoIdFrom } from "@/video/youtube-api.ts";
import { ChordControls, KeyGuide } from "../ChordControls.tsx";
import { PracticeRoom } from "../PracticeRoom.tsx";
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
      <PageHeader eyebrow="Play studio" title="Less thinking. More playing.">
        Press a letter from A to G on your computer keyboard and you're playing a chord. Plug in a piano keyboard and it
        just works. Nothing to set up.
      </PageHeader>

      <div className="space-y-4 px-4 lg:px-8">
        <section className="overflow-hidden rounded-2xl bg-stage text-white shadow-lg" aria-label="Piano">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 lg:px-5">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold tracking-[0.14em] text-white/50 uppercase">Now playing</div>
              {chords && (
                <div className="font-display text-2xl font-bold" aria-live="polite" data-testid="current-chord">
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
          <div className="space-y-2 bg-paper px-4 py-3 text-ink lg:px-5">
            <ChordControls />
            <KeyGuide />
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-soft">
          <span>
            {midiDevices.length
              ? `Piano keyboard connected: ${midiDevices.map((d) => d.name).join(", ")}`
              : "No piano keyboard connected. That's fine: use your computer keys or tap the keys above."}
          </span>
          {range.keys !== 88 && (
            <button type="button" className="underline" onClick={() => setFull(!full)}>
              {full ? `Show my ${range.keys} keys` : "Show all 88 keys"}
            </button>
          )}
        </div>

        <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
          <PracticeRoom />
          <BackingBand />
        </div>

        <details className="card group">
          <summary className="cursor-pointer text-base font-bold">
            Sound, metronome and recording <span className="ml-2 text-xs font-normal text-muted group-open:hidden">Optional</span>
          </summary>
          <div className="mt-4 grid gap-6 xl:grid-cols-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <Slider label="Volume" value={mix.volume} onChange={(v) => update({ volume: v })} />
              <Slider label="Room echo" value={mix.room} onChange={(v) => update({ room: v })} />
              <Slider
                label="Touch"
                value={mix.dynamics}
                onChange={(v) => update({ dynamics: v })}
                format={(v) => (v < 0.3 ? "Even" : v < 0.7 ? "Natural" : "Expressive")}
              />
              <Slider
                label="Computer-key loudness"
                value={qwertyVelocity}
                min={20}
                max={127}
                step={1}
                format={(v) => String(v)}
                onChange={(v) => inputStore.setState({ qwertyVelocity: v })}
              />
            </div>
            <div className="space-y-5">
              <MetronomeControl />
              <RecorderControl />
              <p className="text-xs text-muted">
                Recordings stay in this tab until you leave the page. Save them as audio (WAV) or as notes (MIDI).
              </p>
            </div>
          </div>
        </details>

        <details className="card group">
          <summary className="cursor-pointer text-base font-bold">For advanced players</summary>
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Slider label="Pedal resonance" value={mix.resonance} onChange={(v) => update({ resonance: v })} />
              <Slider label="Key release noise" value={mix.releaseNoise} onChange={(v) => update({ releaseNoise: v })} />
              <Slider label="Pedal noise" value={mix.pedalNoise} onChange={(v) => update({ pedalNoise: v })} />
            </div>
            <LatencyPanel />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Piano" value="Salamander Grand" hint={`${TIER_LABELS[tier].name} sound · ${voices} voices playing`} />
              <Stat label="Polyphony" value="96 voices" hint="plus 48 release/pedal voices" />
              <Stat label="Source" value="48 kHz / 24-bit" hint="Yamaha C5 recordings" />
              <Stat label="Keyboard" value={`${range.keys} keys`} hint={`${noteName(range.low)}–${noteName(range.high)}`} />
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

function BackingBand() {
  const navigate = useNavigate();
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  return (
    <section className="card flex flex-col gap-4" aria-labelledby="band-title">
      <div className="flex items-start justify-between">
        <div>
          <div className="eyebrow">Your backing band</div>
          <h2 id="band-title" className="mt-1 text-xl font-bold">
            Play over any song.
          </h2>
        </div>
        <span className="text-green">
          <Icon name="youtube" size={24} />
        </span>
      </div>
      <p className="text-sm text-ink-soft">
        Bring a YouTube song, karaoke or backing track and play along. The video stays visible with its creator
        credited.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const id = videoIdFrom(link);
          if (id) navigate(`/play-along?v=${id}`);
          else setError("Paste a YouTube link, like youtube.com/watch?v=…");
        }}
      >
        <label htmlFor="band-link" className="sr-only">
          YouTube link
        </label>
        <input
          id="band-link"
          className="input-select min-w-0 flex-1"
          placeholder="Paste a YouTube link…"
          value={link}
          onChange={(e) => {
            setLink(e.target.value);
            setError("");
          }}
        />
        <button className="btn-primary" aria-label="Open video">
          <Icon name="arrow" />
        </button>
      </form>
      {error && (
        <p role="alert" className="-mt-2 text-xs text-bad">
          {error}
        </p>
      )}
      <Link to="/play-along" className="mt-auto text-sm font-semibold text-green underline">
        Open the play-along room
      </Link>
    </section>
  );
}
