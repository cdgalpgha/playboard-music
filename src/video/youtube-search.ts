/**
 * YouTube Data API v3 search, restricted to videos that may be embedded and
 * played outside youtube.com (videoEmbeddable=true, videoSyndicated=true).
 * "Original" mode looks for the official upload so the artist gets the view;
 * "Karaoke" mode looks for karaoke and backing-track uploads.
 */

export type VideoMode = "original" | "karaoke";

export interface VideoResult {
  videoId: string;
  title: string;
  channelTitle: string;
  channelId: string;
  thumbnail: string;
  durationSec: number | null;
  /** Uploaded by the artist's own, VEVO or auto-generated "- Topic" channel. */
  official: boolean;
  /** Title says karaoke, instrumental, backing track or sing-along. */
  karaoke: boolean;
}

interface SearchItem {
  id: { videoId?: string };
  snippet: {
    title: string;
    channelTitle: string;
    channelId: string;
    thumbnails?: { medium?: { url: string }; default?: { url: string } };
  };
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&quot;": '"', "&#39;": "'", "&lt;": "<", "&gt;": ">", "&apos;": "'" };

/** The API HTML-escapes titles; decode the common entities without using innerHTML. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&(amp|quot|#39|lt|gt|apos);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");

export function isOfficialChannel(channelTitle: string, artist: string): boolean {
  const ch = normalize(channelTitle);
  const a = normalize(artist);
  if (/vevo$/i.test(channelTitle.replace(/\s/g, "")) || / - topic$/i.test(channelTitle)) return true;
  return a.length >= 3 && (ch === a || ch === `${a}official` || ch === `${a}music` || ch === `official${a}`);
}

export function isKaraokeTitle(title: string): boolean {
  return /karaoke|instrumental|backing track|sing[- ]?along|minus one/i.test(title);
}

export function queryFor(mode: VideoMode, title: string, artist: string): string {
  const base = `${artist} ${title}`.trim();
  return mode === "original" ? `${base} official` : `${title} ${artist} karaoke`.trim();
}

/** Official uploads first in Original mode, karaoke uploads first in Karaoke mode; YouTube's order otherwise. */
export function rankResults(results: VideoResult[], mode: VideoMode): VideoResult[] {
  const score = (r: VideoResult) =>
    mode === "original" ? (r.official ? 2 : 0) + (r.karaoke ? -2 : 0) : (r.karaoke ? 2 : 0) + (r.official ? -1 : 0);
  return results.map((r, i) => ({ r, i, s: score(r) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.r);
}

/** ISO 8601 duration (PT3M12S) to seconds. */
export function parseIsoDuration(iso: string): number | null {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return null;
  return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
}

const API = "https://www.googleapis.com/youtube/v3";

export class SearchError extends Error {}

export async function searchVideos(
  query: string,
  mode: VideoMode,
  artist: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<VideoResult[]> {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoEmbeddable: "true",
    videoSyndicated: "true",
    maxResults: "12",
    q: query,
    key: apiKey,
  });
  const response = await fetch(`${API}/search?${params}`, { signal });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string; errors?: { reason?: string }[] } } | null;
    const reason = body?.error?.errors?.[0]?.reason;
    if (reason === "quotaExceeded") throw new SearchError("The YouTube search quota for this API key is used up for today.");
    if (reason === "keyInvalid" || response.status === 400) throw new SearchError("The YouTube API key was rejected. Check it in Settings.");
    throw new SearchError(body?.error?.message ?? `YouTube search failed (HTTP ${response.status}).`);
  }
  const data = (await response.json()) as { items?: SearchItem[] };
  const items = (data.items ?? []).filter((i) => i.id.videoId);
  const durations = new Map<string, number | null>();
  if (items.length) {
    const ids = items.map((i) => i.id.videoId!).join(",");
    const details = await fetch(`${API}/videos?${new URLSearchParams({ part: "contentDetails", id: ids, key: apiKey })}`, { signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ items?: { id: string; contentDetails?: { duration?: string } }[] }>) : null))
      .catch(() => null);
    for (const d of details?.items ?? []) durations.set(d.id, parseIsoDuration(d.contentDetails?.duration ?? ""));
  }
  return rankResults(
    items.map((i) => {
      const title = decodeEntities(i.snippet.title);
      const channelTitle = decodeEntities(i.snippet.channelTitle);
      return {
        videoId: i.id.videoId!,
        title,
        channelTitle,
        channelId: i.snippet.channelId,
        thumbnail: i.snippet.thumbnails?.medium?.url ?? i.snippet.thumbnails?.default?.url ?? `https://i.ytimg.com/vi/${i.id.videoId}/mqdefault.jpg`,
        durationSec: durations.get(i.id.videoId!) ?? null,
        official: isOfficialChannel(channelTitle, artist),
        karaoke: isKaraokeTitle(title),
      };
    }),
    mode,
  );
}
