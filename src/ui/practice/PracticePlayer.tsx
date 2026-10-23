import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { pitchRange, type Chart, type Hand } from "@/core/chart.ts";
import { visibleRange } from "@/core/keyboard-range.ts";
import { PracticeSession, type SessionState } from "@/practice/session.ts";
import type { TransportLike } from "@/core/transport.ts";
import { noteName } from "@/render/keyboard-geometry.ts";
import { refreshOffsets, useOffsets } from "@/storage/devices.ts";
import { useAudio } from "@/state/audio-store.ts";
import { useInput } from "@/state/input-store.ts";
import { Icon } from "../Icon.tsx";
import { PianoKeyboard } from "../PianoKeyboard.tsx";
import { StartAudioButton } from "../StartAudioButton.tsx";
import { useMediaQuery } from "../useMediaQuery.ts";
import { FallingNotesView } from "./FallingNotesView.tsx";
import { JUDGEMENT_STYLE, ResultsPanel } from "./Results.tsx";

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-line bg-card p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-[10px] px-3 py-1.5 text-sm font-semibold ${
            value === o.value ? "bg-green text-white" : "text-ink-soft hover:bg-sage-soft"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ToggleButton({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`btn border ${pressed ? "border-green bg-sage-soft text-green-dark" : "border-line bg-card text-ink-soft hover:bg-sage-soft"}`}
    >
      {children}
    </button>
  );
}

export function usePracticeSession(
  chart: Chart,
  meta?: ConstructorParameters<typeof PracticeSession>[1],
  initial?: Parameters<PracticeSession["update"]>[0],
  transport?: TransportLike,
): PracticeSession {
  const session = useMemo(() => {
    const s = new PracticeSession(chart, meta, transport);
    if (initial) s.update(initial);
    return s;
  }, [chart, transport]);
  useEffect(() => {
    session.attach();
    return () => session.detach();
  }, [session]);
  return session;
}

