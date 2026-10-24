import type { Chart, LicenseInfo } from "@/core/chart.ts";
import { parseMusicXml } from "@/formats/musicxml.ts";
import builtinPieces from "./builtin/pieces.json";

export interface CatalogItem {
  id: string;
  kind: "piece" | "lesson" | "user";
  title: string;
  composer: string;
  arranger?: string;
  level: number;
  skills: string[];
  description: string;
  license: LicenseInfo;
  chartUrl: string;
  measures: number;
  durationSec: number;
  /** Semitones to transpose the sheet view by (imported MusicXML with a key edit). */
  sheetTranspose?: number;
}

/**
 * A source of playable items. Built-in content and the user's private library
 * are providers; a licensed catalog would be another one, and must supply a
 * license record for every item.
 */
export interface CatalogProvider {
  readonly id: string;
  list(): Promise<CatalogItem[]>;
  loadChart(item: CatalogItem): Promise<Chart>;
  /** MusicXML text for the sheet view, when the item has a score. */
  loadMusicXml?(item: CatalogItem): Promise<string | null>;
}

export function assertLicensed(item: CatalogItem): CatalogItem {
  if (!item.license || !item.license.kind || !item.license.attribution)
    throw new Error(`Catalog item "${item.id}" has no license record and cannot be shown.`);
  return item;
}

const xmlCache = new Map<string, Promise<string>>();

async function fetchText(url: string): Promise<string> {
  let p = xmlCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      return r.text();
    });
    xmlCache.set(url, p);
    p.catch(() => xmlCache.delete(url));
  }
  return p;
}

export const builtinProvider: CatalogProvider = {
  id: "builtin",
  async list() {
    return (builtinPieces as CatalogItem[]).map(assertLicensed);
  },
  async loadChart(item) {
    return parseMusicXml(await fetchText(item.chartUrl), item.id, item.license);
  },
  async loadMusicXml(item) {
    return fetchText(item.chartUrl);
  },
};

const providers: CatalogProvider[] = [builtinProvider];

export function registerProvider(p: CatalogProvider): void {
  if (!providers.some((x) => x.id === p.id)) providers.push(p);
}

export async function findItem(id: string): Promise<{ item: CatalogItem; provider: CatalogProvider } | null> {
  for (const provider of providers) {
    const item = (await provider.list()).find((i) => i.id === id);
    if (item) return { item, provider };
  }
  return null;
}
