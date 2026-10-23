import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface CalibrationRecord {
  /** `${inputDeviceKey}|${outputDeviceKey}` */
  key: string;
  inputName: string;
  outputName: string;
  /** Subtracted from input timestamps before scoring. */
  inputOffsetMs: number;
  /** How much later audio is heard than visuals appear. */
  audioOffsetMs: number;
  taps: number;
  spreadMs: number;
  updatedAt: number;
}

export interface SampleFileRecord {
  key: string;
  sha256: string;
  data: ArrayBuffer;
  savedAt: number;
}

export interface UserSongRecord {
  id: string;
  title: string;
  composer: string;
  fileName: string;
  format: "midi" | "musicxml";
  data: ArrayBuffer;
  /** Transpose in semitones and tempo factor applied on load. */
  edits: { transpose: number; tempo: number; leftHandTracks?: number[] };
  createdAt: number;
  updatedAt: number;
}

export interface SyncMapRecord {
  /** `${songId}|${videoId}` */
  key: string;
  songId: string;
  videoId: string;
  offsetMs: number;
  anchors: { videoSec: number; chartSec: number }[];
  updatedAt: number;
}

export interface SessionRecord {
  id?: number;
  songId: string;
  kind: "lesson" | "song" | "practice";
  startedAt: number;
  durationSec: number;
  accuracy: number;
  judgements: Record<string, number>;
  skills: string[];
  updatedAt: number;
}

export interface KeyValueRecord<T = unknown> {
  key: string;
  value: T;
  updatedAt: number;
}

export interface OutboxRecord {
  id?: number;
  store: "sessions" | "progress" | "syncMaps" | "settings";
  key: string | number;
  queuedAt: number;
}

interface PlayboardDB extends DBSchema {
  settings: { key: string; value: KeyValueRecord };
  devices: { key: string; value: CalibrationRecord };
  sampleFiles: { key: string; value: SampleFileRecord };
  userSongs: { key: string; value: UserSongRecord; indexes: { byUpdated: number } };
  syncMaps: { key: string; value: SyncMapRecord; indexes: { bySong: string } };
  sessions: { key: number; value: SessionRecord; indexes: { bySong: string; byStart: number } };
  progress: { key: string; value: KeyValueRecord };
  outbox: { key: number; value: OutboxRecord };
}

export type { PlayboardDB };

let dbPromise: Promise<IDBPDatabase<PlayboardDB>> | null = null;

export function db(): Promise<IDBPDatabase<PlayboardDB>> {
  dbPromise ??= openDB<PlayboardDB>("playboard", 1, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore("settings", { keyPath: "key" });
        database.createObjectStore("devices", { keyPath: "key" });
        database.createObjectStore("sampleFiles", { keyPath: "key" });
        database.createObjectStore("userSongs", { keyPath: "id" }).createIndex("byUpdated", "updatedAt");
        database.createObjectStore("syncMaps", { keyPath: "key" }).createIndex("bySong", "songId");
        const sessions = database.createObjectStore("sessions", { keyPath: "id", autoIncrement: true });
        sessions.createIndex("bySong", "songId");
        sessions.createIndex("byStart", "startedAt");
        database.createObjectStore("progress", { keyPath: "key" });
        database.createObjectStore("outbox", { keyPath: "id", autoIncrement: true });
      }
    },
  });
  return dbPromise;
}

/** Test hook: forget the open connection (fake-indexeddb resets between tests). */
export function resetDbForTests(): void {
  dbPromise = null;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const row = await (await db()).get("settings", key);
    return row ? (row.value as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  try {
    await (await db()).put("settings", { key, value, updatedAt: Date.now() });
  } catch {
    // Private mode or blocked storage: settings then last for this page only.
  }
}
