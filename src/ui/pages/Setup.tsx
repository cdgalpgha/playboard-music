import { useEffect, useState, type ReactNode } from "react";
import { engine } from "@/audio/engine.ts";
import { detectKeyboardRange, STANDARD_RANGES, visibleRange } from "@/core/keyboard-range.ts";
import { inputBus } from "@/input/input-bus.ts";
import { requestMidi, selectMidiInput } from "@/input/midi-input.ts";
import { useAudio } from "@/state/audio-store.ts";
import { inputStore, useInput } from "@/state/input-store.ts";
import { noteName } from "@/render/keyboard-geometry.ts";
import { PageHeader } from "../controls.tsx";
import { Icon } from "../Icon.tsx";
import { PianoKeyboard } from "../PianoKeyboard.tsx";
import { StartAudioButton } from "../StartAudioButton.tsx";

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <section className="card" aria-labelledby={`step-${n}`}>
      <div className="flex items-center gap-3">
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
            done ? "bg-green text-white" : "bg-sage-soft text-green-dark"
          }`}
          aria-hidden="true"
        >
          {done ? <Icon name="check" size={14} /> : n}
        </span>
        <h2 id={`step-${n}`} className="text-base font-bold">
          {title}
          {done && <span className="sr-only"> (done)</span>}
        </h2>
      </div>
      <div className="mt-3 space-y-3 pl-10 text-sm text-ink-soft">{children}</div>
    </section>
  );
}

function AudioStep() {
  const status = useAudio((s) => s.status);
  const output = useAudio((s) => s.output);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [outputError, setOutputError] = useState("");
  const canChoose = typeof AudioContext !== "undefined" && "setSinkId" in AudioContext.prototype;
  useEffect(() => {
    if (status !== "running") return;
    void navigator.mediaDevices
      ?.enumerateDevices?.()
      .then((list) => setOutputs(list.filter((d) => d.kind === "audiooutput" && d.label)));
  }, [status]);
  return (
    <Step n={1} title="Start audio" done={status === "running"}>
      <p>Browsers block sound until you allow it with a click or key press.</p>
      <StartAudioButton />
      {output && (
        <p>
          Output: {output.deviceLabel || "system default"} · {output.sampleRate / 1000} kHz · reported latency{" "}
          {(output.baseLatencyMs + output.outputLatencyMs).toFixed(1)} ms
        </p>
      )}
      {output?.wireless && (
        <p className="rounded-xl bg-warn-soft p-3 text-[#6e3d10]">
          This output looks like Bluetooth. Wireless audio typically adds 100–300 ms, which makes the piano feel late
          and timing scores unfair. Plug in wired headphones or speakers.
        </p>
      )}
      {canChoose && outputs.length > 1 && (
        <label className="block max-w-sm">
          <span className="field-label">Audio output</span>
          <select
            className="input-select"
            onChange={(e) =>
              void engine.setOutputDevice(e.target.value).catch((err: Error) => setOutputError(err.message))
            }
          >
            {outputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
          {outputError && <span className="text-bad">{outputError}</span>}
        </label>
      )}
    </Step>
  );
}

function InputStep() {
  const midiStatus = useInput((s) => s.midiStatus);
  const devices = useInput((s) => s.devices);
  const selectedId = useInput((s) => s.selectedId);
  const connected = devices.filter((d) => d.connected);
  return (
    <Step n={2} title="Connect your keyboard" done={midiStatus === "ready" && connected.length > 0}>
      {midiStatus === "unsupported" && (
        <p>
          This browser has no Web MIDI. Safari on macOS and all browsers on iOS do not support it. Use Chrome or Edge
          on a computer to connect a USB keyboard, or play with the on-screen keys and your computer keyboard.
        </p>
      )}
      {(midiStatus === "idle" || midiStatus === "requesting") && (
        <>
          <p>Plug in a USB MIDI keyboard (or a digital piano's USB-to-host port), then allow MIDI access.</p>
          <button type="button" className="btn-primary" disabled={midiStatus === "requesting"} onClick={() => void requestMidi()}>
            <Icon name="midi" size={16} /> {midiStatus === "requesting" ? "Waiting for permission…" : "Allow MIDI access"}
          </button>
        </>
      )}
      {midiStatus === "denied" && (
        <p className="text-bad">
          MIDI access was blocked. Open the site settings (the icon left of the address bar), allow MIDI devices, then
          reload the page.
        </p>
      )}
      {midiStatus === "ready" && (
        <>
          {connected.length === 0 ? (
            <p>No MIDI keyboard found yet. Plug one in; it appears here without reloading.</p>
          ) : (
            <fieldset className="space-y-2">
              <legend className="field-label">Listen to</legend>
              {[{ id: "all", name: "All connected inputs" }, ...connected].map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-ink">
                  <input
                    type="radio"
                    name="midi-input"
                    className="accent-green"
                    checked={selectedId === d.id}
                    onChange={() => selectMidiInput(d.id)}
                  />
                  {d.name}
                </label>
              ))}
            </fieldset>
          )}
        </>
      )}
      <p className="text-xs text-muted">
        No keyboard? Computer keys <span className="kbd">A</span> to <span className="kbd">'</span> play a white-key
        row from C, the row above plays sharps, <span className="kbd">Space</span> is the sustain pedal.
      </p>
    </Step>
  );
}

function RangeStep() {
  const range = useInput((s) => s.range);
  const confirmed = useInput((s) => s.rangeConfirmed);
  const [listening, setListening] = useState<null | { low: number | null }>(null);
  useEffect(() => {
    if (!listening) return;
    return inputBus.subscribe((e) => {
      if (e.type !== "noteon" || e.source === "playback") return;
      if (listening.low === null) setListening({ low: e.note });
      else {
        inputStore.setState({ range: detectKeyboardRange(listening.low, e.note), rangeConfirmed: true });
        setListening(null);
      }
    });
  }, [listening]);
  return (
    <Step n={3} title="Keyboard size" done={confirmed}>
      <p>
        Current: <strong className="text-ink">{range.keys} keys</strong>, {noteName(range.low)} to {noteName(range.high)}.
        Lessons fit their notes to this range.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-secondary" onClick={() => setListening({ low: null })}>
          {listening ? (listening.low === null ? "Press your lowest key…" : "Now press your highest key…") : "Detect by playing"}
        </button>
        <label className="flex items-center gap-2">
          <span className="text-xs font-semibold">or choose</span>
          <select
            className="input-select w-auto"
            value={range.keys}
            onChange={(e) => {
              const r = STANDARD_RANGES.find((x) => x.keys === Number(e.target.value));
              if (r) inputStore.setState({ range: r, rangeConfirmed: true });
            }}
          >
            {STANDARD_RANGES.map((r) => (
              <option key={r.keys} value={r.keys}>
                {r.keys} keys
              </option>
            ))}
          </select>
        </label>
      </div>
      {listening && (
        <p role="status" className="text-green-dark">
          {listening.low === null ? "Press the lowest key on your keyboard." : `Lowest: ${noteName(listening.low)}. Now the highest key.`}
        </p>
      )}
    </Step>
  );
}

function NoteTestStep() {
  const [hits, setHits] = useState<{ note: number; velocity: number; source: string }[]>([]);
  const [pedalSeen, setPedalSeen] = useState(false);
  const range = useInput((s) => s.range);
  const view = visibleRange(range);
  useEffect(
    () =>
      inputBus.subscribe((e) => {
        if (e.type === "noteon" && e.source !== "playback")
          setHits((h) => [...h.slice(-11), { note: e.note, velocity: e.velocity, source: e.source }]);
        if (e.type === "pedal" && e.value >= 64 && e.source === "midi") setPedalSeen(true);
      }),
    [],
  );
  const middleC = hits.some((h) => h.note === 60);
  return (
    <Step n={4} title="Play a note" done={middleC}>
      <p>
        Play <strong className="text-ink">middle C (C4)</strong>. Then play a few soft and loud notes to check velocity,
        and press the sustain pedal.
      </p>
      <PianoKeyboard low={view.low} high={view.high} expected={new Map([[60, "R"]])} className="h-28" />
      <div className="flex h-16 items-end gap-1" aria-label="Velocity of the last notes">
        {hits.map((h, i) => (
          <span
            key={i}
            title={`${noteName(h.note)} velocity ${h.velocity}`}
            className={`w-5 rounded-t ${h.note === 60 ? "bg-green" : "bg-sage"}`}
            style={{ height: `${(h.velocity / 127) * 100}%` }}
          />
        ))}
      </div>
      <ul className="space-y-1 text-sm">
        <li>{middleC ? "✓ Middle C received" : "… waiting for middle C"}</li>
        <li>
          {hits.length
            ? `Last: ${noteName(hits.at(-1)!.note)} at velocity ${hits.at(-1)!.velocity} from ${hits.at(-1)!.source}`
            : "No notes yet"}
        </li>
        <li>{pedalSeen ? "✓ Sustain pedal (CC64) received" : "Sustain pedal not seen yet (MIDI only)"}</li>
      </ul>
    </Step>
  );
}

export default function Setup() {
  return (
    <div className="pb-12">
      <PageHeader eyebrow="Device setup" title="Set up your piano">
        Four quick checks so sound, input and timing are right before you practise.
      </PageHeader>
      <div className="grid gap-4 px-4 lg:px-8 xl:grid-cols-2">
        <AudioStep />
        <InputStep />
        <RangeStep />
        <NoteTestStep />
      </div>
    </div>
  );
}
