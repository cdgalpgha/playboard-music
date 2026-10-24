import { db } from "@/storage/db.ts";

/** Returns the cached file if its hash matches the manifest, else null. */
export async function readCachedSample(key: string, sha256: string): Promise<ArrayBuffer | null> {
  try {
    const row = await (await db()).get("sampleFiles", key);
    return row && row.sha256 === sha256 ? row.data : null;
  } catch {
    return null;
  }
}

export async function writeCachedSample(key: string, sha256: string, data: ArrayBuffer): Promise<void> {
  try {
    await (await db()).put("sampleFiles", { key, sha256, data, savedAt: Date.now() });
  } catch {
    // Quota exceeded or storage blocked: playback still works from the network.
  }
}

export async function clearSampleCache(): Promise<void> {
  try {
    await (await db()).clear("sampleFiles");
  } catch {
    /* nothing cached */
  }
}

export async function sampleCacheBytes(): Promise<number> {
  try {
    let total = 0;
    let cursor = await (await db()).transaction("sampleFiles").store.openCursor();
    while (cursor) {
      total += cursor.value.data.byteLength;
      cursor = await cursor.continue();
    }
    return total;
  } catch {
    return 0;
  }
}
