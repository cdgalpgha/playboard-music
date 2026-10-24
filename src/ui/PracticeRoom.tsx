import { useEffect, useRef, useState } from "react";
import { engine } from "@/audio/engine.ts";
import { scheduleClick } from "@/audio/metronome.ts";
import { barTiming, chordName, chordNotes, holdsChord, letterPitchClass, PROGRESSIONS, QUALITIES } from "@/core/chords.ts";
import { inputBus } from "@/input/input-bus.ts";
import { useInput } from "@/state/input-store.ts";
import { Icon } from "./Icon.tsx";

/** Chords count as on the beat within this many seconds of the bar line. */
const WINDOW = 0.22;

/**
 * The practice room from Playboard v0.2: a four-chord progression with soft
 * backing chords and a click. Play the highlighted chord on beat one of each bar.
 */
export function PracticeRoom() {
  const [genre, setGenre] = useState("Pop");
  const [bpm, setBpm] = useState(80);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [beat, setBeat] = useState(-1);
  const [hits, setHits] = useState(0);
  const [feedback, setFeedback] = useState("Play the highlighted chord on beat one. Any octave or inversion counts.");
  const transpose = useInput((s) => s.chordTranspose);
  const run = useRef<{ stop: () => void } | null>(null);
  const progression = PROGRESSIONS[genre]!;

  const stop = () => {
    run.current?.stop();
    run.current = null;
    setRunning(false);
    setBeat(-1);
  };
  useEffect(() => stop, []);
  useEffect(() => stop(), [genre, bpm]);

  const start = async () => {
    if (running) return stop();
    if (!engine.running) await engine.start();
    const ctx = engine.ctx;
    const sampler = engine.sampler;
    if (!ctx || !sampler) return;
    const beatSec = 60 / bpm;
    const barSec = beatSec * 4;
    const t0 = ctx.currentTime + 0.4;
    let nextBeat = 0;
    let scoredBar = -1;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const expectedAt = (bar: number) => {
      const [letter, quality] = progression[((bar % 4) + 4) % 4]!;
      return { pc: (letterPitchClass(letter) + transpose + 12) % 12, quality };
    };
    const schedule = () => {
      while (t0 + nextBeat * beatSec < ctx.currentTime + 0.15) {
        const when = t0 + nextBeat * beatSec;
        const b = nextBeat;
        if (b % 4 === 0) {
          const { pc, quality } = expectedAt(b / 4);
          for (const n of chordNotes(pc, quality, 3)) {
            sampler.noteOn(n, 38, when);
            sampler.noteOff(n, when + beatSec * 3.6);
          }
        }
        scheduleClick(when, b % 4 === 0, 0.5);
        timers.push(
          setTimeout(
            () => {
              setBeat(b % 4);
              setStep(Math.floor(b / 4) % 4);
            },
            Math.max(0, (when - ctx.currentTime) * 1000),
          ),
        );
        nextBeat++;
      }
    };
    const interval = setInterval(schedule, 25);
    schedule();
    const unsubscribe = inputBus.subscribe((e) => {
      if (e.type !== "noteon" || e.source === "playback") return;
      const held = inputBus.heldNotes();
      if (held.length < 3) return;
      const elapsed = engine.contextTimeFor(e.time) - t0;
      const { bar, offset } = barTiming(elapsed, barSec);
      if (bar < 0) return;
      const want = expectedAt(bar);
      if (holdsChord(held, want.pc, want.quality) && Math.abs(offset) <= WINDOW) {
        if (scoredBar === bar) return;
        scoredBar = bar;
        setHits((h) => h + 1);
        const ms = Math.round(offset * 1000);
        setFeedback(`In the pocket · ${ms === 0 ? "right on" : ms > 0 ? `${ms} ms late` : `${-ms} ms early`}`);
      } else if (holdsChord(held, want.pc, want.quality)) {
        setFeedback("Right chord. Now land it on beat one.");
      } else {
        setFeedback(`Next up: ${chordName(want.pc, want.quality)}. Follow the highlighted chord.`);
      }
    });
    run.current = {
      stop: () => {
        clearInterval(interval);
        timers.forEach(clearTimeout);
        unsubscribe();
        sampler.cancelScheduled();
      },
    };
    setHits(0);
    setRunning(true);
    setFeedback("Listen to the backing chords. Join on the first beat of each bar.");
  };

  return (
    <section className="card space-y-4" aria-labelledby="room-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="eyebrow">The practice room</div>
          <h2 id="room-title" className="mt-1 text-xl font-bold">
            Find a pocket. Stay a while.
          </h2>
          <p className="text-sm text-ink-soft">Four chords, a steady pulse, and room to explore.</p>
        </div>
        <div className="flex gap-1.5 pt-2" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`h-2.5 w-2.5 rounded-full ${beat === i ? "bg-green" : "bg-line"}`} />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Style">
        {Object.keys(PROGRESSIONS).map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={g === genre}
            onClick={() => setGenre(g)}
            className={`chip ${g === genre ? "border-green bg-sage-soft text-green-dark" : ""}`}
          >
            {g}
          </button>
        ))}
      </div>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {progression.map(([letter, quality], i) => {
          const pc = (letterPitchClass(letter) + transpose + 12) % 12;
          const current = running && step === i;
          return (
            <li
              key={i}
              aria-current={current ? "step" : undefined}
              className={`rounded-xl border p-3 transition-colors ${current ? "border-green bg-green text-white" : "border-line bg-white"}`}
            >
              <span className={`text-xs ${current ? "text-white/70" : "text-muted"}`}>0{i + 1}</span>
              <div className="font-display text-2xl font-bold">{chordName(pc, quality)}</div>
              <div className={`text-xs ${current ? "text-white/80" : "text-ink-soft"}`}>{QUALITIES[quality].label}</div>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" onClick={() => void start()}>
          <Icon name={running ? "pause" : "play"} /> {running ? "Stop session" : "Start session"}
        </button>
        <label className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-1.5 text-sm">
          <input
            type="number"
            min={40}
            max={180}
            value={bpm}
            onChange={(e) => setBpm(Math.max(40, Math.min(180, Number(e.target.value) || 80)))}
            className="w-14 bg-transparent font-semibold tabular-nums"
            aria-label="Tempo in beats per minute"
          />
          BPM
        </label>
        <span className="text-sm text-ink-soft">
          {hits} well-timed bar{hits === 1 ? "" : "s"}
        </span>
      </div>
      <p className="rounded-xl bg-paper px-3 py-2 text-sm text-ink-soft" aria-live="polite">
        {feedback}
      </p>
    </section>
  );
}
