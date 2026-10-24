import { inputStore, useInput } from "@/state/input-store.ts";

const TRANSPOSE = Array.from({ length: 13 }, (_, i) => i - 6);

/** Computer-key settings: chord or piano mode, octave, voicing and transpose. */
export function ChordControls({ compact = false }: { compact?: boolean }) {
  const mode = useInput((s) => s.qwertyMode);
  const octave = useInput((s) => s.qwertyOctave);
  const voicing = useInput((s) => s.chordVoicing);
  const transpose = useInput((s) => s.chordTranspose);
  const chords = mode === "chords";
  const setOctave = (d: number) => inputStore.setState({ qwertyOctave: Math.max(1, Math.min(7, octave + d)) });

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <div className="inline-flex rounded-xl border border-line bg-white p-0.5" role="group" aria-label="Computer keys">
        {(["chords", "notes"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            className={`rounded-[10px] px-3 py-1.5 font-semibold ${mode === m ? "bg-green text-white" : "text-ink-soft hover:text-ink"}`}
            onClick={(e) => {
              inputStore.setState({ qwertyMode: m, lastChord: "" });
              e.currentTarget.blur();
            }}
          >
            {m === "chords" ? "Chord mode" : "Piano mode"}
          </button>
        ))}
      </div>
      <div className="inline-flex items-center gap-1 rounded-xl border border-line bg-white px-2 py-0.5">
        <span className="eyebrow">Octave</span>
        <button type="button" className="btn-ghost px-2 py-1" aria-label="Lower octave" onClick={() => setOctave(-1)}>
          −
        </button>
        <b className="w-4 text-center tabular-nums">{octave}</b>
        <button type="button" className="btn-ghost px-2 py-1" aria-label="Higher octave" onClick={() => setOctave(1)}>
          +
        </button>
      </div>
      {chords && !compact && (
        <>
          <label className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-1">
            <span className="eyebrow">Voicing</span>
            <select
              className="bg-transparent font-semibold"
              value={voicing}
              onChange={(e) => inputStore.setState({ chordVoicing: e.target.value as "triads" | "sevenths" })}
            >
              <option value="triads">Triads</option>
              <option value="sevenths">Sevenths</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-1">
            <span className="eyebrow">Transpose</span>
            <select
              className="bg-transparent font-semibold"
              value={transpose}
              onChange={(e) => inputStore.setState({ chordTranspose: Number(e.target.value) })}
            >
              {TRANSPOSE.map((t) => (
                <option key={t} value={t}>
                  {t > 0 ? `+${t}` : t}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </div>
  );
}

/** One line telling the player which keys do what in the current mode. */
export function KeyGuide() {
  const mode = useInput((s) => s.qwertyMode);
  const octave = useInput((s) => s.qwertyOctave);
  return mode === "chords" ? (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
      <span>
        <span className="kbd">A</span>–<span className="kbd">G</span> major
      </span>
      <span>
        <span className="kbd">Shift</span> + key minor
      </span>
      <span>
        <span className="kbd">Space</span> + key sharp
      </span>
      <span>
        <span className="kbd">Z</span> <span className="kbd">X</span> octave
      </span>
    </p>
  ) : (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
      <span>
        <span className="kbd">A W S E D F T G Y H U J</span> notes from C{octave}
      </span>
      <span>
        <span className="kbd">Space</span> sustain
      </span>
      <span>
        <span className="kbd">Z</span> <span className="kbd">X</span> octave
      </span>
    </p>
  );
}
