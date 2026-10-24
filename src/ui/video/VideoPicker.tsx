import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { youtubeApiKey } from "@/storage/sync-maps.ts";
import { videoIdFrom, YouTubePlayer } from "@/video/youtube-api.ts";
import { queryFor, searchVideos, type VideoMode, type VideoResult } from "@/video/youtube-search.ts";
import { Icon } from "../Icon.tsx";

export interface ChosenVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  /** Known from search; null when the video came from a pasted link. */
  official: boolean | null;
  karaoke: boolean;
  mode: VideoMode;
}

function duration(sec: number | null): string {
  if (sec === null) return "";
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/** Who receives the view, said plainly (hard rule 2). */
export function ViewCredit({ video }: { video: ChosenVideo }) {
  let note: string;
  if (video.official === true) note = "This is an official upload, so the artist's channel gets the view.";
  else if (video.karaoke) note = "This is a karaoke upload: the uploader gets the view, not the original artist.";
  else if (video.official === false) note = "This upload is not from the artist's own channel.";
  else note = "Pasted link: Playboard cannot tell whether this channel is the artist's own.";
  return (
    <div className="rounded-xl border border-line bg-paper p-3 text-sm" data-testid="view-credit">
      <div>
        Your view counts for <strong>{video.channelTitle || "the uploader"}</strong>
        {video.official ? <span className="chip ml-2 text-green">Official</span> : null}
        {video.karaoke ? <span className="chip ml-2">Karaoke</span> : null}
      </div>
      <p className="mt-1 text-xs text-muted">{note}</p>
      <a
        href={`https://www.youtube.com/watch?v=${video.videoId}`}
        target="_blank"
        rel="noopener"
        className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-green underline"
      >
        Open on YouTube <Icon name="arrow" size={12} />
      </a>
    </div>
  );
}

export function VideoPicker({
  title,
  artist,
  onChoose,
}: {
  title: string;
  artist: string;
  onChoose: (video: ChosenVideo) => void;
}) {
  const [mode, setMode] = useState<VideoMode>("original");
  const [query, setQuery] = useState(() => queryFor("original", title, artist));
  const [results, setResults] = useState<VideoResult[] | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const abort = useRef<AbortController | null>(null);

  useEffect(() => void youtubeApiKey().then(setApiKey), []);

  const switchMode = (m: VideoMode) => {
    setMode(m);
    setQuery(queryFor(m, title, artist));
    setResults(null);
  };

  const search = async () => {
    if (!apiKey) return;
    abort.current?.abort();
    abort.current = new AbortController();
    setBusy(true);
    setError("");
    try {
      setResults(await searchVideos(query, mode, artist, apiKey, abort.current.signal));
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Video type" className="inline-flex rounded-xl border border-line bg-card p-0.5">
        {(
          [
            ["original", "Original video"],
            ["karaoke", "Karaoke"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => switchMode(value)}
            className={`rounded-[10px] px-3 py-1.5 text-sm font-semibold ${mode === value ? "bg-green text-white" : "text-ink-soft hover:bg-sage-soft"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">
        {mode === "original"
          ? "Original looks for the official upload, so the artist's channel gets your view."
          : "Karaoke looks for karaoke and backing-track uploads. Those views go to the karaoke channel."}
      </p>

      {apiKey ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <label className="sr-only" htmlFor="yt-query">
            Search YouTube
          </label>
          <input id="yt-query" className="input-select" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="btn-primary" disabled={busy || !query.trim()}>
            {busy ? "Searching…" : "Search"}
          </button>
        </form>
      ) : (
        apiKey === "" && (
          <p className="text-sm text-ink-soft">
            To search YouTube from here, add a YouTube Data API key in{" "}
            <Link to="/settings" className="text-green underline">
              Settings
            </Link>
            . You can always paste a video link below.
          </p>
        )
      )}
      {error && <p className="text-sm text-bad">{error}</p>}
      {results && (
        <ul className="max-h-80 space-y-1.5 overflow-y-auto" aria-label="Search results">
          {results.length === 0 && <li className="text-sm text-muted">No embeddable videos found. Try other words.</li>}
          {results.map((r) => (
            <li key={r.videoId}>
              <button
                type="button"
                onClick={() => onChoose({ ...r, mode })}
                className="flex w-full items-center gap-3 rounded-xl p-1.5 text-left hover:bg-sage-soft"
              >
                <img src={r.thumbnail} alt="" width={96} height={54} loading="lazy" className="h-[54px] w-24 shrink-0 rounded-lg bg-line object-cover" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{r.title}</span>
                  <span className="block truncate text-xs text-muted">
                    {r.channelTitle}
                    {r.durationSec !== null ? ` · ${duration(r.durationSec)}` : ""}
                  </span>
                  <span className="mt-0.5 flex gap-1">
                    {r.official && <span className="chip py-0 text-[10px] text-green">Official channel</span>}
                    {r.karaoke && <span className="chip py-0 text-[10px]">Karaoke</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const id = videoIdFrom(link);
          if (!id) return setError("Paste a YouTube watch, share or Shorts link.");
          setError("");
          onChoose({ videoId: id, title: "", channelTitle: "", official: null, karaoke: false, mode });
        }}
      >
        <label className="sr-only" htmlFor="yt-link">
          YouTube link
        </label>
        <input id="yt-link" className="input-select" placeholder="…or paste a YouTube link" value={link} onChange={(e) => setLink(e.target.value)} />
        <button className="btn-secondary">Use link</button>
      </form>
    </div>
  );
}

/** The visible, unmodified YouTube player. Creates the player and reports it when ready. */
export function YouTubeEmbed({
  videoId,
  onReady,
  onError,
}: {
  videoId: string;
  onReady: (player: YouTubePlayer) => void;
  onError: (message: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const readyCb = useRef(onReady);
  const errorCb = useRef(onError);
  readyCb.current = onReady;
  errorCb.current = onError;
  useEffect(() => {
    let player: YouTubePlayer | null = null;
    let cancelled = false;
    if (!box.current) return;
    YouTubePlayer.create(box.current, videoId, { onError: (m) => errorCb.current(m) }).then(
      (p) => {
        if (cancelled) return p.destroy();
        player = p;
        readyCb.current(p);
      },
      (e: Error) => !cancelled && errorCb.current(e.message),
    );
    return () => {
      cancelled = true;
      player?.destroy();
    };
  }, [videoId]);
  // YouTube requires an embedded player of at least 200×200 px; the minimum height keeps narrow phones compliant.
  return <div ref={box} className="aspect-video min-h-[200px] w-full min-w-[200px] overflow-hidden rounded-xl bg-black" />;
}
