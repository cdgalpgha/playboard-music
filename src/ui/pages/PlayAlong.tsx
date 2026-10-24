import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { enableChordKeys } from "@/input/computer-keyboard.ts";
import { useInput } from "@/state/input-store.ts";
import { youtubeApiKey } from "@/storage/sync-maps.ts";
import { PLAYER_STATE, videoIdFrom, YouTubePlayer } from "@/video/youtube-api.ts";
import { searchVideos, SearchError, type VideoResult } from "@/video/youtube-search.ts";
import { ChordControls, KeyGuide } from "../ChordControls.tsx";
import { Icon } from "../Icon.tsx";
import { PianoKeyboard } from "../PianoKeyboard.tsx";
import { PageHeader } from "../controls.tsx";
import { useMediaQuery } from "../useMediaQuery.ts";

interface RecentVideo {
  id: string;
  title: string;
  author: string;
}

const RECENT_KEY = "pb-recent-videos";
function readRecent(): RecentVideo[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as RecentVideo[];
  } catch {
    return [];
  }
}
function saveRecent(v: RecentVideo): RecentVideo[] {
  const list = [v, ...readRecent().filter((r) => r.id !== v.id)].slice(0, 8);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* storage blocked */
  }
  return list;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function PlayAlong() {
  const [params, setParams] = useSearchParams();
  const videoId = params.get("v");
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState("");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [results, setResults] = useState<VideoResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [recent, setRecent] = useState(readRecent);
  useEffect(() => void youtubeApiKey().then((k) => setApiKey(k || import.meta.env.VITE_YOUTUBE_API_KEY || "")), []);
  useEffect(() => enableChordKeys(), []);

  const open = (id: string) => {
    setResults(null);
    setParams({ v: id });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setInputError("");
    const id = videoIdFrom(input);
    if (id) return open(id);
    if (!input.trim()) return;
    if (!apiKey) {
      setInputError("That isn't a YouTube link. Paste a link like youtube.com/watch?v=… or youtu.be/…");
      return;
    }
    setSearching(true);
    try {
      setResults(await searchVideos(input.trim(), "original", "", apiKey));
    } catch (err) {
      setInputError(err instanceof SearchError ? err.message : "Search failed. Check your connection.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="pb-12">
      <PageHeader eyebrow="Your backing band" title="Play along with YouTube">
        Paste a link to any song, karaoke or backing track. The video plays in YouTube's own player with the channel
        credited; you play the piano underneath.
      </PageHeader>
      <div className="space-y-4 px-4 lg:px-8">
        <form onSubmit={(e) => void submit(e)} className="flex flex-wrap gap-2">
          <label htmlFor="yt-input" className="sr-only">
            {apiKey ? "YouTube link or search" : "YouTube link"}
          </label>
          <input
            id="yt-input"
            className="input-select min-w-64 flex-1 py-3 text-base"
            placeholder={apiKey ? "Paste a YouTube link, or search for a song" : "Paste a YouTube link…"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoComplete="off"
          />
          <button className="btn-primary px-5">
            <Icon name="youtube" /> {searching ? "Searching…" : apiKey && !videoIdFrom(input) && input ? "Search" : "Open"}
          </button>
        </form>
        {inputError && (
          <p role="alert" className="text-sm text-bad">
            {inputError}
          </p>
        )}
        {!apiKey && apiKey !== null && (
          <p className="text-xs text-muted">
            Searching inside Playboard needs a free YouTube Data API key (Settings). Pasting a link always works.
          </p>
        )}

        {results && (
          <section aria-label="Search results" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {results.length === 0 && <p className="text-sm text-muted">No embeddable videos found.</p>}
            {results.map((r) => (
              <button
                key={r.videoId}
                type="button"
                onClick={() => open(r.videoId)}
                className="card flex gap-3 p-3 text-left hover:border-green"
              >
                <img src={r.thumbnail} alt="" className="h-16 w-28 shrink-0 rounded-lg object-cover" loading="lazy" />
                <span className="min-w-0">
                  <span className="line-clamp-2 text-sm font-semibold">{r.title}</span>
                  <span className="block text-xs text-muted">{r.channelTitle}</span>
                </span>
              </button>
            ))}
          </section>
        )}

        {videoId ? (
          <Session key={videoId} videoId={videoId} onInfo={(v) => setRecent(saveRecent(v))} />
        ) : (
          <EmptyState recent={recent} open={open} />
        )}
      </div>
    </div>
  );
}

function EmptyState({ recent, open }: { recent: RecentVideo[]; open: (id: string) => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <section className="card flex min-h-60 flex-col items-center justify-center gap-2 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sage-soft text-green">
          <Icon name="youtube" size={24} />
        </span>
        <h2 className="text-lg font-bold">Press play. Find your way.</h2>
        <p className="max-w-md text-sm text-ink-soft">
          Open a video above. Use chord mode to strum along: <span className="kbd">A</span>–<span className="kbd">G</span>{" "}
          for major, <span className="kbd">Shift</span> for minor, <span className="kbd">Space</span> for sharp.
        </p>
      </section>
      <section className="card" aria-labelledby="recent-title">
        <h2 id="recent-title" className="eyebrow">
          Recent sessions
        </h2>
        {recent.length ? (
          <ul className="mt-3 space-y-1">
            {recent.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => open(r.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-paper"
                >
                  <img src={`https://i.ytimg.com/vi/${r.id}/default.jpg`} alt="" className="h-9 w-12 rounded object-cover" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{r.title || r.id}</span>
                    <span className="block truncate text-xs text-muted">{r.author}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">Videos you open appear here.</p>
        )}
      </section>
    </div>
  );
}

function Session({ videoId, onInfo }: { videoId: string; onInfo: (v: RecentVideo) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const infoCb = useRef(onInfo);
  infoCb.current = onInfo;
  const player = useRef<YouTubePlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState({ title: "", author: "" });
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [volume, setVolume] = useState(0.6);
  const [loop, setLoop] = useState<{ a: number | null; b: number | null }>({ a: null, b: null });
  const loopRef = useRef(loop);
  loopRef.current = loop;
  const lastChord = useInput((s) => s.lastChord);
  const mode = useInput((s) => s.qwertyMode);
  const octave = useInput((s) => s.qwertyOctave);
  const narrow = useMediaQuery("(max-width: 639px)");
  const low = narrow ? 12 * (octave + 1) : 12 * octave;
  const high = narrow ? low + 23 : 12 * (octave + 3) - 1;

  useEffect(() => {
    let cancelled = false;
    void YouTubePlayer.create(box.current!, videoId, {
      onState: (s) => setPlaying(s === PLAYER_STATE.playing),
      onError: (message) => setError(message),
    })
      .then((created) => {
        if (cancelled) return created.destroy();
        player.current = created;
        created.setVolume(volume);
        setReady(true);
        const d = created.videoData();
        setInfo(d);
        if (d.title) infoCb.current({ id: videoId, ...d });
      })
      .catch(() => setError("The YouTube player could not load. Check your connection."));
    return () => {
      cancelled = true;
      player.current?.destroy();
      player.current = null;
    };
  }, [videoId]);

  // Poll position for the scrubber and the A–B loop.
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      const p = player.current;
      if (!p) return;
      const t = p.currentTime();
      setTime(t);
      setDuration(p.duration());
      const { a, b } = loopRef.current;
      if (a !== null && b !== null && b > a && t >= b) p.seek(a);
      if (!info.title) {
        const d = p.videoData();
        if (d.title) {
          setInfo(d);
          infoCb.current({ id: videoId, ...d });
        }
      }
    }, 100);
    return () => clearInterval(id);
  }, [ready, info.title, videoId]);

  const p = player.current;
  const loopText =
    loop.a === null ? "Set a start, then an end while the video plays." : loop.b === null ? `Loop from ${fmt(loop.a)} — now set the end.` : `Looping ${fmt(loop.a)}–${fmt(loop.b)}`;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <div className="overflow-hidden rounded-2xl bg-black shadow-lg">
          <div ref={box} className="aspect-video w-full" />
        </div>
        <aside className="card space-y-4">
          <div>
            <div className="eyebrow">Now in your session</div>
            <h2 className="mt-1 text-lg leading-snug font-bold">{info.title || (error ? "Video unavailable" : "Loading video…")}</h2>
            {info.author && (
              <p className="mt-1 text-sm text-ink-soft">
                Uploaded by <strong className="text-ink">{info.author}</strong>
              </p>
            )}
            <a
              href={`https://www.youtube.com/watch?v=${videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-green underline"
            >
              Watch on YouTube <Icon name="arrow" size={14} />
            </a>
          </div>
          {error && (
            <p role="alert" className="rounded-xl bg-[#fbe5e5] px-3 py-2 text-sm text-bad">
              {error}
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn-primary h-11 w-11 rounded-full p-0"
              aria-label={playing ? "Pause video" : "Play video"}
              disabled={!ready}
              onClick={() => (playing ? p?.pause() : p?.play())}
            >
              <Icon name={playing ? "pause" : "play"} />
            </button>
            <input
              type="range"
              aria-label="Video position"
              className="flex-1 accent-green"
              min={0}
              max={duration || 1}
              step={0.1}
              value={time}
              disabled={!ready}
              onChange={(e) => p?.seek(Number(e.target.value))}
            />
            <span className="text-xs text-muted tabular-nums">
              {fmt(time)} / {fmt(duration)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="space-y-1">
              <span className="eyebrow block">Speed</span>
              <select
                className="input-select w-full"
                value={rate}
                disabled={!ready}
                onChange={(e) => setRate(p?.setRate(Number(e.target.value)) ?? 1)}
              >
                {[0.5, 0.75, 1, 1.25].map((r) => (
                  <option key={r} value={r}>
                    {r}×
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="eyebrow block">Video volume</span>
              <input
                type="range"
                className="w-full accent-green"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setVolume(v);
                  p?.setVolume(v);
                }}
              />
            </label>
          </div>
          <div className="rounded-xl bg-paper p-3">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-sm">A–B practice loop</strong>
              <div className="flex gap-1">
                <button type="button" className="btn-secondary px-3 py-1 text-xs" disabled={!ready} onClick={() => setLoop({ a: time, b: null })}>
                  Set A
                </button>
                <button
                  type="button"
                  className="btn-secondary px-3 py-1 text-xs"
                  disabled={!ready || loop.a === null || time <= (loop.a ?? 0)}
                  onClick={() => setLoop((l) => ({ ...l, b: time }))}
                >
                  Set B
                </button>
                <button type="button" className="btn-ghost px-2 py-1 text-xs" aria-label="Clear loop" onClick={() => setLoop({ a: null, b: null })}>
                  <Icon name="replay" size={14} />
                </button>
              </div>
            </div>
            <p className="mt-1 text-xs text-muted" aria-live="polite">
              {loopText}
            </p>
          </div>
        </aside>
      </div>

      <section className="overflow-hidden rounded-2xl bg-stage text-white shadow-lg" aria-label="Piano">
        <div className="flex flex-wrap items-center gap-4 px-4 py-3">
          <div className="min-w-24">
            <div className="text-[11px] font-semibold tracking-[0.14em] text-white/50 uppercase">Now playing</div>
            <div className="font-display text-2xl font-bold" aria-live="polite" data-testid="current-chord">
              {mode === "chords" ? lastChord || "Press A–G" : "Piano mode"}
            </div>
          </div>
          <div className="ml-auto text-ink">
            <ChordControls />
          </div>
        </div>
        <PianoKeyboard low={low} high={high} labels={mode === "chords" ? "chords" : "c"} qwertyOctave={octave} className="h-36 sm:h-44" />
      </section>
      <KeyGuide />
    </div>
  );
}