export function PracticePlayer({
  chart,
  session,
  above,
}: {
  chart: Chart;
  session: PracticeSession;
  /** Rendered between the controls and the stage (sheet music, video). */
  above?: ReactNode;
}) {
  const useSession = <T,>(sel: (st: SessionState) => T) => useStore(session.store, sel);
  const status = useSession((x) => x.status);
  const rate = useSession((x) => x.rate);
  const hands = useSession((x) => x.hands);
  const wait = useSession((x) => x.wait);
  const autoplayOther = useSession((x) => x.autoplayOther);
  const listen = useSession((x) => x.listen);
  const metronome = useSession((x) => x.metronome);
  const loop = useSession((x) => x.loop);
  const measure = useSession((x) => x.measure);
  const live = useSession((x) => x.live);
  const summary = useSession((x) => x.summary);
  const passes = useSession((x) => x.passes);
  const waitProgress = useSession((x) => x.waitProgress);
  const fps = useSession((x) => x.fps);
  const audioStatus = useAudio((x) => x.status);
  const inputOffset = useOffsets((x) => x.inputOffsetMs);
  const calibrated = useOffsets((x) => x.record !== null);
  const userRange = useInput((x) => x.range);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [expected, setExpected] = useState<Map<number, Hand>>(new Map());
  const [secondsAhead, setSecondsAhead] = useState(3);
  const [showFingers, setShowFingers] = useState(true);
  const [loopFrom, setLoopFrom] = useState(0);
  const [loopTo, setLoopTo] = useState(Math.min(3, chart.measures.length - 1));

  useEffect(() => void refreshOffsets(), []);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // Dev-only test handle (see DECISIONS D15).
    const w = window as unknown as { __pb?: Record<string, unknown> };
    w.__pb = { ...w.__pb, session };
  }, [session]);

  const range = pitchRange(chart);
  const view = visibleRange({ keys: 0, low: Math.max(21, range.low - 3), high: Math.min(108, range.high + 3) });
  // Keep at least two octaves on screen so keys are a familiar size.
  if (view.high - view.low < 24) {
    const pad = Math.ceil((24 - (view.high - view.low)) / 2);
    Object.assign(view, visibleRange({ keys: 0, low: Math.max(21, view.low - pad), high: Math.min(108, view.high + pad) }));
  }
  const outOfRange = range.low < userRange.low || range.high > userRange.high;
  const playing = status === "playing" || status === "countin";
  const handMode = hands.length === 2 ? "both" : hands[0] === "R" ? "R" : "L";
  const judged = live.judged;
  const liveAccuracy =
    judged > 0
      ? Math.max(
          0,
          ((live.counts.perfect + live.counts.good * 0.85 + (live.counts.early + live.counts.late) * 0.5 - live.wrong * 0.25) /
            judged) *
            100,
        )
      : null;
  const bpm = Math.round((chart.tempo[0]?.bpm ?? 120) * rate);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary min-w-28" onClick={() => session.toggle()} aria-keyshortcuts="Enter">
          <Icon name={playing ? "pause" : "play"} size={16} />
          {playing ? "Pause" : status === "finished" ? "Play again" : status === "paused" ? "Resume" : "Play"}
        </button>
        <button type="button" className="btn-secondary" onClick={() => session.restart()}>
          <Icon name="replay" size={16} /> Restart
        </button>
        <span className="chip" aria-live="polite">
          Measure {chart.measures[measure]?.label ?? 1} / {chart.measures.length}
        </span>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <span className="font-semibold text-ink-soft">Tempo</span>
          <input
            type="range"
            min={0.25}
            max={1.5}
            step={0.05}
            value={rate}
            onChange={(e) => session.update({ rate: Number(e.target.value) })}
            className="w-32 accent-green"
            aria-label="Practice tempo"
            aria-valuetext={`${Math.round(rate * 100)} percent, ${bpm} beats per minute`}
          />
          <span className="w-20 text-xs text-muted tabular-nums">
            {Math.round(rate * 100)}% · {bpm}
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Hands"
          value={listen ? "listen" : handMode}
          options={[
            { value: "both", label: "Both hands" },
            { value: "R", label: "Right" },
            { value: "L", label: "Left" },
            { value: "listen", label: "Listen" },
          ]}
          onChange={(v) => {
            if (v === "listen") session.update({ listen: true });
            else session.update({ listen: false, hands: v === "both" ? ["L", "R"] : [v as Hand] });
          }}
        />
        {!listen && hands.length === 1 && (
          <ToggleButton pressed={autoplayOther} onClick={() => session.update({ autoplayOther: !autoplayOther })}>
            Play other hand
          </ToggleButton>
        )}
        <ToggleButton pressed={wait} onClick={() => session.update({ wait: !wait })}>
          Wait for me
        </ToggleButton>
        <ToggleButton pressed={metronome} onClick={() => session.update({ metronome: !metronome })}>
          <Icon name="metronome" size={16} /> Metronome
        </ToggleButton>
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-card px-2 py-1">
          <span className="text-xs font-semibold text-ink-soft">Loop</span>
          <label className="sr-only" htmlFor="loop-from">
            Loop from measure
          </label>
          <select id="loop-from" className="rounded-lg bg-paper px-1.5 py-1 text-sm" value={loopFrom} onChange={(e) => setLoopFrom(Number(e.target.value))}>
            {chart.measures.map((m) => (
              <option key={m.index} value={m.index}>
                m. {m.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted">to</span>
          <label className="sr-only" htmlFor="loop-to">
            Loop to measure
          </label>
          <select id="loop-to" className="rounded-lg bg-paper px-1.5 py-1 text-sm" value={loopTo} onChange={(e) => setLoopTo(Number(e.target.value))}>
            {chart.measures.map((m) => (
              <option key={m.index} value={m.index} disabled={m.index < loopFrom}>
                m. {m.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-pressed={loop !== null}
            className={`rounded-lg px-2 py-1 text-sm font-semibold ${loop ? "bg-green text-white" : "text-green hover:bg-sage-soft"}`}
            onClick={() => (loop ? session.setLoop(null) : session.setLoop(loopFrom, Math.max(loopFrom, loopTo)))}
          >
            {loop ? "Looping" : "Set loop"}
          </button>
        </div>
      </div>

      {above}

      <section className="overflow-hidden rounded-2xl bg-stage shadow-lg" aria-label="Practice stage">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-xs text-white/70">
          {listen ? (
            <span>Listening: Playboard plays every note.</span>
          ) : wait ? (
            <span data-testid="wait-progress">
              Wait for me · {waitProgress ? `${waitProgress.done}/${waitProgress.total} chords` : ""}
            </span>
          ) : (
            <span data-testid="live-accuracy">Accuracy {liveAccuracy === null ? "—" : `${Math.round(liveAccuracy)}%`}</span>
          )}
          {!listen && !wait && (
            <>
              <span>Combo {live.combo}</span>
              {(["perfect", "good", "early", "late", "miss"] as const).map((j) => (
                <span key={j} style={{ color: j === "miss" ? "#e88" : undefined }}>
                  {JUDGEMENT_STYLE[j].label} {live.counts[j]}
                </span>
              ))}
              <span>Wrong {live.wrong}</span>
            </>
          )}
          <span className="ml-auto">
            {calibrated ? `Input offset ${inputOffset.toFixed(0)} ms` : "Not calibrated"}
            {fps ? ` · ${Math.round(fps.mean)} fps` : ""}
          </span>
          {audioStatus !== "running" && <StartAudioButton className="py-1" />}
        </div>
        <div className="h-[340px] sm:h-[400px]">
          <FallingNotesView
            session={session}
            low={view.low}
            high={view.high}
            secondsAhead={secondsAhead}
            showFingers={showFingers}
            reducedMotion={reducedMotion}
            onExpected={setExpected}
          />
        </div>
        <PianoKeyboard low={view.low} high={view.high} expected={expected} labels="c" className="h-28 sm:h-32" />
      </section>

      <div className="flex flex-wrap items-center gap-4 text-xs text-ink-soft">
        <label className="flex items-center gap-2">
          Note speed
          <input
            type="range"
            min={1.5}
            max={6}
            step={0.5}
            value={7.5 - secondsAhead}
            onChange={(e) => setSecondsAhead(7.5 - Number(e.target.value))}
            className="w-24 accent-green"
            aria-label="Falling note speed"
          />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="accent-green" checked={showFingers} onChange={(e) => setShowFingers(e.target.checked)} />
          Finger numbers
        </label>
        {outOfRange && (
          <span className="text-warn">
            This piece uses {noteName(range.low)}–{noteName(range.high)}; your keyboard is set to {noteName(userRange.low)}–
            {noteName(userRange.high)}.
          </span>
        )}
      </div>

      {summary && <ResultsPanel summary={summary} onLoop={(m) => session.setLoop(m, m)} />}
      {passes.length > 0 && (
        <section className="card" aria-labelledby="passes-title">
          <h2 id="passes-title" className="text-base font-bold">
            Loop passes
          </h2>
          <ol className="mt-2 flex flex-wrap gap-2">
            {passes.map((p, i) => (
              <li key={i} className="chip">
                Pass {i + 1}: <strong className="tabular-nums">{Math.round(p.accuracy)}%</strong>
              </li>
            ))}
          </ol>
          <ResultsPanel summary={passes.at(-1)!} title="Last pass" onLoop={(m) => session.setLoop(m, m)} />
        </section>
      )}
    </div>
  );
}
