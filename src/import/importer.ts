import { buildChart, type Chart, type LicenseInfo, type RawScore } from "@/core/chart.ts";
import { applyEdits, type ChartEdits } from "@/core/transforms.ts";
import { defaultTrackRoles, midiToRaw, parseMidiFile, type ParsedMidi, type TrackRole } from "@/formats/midi-file.ts";
import { parseMusicXmlRaw, parseXml, readMusicXmlMeta } from "@/formats/musicxml.ts";

export const ACCEPT = ".mid,.midi,.kar,.musicxml,.xml,.mxl,audio/midi,audio/x-midi,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml";
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

export type ImportedFile =
  | { format: "midi"; fileName: string; data: ArrayBuffer; midi: ParsedMidi; title: string; composer: string }
  | { format: "musicxml"; fileName: string; data: ArrayBuffer; xml: string; title: string; composer: string };

function startsWith(bytes: Uint8Array, text: string): boolean {
  return [...text].every((c, i) => bytes[i] === c.charCodeAt(0));
}

function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Untitled";
}

/** Unpacks a compressed MusicXML (.mxl) archive and returns the main score. */
async function unzipMxl(data: ArrayBuffer): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(data);
  const container = await zip.file("META-INF/container.xml")?.async("string");
  let path = container ? /full-path="([^"]+)"/.exec(container)?.[1] : undefined;
  path ??= Object.keys(zip.files).find((f) => /\.(musicxml|xml)$/i.test(f) && !f.startsWith("META-INF/"));
  const entry = path ? zip.file(path) : null;
  if (!entry) throw new Error("This .mxl archive has no MusicXML score inside.");
  return entry.async("string");
}

/** Reads a dropped or chosen file. Detection is by content, not by extension. */
export async function readImport(fileName: string, data: ArrayBuffer): Promise<ImportedFile> {
  if (data.byteLength > MAX_IMPORT_BYTES) throw new Error("This file is larger than 20 MB, which is too big for a piano score.");
  const head = new Uint8Array(data, 0, Math.min(8, data.byteLength));
  if (startsWith(head, "MThd")) {
    const midi = parseMidiFile(data);
    const named = midi.tracks.find((t) => t.name && !t.notes.length)?.name;
    if (!midi.tracks.some((t) => t.notes.length)) throw new Error("This MIDI file has no notes (drum tracks are ignored).");
    return { format: "midi", fileName, data, midi, title: named || baseName(fileName), composer: "" };
  }
  if (startsWith(head, "RIFF")) throw new Error("RIFF MIDI (.rmi) files are not supported. Save the file as a standard .mid.");
  let xml: string;
  let stored = data;
  if (startsWith(head, "PK")) {
    xml = await unzipMxl(data);
    stored = new TextEncoder().encode(xml).buffer as ArrayBuffer;
  } else xml = new TextDecoder("utf-8").decode(data);
  if (!/<score-(partwise|timewise)/.test(xml.slice(0, 4000)))
    throw new Error("This file is neither a MIDI file nor MusicXML. Export your score as .mid, .musicxml or .mxl.");
  const doc = parseXml(xml);
  parseMusicXmlRaw(doc); // Fail now, with the parser's message, rather than at practice time.
  const meta = readMusicXmlMeta(doc);
  return {
    format: "musicxml",
    fileName,
    data: stored,
    xml,
    title: meta.title !== "Untitled" ? meta.title : baseName(fileName),
    composer: meta.composer,
  };
}

export function rawFromImport(file: ImportedFile, roles?: TrackRole[]): RawScore {
  if (file.format === "midi") return midiToRaw(file.midi, roles ?? defaultTrackRoles(file.midi), { title: file.title, composer: file.composer });
  return parseMusicXmlRaw(parseXml(file.xml));
}

export function userLicense(fileName: string): LicenseInfo {
  return { kind: "user-private", attribution: `Imported by you from “${fileName}”. Stored only on this device.` };
}

export function chartFromImport(
  file: ImportedFile,
  id: string,
  edits: ChartEdits,
  meta: { title: string; composer: string },
  roles?: TrackRole[],
): Chart {
  const raw = applyEdits(rawFromImport(file, roles), edits);
  return buildChart({ ...raw, title: meta.title, composer: meta.composer, id, license: userLicense(file.fileName) });
}
