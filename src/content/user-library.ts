import { db, type UserSongRecord } from "@/storage/db.ts";
import { chartFromImport, readImport, userLicense, type ImportedFile } from "@/import/importer.ts";
import type { ChartEdits } from "@/core/transforms.ts";
import type { TrackRole } from "@/formats/midi-file.ts";
import { registerProvider, type CatalogItem, type CatalogProvider } from "./catalog.ts";

export const USER_PREFIX = "user-";

function newId(): string {
  const rand = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return USER_PREFIX + rand.replace(/-/g, "").slice(0, 16);
}

export async function listUserSongs(): Promise<UserSongRecord[]> {
  try {
    const rows = await (await db()).getAllFromIndex("userSongs", "byUpdated");
    return rows.reverse();
  } catch {
    return [];
  }
}

export async function getUserSong(id: string): Promise<UserSongRecord | undefined> {
  try {
    return await (await db()).get("userSongs", id);
  } catch {
    return undefined;
  }
}

export async function saveUserSong(
  file: ImportedFile,
  meta: { title: string; composer: string },
  edits: ChartEdits,
  roles?: TrackRole[],
  existingId?: string,
): Promise<UserSongRecord> {
  const now = Date.now();
  const previous = existingId ? await getUserSong(existingId) : undefined;
  const record: UserSongRecord = {
    id: existingId ?? newId(),
    title: meta.title.trim() || "Untitled",
    composer: meta.composer.trim(),
    fileName: file.fileName,
    format: file.format,
    data: file.data,
    edits: { transpose: edits.transpose, tempo: edits.tempo, ...(roles ? { roles } : {}) },
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };
  await (await db()).put("userSongs", record);
  return record;
}

export async function deleteUserSong(id: string): Promise<void> {
  await (await db()).delete("userSongs", id);
}

export async function importedFromRecord(r: UserSongRecord): Promise<ImportedFile> {
  const file = await readImport(r.fileName, r.data);
  return { ...file, title: r.title, composer: r.composer };
}

function toItem(r: UserSongRecord): CatalogItem {
  return {
    id: r.id,
    kind: "user",
    title: r.title,
    composer: r.composer,
    level: 0,
    skills: [],
    description: `Imported from ${r.fileName}`,
    license: userLicense(r.fileName),
    chartUrl: `user:${r.id}`,
    measures: 0,
    durationSec: 0,
    sheetTranspose: r.format === "musicxml" ? r.edits.transpose : undefined,
  };
}

/** Files imported by this user. Private: kept in IndexedDB on this device only. */
export const userProvider: CatalogProvider = {
  id: "user",
  async list() {
    return (await listUserSongs()).map(toItem);
  },
  async loadChart(item) {
    const r = await getUserSong(item.id);
    if (!r) throw new Error("This song is no longer in your library.");
    const file = await importedFromRecord(r);
    return chartFromImport(file, r.id, r.edits, { title: r.title, composer: r.composer }, r.edits.roles);
  },
  async loadMusicXml(item) {
    const r = await getUserSong(item.id);
    if (!r || r.format !== "musicxml") return null;
    return new TextDecoder().decode(r.data);
  },
};

registerProvider(userProvider);
