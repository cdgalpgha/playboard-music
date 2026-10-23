import { describe, expect, it } from "vitest";
import { mergeRecords, type SyncRecord } from "./merge.ts";

const r = (key: string, updatedAt: number, value: unknown = key): SyncRecord => ({ store: "progress", key, value, updatedAt });

describe("mergeRecords", () => {
  it("keeps the newest copy of each record on both sides", () => {
    const { toLocal, toRemote } = mergeRecords([r("a", 5), r("b", 9), r("c", 1)], [r("a", 7), r("b", 3), r("d", 2)]);
    expect(toLocal.map((x) => x.key).sort()).toEqual(["a", "d"]);
    expect(toRemote.map((x) => x.key).sort()).toEqual(["b", "c"]);
  });

  it("does nothing when both sides match", () => {
    expect(mergeRecords([r("a", 5)], [r("a", 5)])).toEqual({ toLocal: [], toRemote: [] });
  });

  it("keeps stores apart", () => {
    const local: SyncRecord[] = [{ store: "settings", key: "x", value: 1, updatedAt: 1 }];
    const remote: SyncRecord[] = [{ store: "progress", key: "x", value: 2, updatedAt: 2 }];
    const m = mergeRecords(local, remote);
    expect(m.toLocal).toHaveLength(1);
    expect(m.toRemote).toHaveLength(1);
  });
});
