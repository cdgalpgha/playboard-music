import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useAudio } from "@/state/audio-store.ts";
import { useInput } from "@/state/input-store.ts";
import { lessonProgress } from "@/storage/progress.ts";
import { Icon, type IconName } from "../Icon.tsx";
import { StartAudioButton } from "../StartAudioButton.tsx";

/** Set once the player has pressed any key, so the guide can tick off step 2. */
export const PLAYED_KEY = "pb-first-note";

function flag(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

interface Step {
  icon: IconName;
  title: string;
  text: string;
  done: boolean;
  action: React.ReactNode;
}

export function Home() {
  const audioOn = useAudio((s) => s.status === "running");
  const midiConnected = useInput((s) => s.devices.some((d) => d.connected));
  const lastChord = useInput((s) => s.lastChord);
  const [lessonDone, setLessonDone] = useState(false);
  useEffect(() => void lessonProgress().then((p) => setLessonDone(Object.keys(p).length > 0)), []);
  const played = Boolean(lastChord) || flag(PLAYED_KEY);
  const videoDone = flag("pb-recent-videos");

  const steps: Step[] = [
    {
      icon: "headphones",
      title: "Turn on the sound",
      text: "Browsers keep sound off until you say so. One click loads the piano.",
      done: audioOn,
      action: <StartAudioButton />,
    },
    {
      icon: "piano",
      title: "Play your first chord",
      text: "Press D on your computer keyboard. That's a D major chord. Hold Shift and press D for D minor.",
      done: played,
      action: (
        <Link to="/play" className="btn-primary">
          Open the piano
        </Link>
      ),
    },
    {
      icon: "learn",
      title: "Take your first lesson",
      text: "Short lessons show you where your fingers go, then listen while you play. No music reading needed.",
      done: lessonDone,
      action: (
        <Link to="/learn" className="btn-primary">
          Start lesson 1
        </Link>
      ),
    },
    {
      icon: "youtube",
      title: "Play along with a song you love",
      text: "Paste a YouTube link and play chords over it.",
      done: videoDone,
      action: (
        <Link to="/play-along" className="btn-primary">
          Pick a song
        </Link>
      ),
    },
  ];
  const next = steps.findIndex((s) => !s.done);
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="pb-16">
      <section className="px-4 pt-10 pb-6 lg:px-8 lg:pt-14">
        <div className="eyebrow">Start here</div>
        <h1 className="mt-2 max-w-3xl text-4xl leading-tight font-bold text-green-dark lg:text-5xl">
          Never played before? Perfect.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-soft">
          You don't need a piano, a teacher or any music knowledge. Follow these four steps and you'll be playing chords
          in a few minutes.
        </p>
        <div className="mt-5 flex items-center gap-3 text-sm text-ink-soft">
          <span className="h-2 w-48 overflow-hidden rounded-full bg-line" aria-hidden="true">
            <span className="block h-full bg-green transition-[width]" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </span>
          {doneCount} of {steps.length} done
        </div>
      </section>

      <ol className="space-y-3 px-4 lg:px-8" aria-label="Getting started">
        {steps.map((s, i) => (
          <li
            key={s.title}
            aria-current={i === next ? "step" : undefined}
            className={`card flex flex-wrap items-center gap-4 ${i === next ? "border-green ring-2 ring-green/15" : ""} ${s.done ? "opacity-70" : ""}`}
          >
            <span
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold ${
                s.done ? "bg-green text-white" : "bg-sage-soft text-green"
              }`}
            >
              {s.done ? <Icon name="check" /> : i + 1}
            </span>
            <div className="min-w-56 flex-1">
              <h2 className="text-lg font-bold">
                {s.title}
                {s.done && <span className="sr-only"> (done)</span>}
              </h2>
              <p className="text-sm text-ink-soft">{s.text}</p>
            </div>
            {!s.done && i === next && s.action}
            {s.done && <span className="text-sm font-semibold text-green">Done</span>}
          </li>
        ))}
      </ol>

      <section className="mt-8 grid gap-4 px-4 sm:grid-cols-2 lg:px-8" aria-label="More">
        <Link to="/setup" className="card flex items-center gap-4 hover:border-green">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-sage-soft text-green">
            <Icon name="midi" size={20} />
          </span>
          <span>
            <strong className="block">{midiConnected ? "Your piano keyboard is connected" : "Have a piano keyboard?"}</strong>
            <span className="text-sm text-ink-soft">
              {midiConnected ? "Check it's set up right." : "Plug it in with USB and Playboard finds it. We'll walk you through it."}
            </span>
          </span>
        </Link>
        <Link to="/chords" className="card flex items-center gap-4 hover:border-green">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-sage-soft text-green">
            <Icon name="chord" size={20} />
          </span>
          <span>
            <strong className="block">Look up any chord</strong>
            <span className="text-sm text-ink-soft">See which keys to press, then tap to hear it.</span>
          </span>
        </Link>
      </section>
    </div>
  );
}
