/**
 * Optional cloud sync through Supabase (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).
 * Syncs finished sessions, progress, video sync maps and settings, last write
 * wins. Imported song files never leave the device.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createStore, useStore } from "zustand";
import { db } from "../db.ts";
import { LOCAL_ONLY_SETTINGS, mergeRecords, type SyncRecord } from "./merge.ts";

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const cloudConfigured = Boolean(URL_ && KEY);

export interface CloudState {
  user: { id: string; email: string } | null;
  status: "idle" | "syncing" | "error" | "sent-link";
  message: string;
  lastSync: number | null;
}

export const cloudStore = createStore<CloudState>(() => ({ user: null, status: "idle", message: "", lastSync: null }));
export const useCloud = <T,>(sel: (s: CloudState) => T) => useStore(cloudStore, sel);

let client: SupabaseClient | null = null;
async function supabase(): Promise<SupabaseClient> {
  if (!cloudConfigured) throw new Error("Cloud sync is not configured.");
  if (!client) {
    const { createClient } = await import("@supabase/supabase-js");
    client = createClient(URL_!, KEY!);
    client.auth.onAuthStateChange((_e, session) => {
      const u = session?.user;
      cloudStore.setState({ user: u ? { id: u.id, email: u.email ?? "" } : null });
      if (u) void syncNow();
    });
  }
  return client;
}

export async function initCloud(): Promise<void> {
  if (!cloudConfigured) return;
  const { data } = await (await supabase()).auth.getSession();
  const u = data.session?.user;
  if (u) cloudStore.setState({ user: { id: u.id, email: u.email ?? "" } });
}

export async function sendMagicLink(email: string): Promise<void> {
  const { error } = await (await supabase()).auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + "/settings" } });
  cloudStore.setState(error ? { status: "error", message: error.message } : { status: "sent-link", message: `Check ${email} for a sign-in link.` });
}

export async function signOut(): Promise<void> {
  await (await supabase()).auth.signOut();
  cloudStore.setState({ user: null, status: "idle", message: "" });
}

async function localRecords(): Promise<SyncRecord[]> {
  const d = await db();
  const out: SyncRecord[] = [];
  for (const s of await d.getAll("sessions"))
    out.push({ store: "sessions", key: `${s.songId}@${s.startedAt}`, value: { ...s, id: undefined }, updatedAt: s.updatedAt });
  for (const p of await d.getAll("progress")) out.push({ store: "progress", key: p.key, value: p.value, updatedAt: p.updatedAt });
  for (const m of await d.getAll("syncMaps")) out.push({ store: "syncMaps", key: m.key, value: m, updatedAt: m.updatedAt });
  for (const s of await d.getAll("settings"))
    if (!LOCAL_ONLY_SETTINGS.has(s.key)) out.push({ store: "settings", key: s.key, value: s.value, updatedAt: s.updatedAt });
  return out;
}

async function writeLocal(records: SyncRecord[]): Promise<void> {
  const d = await db();
  const existingSessions = new Set((await d.getAll("sessions")).map((s) => `${s.songId}@${s.startedAt}`));
  for (const r of records) {
    if (r.store === "sessions") {
      if (!existingSessions.has(r.key)) {
        const { id: _id, ...value } = r.value as Record<string, unknown>;
        await d.add("sessions", value as never);
      }
    } else if (r.store === "syncMaps") await d.put("syncMaps", r.value as never);
    else await d.put(r.store, { key: r.key, value: r.value, updatedAt: r.updatedAt });
  }
}

export async function syncNow(): Promise<void> {
  const user = cloudStore.getState().user;
  if (!cloudConfigured || !user) return;
  cloudStore.setState({ status: "syncing", message: "" });
  try {
    const sb = await supabase();
    const { data, error } = await sb.from("playboard_records").select("store,key,value,updated_at");
    if (error) throw error;
    const remote: SyncRecord[] = (data ?? []).map((r) => ({ store: r.store, key: r.key, value: r.value, updatedAt: Number(r.updated_at) }));
    const { toLocal, toRemote } = mergeRecords(await localRecords(), remote);
    await writeLocal(toLocal);
    if (toRemote.length) {
      const rows = toRemote.map((r) => ({ user_id: user.id, store: r.store, key: r.key, value: r.value, updated_at: r.updatedAt }));
      const { error: upErr } = await sb.from("playboard_records").upsert(rows);
      if (upErr) throw upErr;
    }
    cloudStore.setState({ status: "idle", lastSync: Date.now(), message: `Synced: ${toLocal.length} down, ${toRemote.length} up.` });
  } catch (e) {
    cloudStore.setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
  }
}
