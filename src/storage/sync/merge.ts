/** Last-write-wins merge of synced records, keyed by store and key. Pure. */

export interface SyncRecord {
  store: "sessions" | "progress" | "syncMaps" | "settings";
  key: string;
  value: unknown;
  updatedAt: number;
}

export const id = (r: Pick<SyncRecord, "store" | "key">) => `${r.store}/${r.key}`;

/** Returns what to write locally and what to upload so both sides end up with the newest copy of every record. */
export function mergeRecords(local: SyncRecord[], remote: SyncRecord[]): { toLocal: SyncRecord[]; toRemote: SyncRecord[] } {
  const l = new Map(local.map((r) => [id(r), r]));
  const r = new Map(remote.map((x) => [id(x), x]));
  const toLocal: SyncRecord[] = [];
  const toRemote: SyncRecord[] = [];
  for (const [k, rv] of r) {
    const lv = l.get(k);
    if (!lv || rv.updatedAt > lv.updatedAt) toLocal.push(rv);
  }
  for (const [k, lv] of l) {
    const rv = r.get(k);
    if (!rv || lv.updatedAt > rv.updatedAt) toRemote.push(lv);
  }
  return { toLocal, toRemote };
}

/** Settings that never leave the device. */
export const LOCAL_ONLY_SETTINGS = new Set(["youtubeApiKey", "tier", "midiInput"]);
