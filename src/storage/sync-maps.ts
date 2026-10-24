import { SyncMap } from "@/core/sync-map.ts";
import { db, getSetting, setSetting } from "./db.ts";

const key = (songId: string, videoId: string) => `${songId}|${videoId}`;

export async function loadSyncMap(songId: string, videoId: string): Promise<SyncMap> {
  try {
    const r = await (await db()).get("syncMaps", key(songId, videoId));
    return r ? new SyncMap(r.anchors, r.offsetMs) : new SyncMap();
  } catch {
    return new SyncMap();
  }
}

export async function saveSyncMap(songId: string, videoId: string, map: SyncMap): Promise<void> {
  try {
    await (await db()).put("syncMaps", {
      key: key(songId, videoId),
      songId,
      videoId,
      anchors: map.anchors,
      offsetMs: map.offsetMs,
      updatedAt: Date.now(),
    });
  } catch {
    /* storage blocked: the map lasts for this page */
  }
}

/** The YouTube Data API key: a build-time VITE_YOUTUBE_API_KEY, or one the player saved in Settings. */
export async function youtubeApiKey(): Promise<string> {
  const env = (import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined)?.trim();
  if (env) return env;
  return (await getSetting<string>("youtubeApiKey", "")).trim();
}

export function setYoutubeApiKey(value: string): Promise<void> {
  return setSetting("youtubeApiKey", value.trim());
}
