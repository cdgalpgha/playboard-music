import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { pitchRange } from "@/core/chart.ts";
import { majorKeyName, transposeFifths, type ChartEdits } from "@/core/transforms.ts";
import { defaultTrackRoles, type TrackRole } from "@/formats/midi-file.ts";
import { ACCEPT, chartFromImport, readImport, type ImportedFile } from "@/import/importer.ts";
import { deleteUserSong, getUserSong, importedFromRecord, listUserSongs, saveUserSong } from "@/content/user-library.ts";
import type { UserSongRecord } from "@/storage/db.ts";
import { noteName } from "@/render/keyboard-geometry.ts";
import { PageHeader } from "../controls.tsx";
import { Icon } from "../Icon.tsx";

interface Draft {
  file: ImportedFile;
  title: string;
  composer: string;
  edits: ChartEdits;
  roles?: TrackRole[];
  existingId?: string;
}

function Editor({ draft, onChange, onSaved }: { draft: Draft; onChange: (d: Draft) => void; onSaved: (id: string) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const preview = useMemo(() => {
    try {
      return { chart: chartFromImport(draft.file, "preview", draft.edits, draft, draft.roles), error: "" };
    } catch (e) {
      return { chart: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [draft]);
  const chart = preview.chart;
  const range = chart ? pitchRange(chart) : null;
  const baseBpm = chart?.tempo[0]?.bpm ?? 120;
  const baseFifths = chart ? transposeFifths(chart.keyFifths, -draft.edits.transpose) : 0;
  const hands = chart ? { R: chart.notes.filter((n) => n.hand === "R").length, L: chart.notes.filter((n) => n.hand === "L").length } : null;
  const trackRoles = draft.file.format === "midi" ? (draft.roles ?? defaultTrackRoles(draft.file.midi)) : [];
  const minutes = chart ? `${Math.floor(chart.duration / 60)}:${String(Math.round(chart.duration % 60)).padStart(2, "0")}` : "";

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const record = await saveUserSong(draft.file, draft, draft.edits, draft.roles, draft.existingId);
      onSaved(record.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save to this browser's storage.");
      setSaving(false);
    }
  };

  return (
    <section className="card space-y-5" aria-labelledby="editor-title">
      <div>
        <h2 id="editor-title" className="text-base font-bold">
          {draft.existingId ? "Edit" : "Preview"}: {draft.file.fileName}
        </h2>
        <p className="text-xs text-muted">
          {draft.file.format === "midi" ? "MIDI file" : "MusicXML score"} · stays on this device
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="field-label">Title</span>
          <input className="input-select" value={draft.title} onChange={(e) => onChange({ ...draft, title: e.target.value })} />
        </label>
        <label>
          <span className="field-label">Composer</span>
          <input className="input-select" value={draft.composer} onChange={(e) => onChange({ ...draft, composer: e.target.value })} />
        </label>
      </div>

      {draft.file.format === "midi" && (
        <fieldset>
          <legend className="field-label">Tracks</legend>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1 pr-3 font-semibold">Track</th>
                  <th className="py-1 pr-3 font-semibold">Notes</th>
                  <th className="py-1 pr-3 font-semibold">Range</th>
                  <th className="py-1 font-semibold">Play as</th>
                </tr>
              </thead>
              <tbody>
                {draft.file.midi.tracks
                  .filter((t) => t.notes.length)
                  .map((t) => {
                    const low = Math.min(...t.notes.map((n) => n.pitch)),
                      high = Math.max(...t.notes.map((n) => n.pitch));
                    return (
                      <tr key={t.index} className="border-t border-line">
                        <td className="py-1.5 pr-3">{t.name || `Track ${t.index + 1}`}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{t.notes.length}</td>
                        <td className="py-1.5 pr-3">
                          {noteName(low)}–{noteName(high)}
                        </td>
                        <td className="py-1.5">
                          <select
                            aria-label={`Hand for ${t.name || `track ${t.index + 1}`}`}
                            className="rounded-lg border border-line bg-card px-2 py-1"
                            value={trackRoles[t.index]}
                            onChange={(e) => {
                              const next = [...trackRoles];
                              next[t.index] = e.target.value as TrackRole;
                              onChange({ ...draft, roles: next });
                            }}
                          >
                            <option value="R">Right hand</option>
                            <option value="L">Left hand</option>
                            <option value="skip">Leave out</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-muted">
            If only one track is played, notes below middle C go to the left hand. Drum tracks are left out.
          </p>
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="field-label">Key (transpose)</span>
          <select
            className="input-select"
            value={draft.edits.transpose}
            onChange={(e) => onChange({ ...draft, edits: { ...draft.edits, transpose: Number(e.target.value) } })}
          >
            {Array.from({ length: 25 }, (_, i) => i - 12).map((t) => (
              <option key={t} value={t}>
                {t === 0 ? "Original" : `${t > 0 ? "+" : ""}${t} semitones`} · {majorKeyName(transposeFifths(baseFifths, t))} major
                {" signature"}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">
            Tempo: {Math.round(draft.edits.tempo * 100)}% · {Math.round(baseBpm)} BPM
          </span>
          <input
            type="range"
            className="w-full accent-green"
            min={0.25}
            max={2}
            step={0.05}
            value={draft.edits.tempo}
            onChange={(e) => onChange({ ...draft, edits: { ...draft.edits, tempo: Number(e.target.value) } })}
          />
        </label>
      </div>

      {preview.error && <p className="text-bad">{preview.error}</p>}
      {chart && range && hands && (
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4" data-testid="import-stats">
          <div>
            <dt className="eyebrow">Notes</dt>
            <dd className="font-semibold tabular-nums">
              {chart.notes.length} <span className="text-xs font-normal text-muted">(R {hands.R} · L {hands.L})</span>
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Measures</dt>
            <dd className="font-semibold tabular-nums">{chart.measures.length}</dd>
          </div>
          <div>
            <dt className="eyebrow">Length</dt>
            <dd className="font-semibold tabular-nums">{minutes}</dd>
          </div>
          <div>
            <dt className="eyebrow">Range</dt>
            <dd className="font-semibold">
              {noteName(range.low)}–{noteName(range.high)}
            </dd>
          </div>
        </dl>
      )}
      {error && <p className="text-bad">{error}</p>}
      <button type="button" className="btn-primary" disabled={!chart || saving} onClick={() => void save()}>
        <Icon name="check" size={16} /> {draft.existingId ? "Save changes" : "Add to my library"}
      </button>
    </section>
  );
}

function Library({ songs, onDelete }: { songs: UserSongRecord[]; onDelete: (id: string) => void }) {
  if (!songs.length) return <p className="text-sm text-muted">Nothing imported yet.</p>;
  return (
    <ul className="divide-y divide-line">
      {songs.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{s.title}</span>
            <span className="block text-xs text-muted">
              {s.fileName}
              {s.edits.transpose ? ` · ${s.edits.transpose > 0 ? "+" : ""}${s.edits.transpose} semitones` : ""}
              {s.edits.tempo !== 1 ? ` · ${Math.round(s.edits.tempo * 100)}% tempo` : ""}
            </span>
          </span>
          <Link to={`/pieces/${s.id}`} className="btn-primary py-1.5">
            Practise
          </Link>
          <Link to={`/import?edit=${s.id}`} className="btn-secondary py-1.5">
            Edit
          </Link>
          <button
            type="button"
            className="btn-ghost py-1.5 text-bad"
            onClick={() => {
              if (confirm(`Delete “${s.title}” from this device?`)) onDelete(s.id);
            }}
          >
            Delete
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function Import() {
  const [params, setParams] = useSearchParams();
  const editId = params.get("edit");
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [songs, setSongs] = useState<UserSongRecord[]>([]);

  const refresh = () => void listUserSongs().then(setSongs);
  useEffect(refresh, []);

  useEffect(() => {
    if (!editId) return;
    void (async () => {
      const r = await getUserSong(editId);
      if (!r) return setError("That song is not in your library any more.");
      const file = await importedFromRecord(r);
      setDraft({ file, title: r.title, composer: r.composer, edits: { transpose: r.edits.transpose, tempo: r.edits.tempo }, roles: r.edits.roles, existingId: r.id });
    })().catch((e: Error) => setError(e.message));
  }, [editId]);

  const open = async (f: File) => {
    setError("");
    setDraft(null);
    if (editId) setParams({});
    try {
      const file = await readImport(f.name, await f.arrayBuffer());
      setDraft({
        file,
        title: file.title,
        composer: file.composer,
        edits: { transpose: 0, tempo: 1 },
        ...(file.format === "midi" ? { roles: defaultTrackRoles(file.midi) } : {}),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) void open(f);
  };

  return (
    <div className="pb-12">
      <PageHeader eyebrow="Import" title="Bring your own music">
        Add a MIDI file (.mid) or a MusicXML score (.musicxml, .xml, .mxl) and practise it with falling notes, scoring and
        every practice tool. Files stay in this browser on this device. They are never uploaded or shared.
      </PageHeader>
      <div className="grid gap-4 px-4 lg:px-8 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`grid place-items-center rounded-2xl border-2 border-dashed p-8 text-center ${
              dragging ? "border-green bg-sage-soft" : "border-line bg-card"
            }`}
          >
            <Icon name="upload" size={28} className="text-green" />
            <p className="mt-2 text-sm text-ink-soft">Drop a file here, or</p>
            <button type="button" className="btn-primary mt-2" onClick={() => input.current?.click()}>
              Choose a file
            </button>
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              aria-label="Choose a MIDI or MusicXML file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void open(f);
                e.target.value = "";
              }}
            />
            <p className="mt-3 text-xs text-muted">
              Only import music you have the right to use. Sheet music is shown for MusicXML; MIDI files play as falling
              notes.
            </p>
          </div>
          {error && (
            <p role="alert" className="rounded-xl bg-[#fbe5e5] p-3 text-sm text-bad">
              {error}
            </p>
          )}
          {draft && (
            <Editor
              draft={draft}
              onChange={setDraft}
              onSaved={(id) => {
                refresh();
                navigate(`/pieces/${id}`);
              }}
            />
          )}
        </div>
        <section className="card" aria-labelledby="library-title">
          <h2 id="library-title" className="text-base font-bold">
            My library
          </h2>
          <p className="mb-2 text-xs text-muted">Private to you, on this device.</p>
          <Library
            songs={songs}
            onDelete={(id) =>
              void deleteUserSong(id).then(() => {
                refresh();
                if (draft?.existingId === id) setDraft(null);
              })
            }
          />
        </section>
      </div>
    </div>
  );
}
