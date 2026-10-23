import { Link } from "react-router";
import { Icon, type IconName } from "../Icon.tsx";

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "piano",
    title: "A sampled concert grand",
    text: "Salamander Grand (Yamaha C5) recorded at 48 kHz/24-bit: velocity layers, damper and release sounds, pedal resonance.",
  },
  {
    icon: "midi",
    title: "Plug in and play",
    text: "USB MIDI with velocity and sustain pedal, timed from the MIDI event itself. No keyboard? Use the screen or your computer keys.",
  },
  {
    icon: "bolt",
    title: "Measured, not guessed",
    text: "Every note you play reports its key-to-sound latency, so you can see what your setup really does.",
  },
  {
    icon: "learn",
    title: "Lessons and falling notes",
    text: "Ten step-by-step lessons, falling notes and sheet music side by side, with wait mode, loops, slow-down and per-note scoring.",
  },
  {
    icon: "youtube",
    title: "Play along with videos",
    text: "Find a song on YouTube and play over it in the official player, credited to the channel that posted it.",
  },
  {
    icon: "progress",
    title: "Works offline, tracks progress",
    text: "Install it as an app. Your streak and practice time stay on this device, with optional sync to your account.",
  },
];

export function Home() {
  return (
    <div className="pb-16">
      <section className="px-4 pt-10 pb-8 lg:px-8 lg:pt-16">
        <div className="eyebrow">Learn and play piano in your browser</div>
        <h1 className="mt-2 max-w-3xl text-4xl leading-tight font-bold text-green-dark lg:text-5xl">
          Sit down at a real-sounding grand. Start playing.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-soft">
          Playboard turns any browser into a practice room: a studio-grade sampled piano, your MIDI keyboard, and tools
          that respond the moment you touch a key.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/play" className="btn-primary px-5 py-3 text-base">
            <Icon name="piano" /> Start playing
          </Link>
          <Link to="/setup" className="btn-secondary px-5 py-3 text-base">
            <Icon name="midi" /> Set up my keyboard
          </Link>
        </div>
      </section>
      <section aria-label="Features" className="grid gap-4 px-4 sm:grid-cols-3 lg:px-8">
        {FEATURES.map((f) => (
          <article key={f.title} className="card">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-sage-soft text-green">
              <Icon name={f.icon} size={20} />
            </span>
            <h2 className="mt-3 text-base font-bold">{f.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">{f.text}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
