import { useMemo, useState } from "react";
import { engine } from "@/audio/engine.ts";
import { chordName, chordNotes, PITCH_NAMES, QUALITIES, type ChordQuality } from "@/core/chords.ts";
import { inputBus } from "@/input/input-bus.ts";
import { noteName } from "@/render/keyboard-geometry.ts";
import { PageHeader } from "../controls.tsx";
import { Icon } from "../Icon.tsx";

const ROOTS = [0, 2, 4, 5, 7, 9, 11, 1, 3, 6, 8, 10];
const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
/** Black keys and the white-key boundary they sit on. */
const BLACK_PCS: [number, number][] = [
  [1, 1],
  [3, 2],
  [6, 4],
  [8, 5],
  [10, 6],
];

/** One octave of keys with the chord's notes lit. */
function MiniKeys({ lit }: { lit: ReadonlySet<number> }) {
  return (
    <div className="relative flex h-14" aria-hidden="true">
      {WHITE_PCS.map((pc) => (
        <span
          key={pc}
          className={`flex-1 rounded-b-md border border-ink/20 ${lit.has(pc) ? "bg-green" : "bg-white"} first:rounded-bl-lg last:rounded-br-lg`}
        />
      ))}
      {BLACK_PCS.map(([pc, at]) => (
        <span
          key={pc}
          className={`absolute top-0 h-[60%] w-[9%] -translate-x-1/2 rounded-b-sm ${lit.has(pc) ? "bg-green ring-2 ring-white" : "bg-ink"}`}
          style={{ left: `${(at / 7) * 100}%` }}
        />
      ))}
    </div>
  );
}
const INVERSIONS = ["Root position", "1st inversion", "2nd inversion"];

/** Plays a chord for about a second through the normal input path, so it sounds and lights up the same way. */
async function playChord(notes: number[]): Promise<void> {
  if (!engine.running) await engine.start();
  const now = performance.now();
  notes.forEach((note, i) => inputBus.emit({ type: "noteon", note, velocity: 80, time: now + i * 25, source: "pointer" }));
  setTimeout(() => notes.forEach((note) => inputBus.emit({ type: "noteoff", note, time: performance.now(), source: "pointer" })), 1100);
}

export default function ChordBook() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState<ChordQuality | "all" | "basic">("basic");
  const [inversion, setInversion] = useState(0);

  const chords = useMemo(() => {
    const q = search.trim().toLowerCase().replace("#", "♯");
    return ROOTS.flatMap((root) =>
      (Object.keys(QUALITIES) as ChordQuality[])
        .filter((quality) => type === "all" || quality === type || (type === "basic" && (quality === "major" || quality === "minor")))
        .map((quality) => ({ root, quality, name: chordName(root, quality) }))
        .filter(
          (c) =>
            !q ||
            c.name.toLowerCase() === q ||
            c.name.toLowerCase().startsWith(q) ||
            `${PITCH_NAMES[c.root]} ${QUALITIES[c.quality].label}`.toLowerCase().includes(q),
        ),
    );
  }, [search, type]);

  return (
    <div className="pb-12">
      <PageHeader eyebrow="Chord book" title="Every chord, one tap away">
        Tap a chord to hear it. The small keyboard shows which keys to press. Start with the major and minor chords; they
        cover most songs.
      </PageHeader>
      <div className="space-y-4 px-4 lg:px-8">
        <div className="flex flex-wrap gap-2">
          <label className="relative min-w-60 flex-1">
            <span className="sr-only">Find a chord</span>
            <input
              className="input-select w-full py-2.5"
              placeholder="Find a chord · C, Dm, F#, minor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm">
            <span className="eyebrow">Type</span>
            <select className="bg-transparent py-2 font-semibold" value={type} onChange={(e) => setType(e.target.value as ChordQuality | "all" | "basic")}>
              <option value="basic">Major and minor</option>
              <option value="all">All types</option>
              {(Object.keys(QUALITIES) as ChordQuality[]).map((q) => (
                <option key={q} value={q}>
                  {QUALITIES[q].label}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm">
            <span className="eyebrow">Shape</span>
            <select className="bg-transparent py-2 font-semibold" value={inversion} onChange={(e) => setInversion(Number(e.target.value))}>
              {INVERSIONS.map((n, i) => (
                <option key={n} value={i}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        {inversion > 0 && (
          <p className="text-xs text-muted">
            An inversion plays the same notes in a different order, so your hand moves less between chords.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {chords.map((c) => {
            const notes = chordNotes(c.root, c.quality, 4, Math.min(inversion, QUALITIES[c.quality].intervals.length - 1));
            const pcs = new Set(notes.map((n) => n % 12));
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => void playChord(notes)}
                className="card group space-y-2 p-4 text-left transition-colors hover:border-green"
                aria-label={`${c.name}, ${QUALITIES[c.quality].label}: ${notes.map((n) => noteName(n)).join(", ")}. Play`}
              >
                <div className="flex items-start justify-between">
                  <strong className="font-display text-2xl">{c.name}</strong>
                  <span className="text-green opacity-60 group-hover:opacity-100">
                    <Icon name="play" size={16} />
                  </span>
                </div>
                <div className="text-[11px] font-semibold tracking-wide text-muted uppercase">{QUALITIES[c.quality].label}</div>
                <MiniKeys lit={pcs} />
                <p className="text-xs text-ink-soft">{notes.map((n) => noteName(n)).join(" · ")}</p>
              </button>
            );
          })}
          {chords.length === 0 && (
            <p className="col-span-full text-sm text-muted">No chords found. Try a letter such as D, or a type such as minor.</p>
          )}
        </div>
      </div>
    </div>
  );
}
