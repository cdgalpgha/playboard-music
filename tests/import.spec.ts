import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { writeMidiFile, type WriterEvent } from "../src/formats/midi-writer.ts";

const note = (pitch: number, start: number, len: number): WriterEvent[] => [
  { tick: start, type: "on", pitch, velocity: 90 },
  { tick: start + len, type: "off", pitch },
];

function twoHandMidi(): Buffer {
  const melody = [60, 62, 64, 65, 67, 65, 64, 62].flatMap((p, i) => note(p, i * 480, 440));
  const bass = [48, 43, 48, 43].flatMap((p, i) => note(p, i * 960, 900));
  return Buffer.from(
    writeMidiFile([
      [
        { tick: 0, type: "name", text: "Little tune" },
        { tick: 0, type: "tempo", bpm: 100 },
        { tick: 0, type: "timesig", numerator: 4, denominator: 4 },
      ],
      [{ tick: 0, type: "name", text: "Melody" }, ...melody],
      [{ tick: 0, type: "name", text: "Bass" }, ...bass],
    ]),
  );
}

type Win = { __pb: { session: { chart: { title: string; notes: { pitch: number; hand: string }[]; tempo: { bpm: number }[] } } } };

test("import a MIDI file, edit key, tempo and hands, practise, then delete", async ({ page }) => {
  await page.goto("/import");
  await page.getByLabel("Choose a MIDI or MusicXML file").setInputFiles({ name: "little-tune.mid", mimeType: "audio/midi", buffer: twoHandMidi() });
  await expect(page.getByRole("heading", { name: /Preview: little-tune.mid/ })).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue("Little tune");
  await expect(page.getByLabel("Hand for Melody")).toHaveValue("R");
  await expect(page.getByLabel("Hand for Bass")).toHaveValue("L");
  const stats = page.getByTestId("import-stats");
  await expect(stats).toContainText("12");
  await expect(stats).toContainText("G2–G4");
  await page.getByLabel("Key (transpose)").selectOption("2");
  await expect(stats).toContainText("A2–A4");
  await page.getByLabel(/Tempo:/).fill("0.5");
  await expect(page.getByText(/Tempo: 50% · 50 BPM/)).toBeVisible();
  await page.getByLabel("Hand for Bass").selectOption("skip");
  await expect(stats).toContainText("8");
  await page.getByLabel("Hand for Bass").selectOption("L");
  await page.getByRole("button", { name: "Add to my library" }).click();

  await expect(page).toHaveURL(/\/pieces\/user-/);
  await expect(page.getByRole("heading", { name: "Little tune" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!(window as unknown as Win).__pb?.session)).toBe(true);
  const chart = await page.evaluate(() => {
    const c = (window as unknown as Win).__pb.session.chart;
    return { first: c.notes.find((n) => n.hand === "R")!.pitch, bpm: c.tempo[0]!.bpm, left: c.notes.filter((n) => n.hand === "L").length };
  });
  expect(chart).toEqual({ first: 62, bpm: 50, left: 4 });
  await expect(page.getByText(/Imported by you from “little-tune.mid”/)).toBeVisible();

  await page.getByRole("link", { name: "Import", exact: true }).click();
  await expect(page.getByRole("region", { name: "My library" }).or(page.locator("section", { hasText: "My library" })).first()).toContainText("Little tune");
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Nothing imported yet.")).toBeVisible();
});

test("import a compressed MusicXML score and see its sheet music", async ({ page }) => {
  const xml = await readFile("public/content/lessons/l07-hands-together.musicxml", "utf8");
  const zip = new JSZip();
  zip.file("META-INF/container.xml", `<?xml version="1.0"?><container><rootfiles><rootfile full-path="score.musicxml"/></rootfiles></container>`);
  zip.file("score.musicxml", xml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  await page.goto("/import");
  await page.getByLabel("Choose a MIDI or MusicXML file").setInputFiles({ name: "lightly-row.mxl", mimeType: "application/vnd.recordare.musicxml", buffer });
  await expect(page.getByLabel("Title")).toHaveValue("Lightly Row");
  await page.getByLabel("Key (transpose)").selectOption("-1");
  await page.getByRole("button", { name: "Add to my library" }).click();
  await expect(page).toHaveURL(/\/pieces\/user-/);
  await expect(page.locator("[aria-label='Sheet music'] svg")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("measure-highlight")).toBeVisible();
});

test("explains files it cannot read", async ({ page }) => {
  await page.goto("/import");
  await page.getByLabel("Choose a MIDI or MusicXML file").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not music") });
  await expect(page.getByRole("alert")).toContainText("neither a MIDI file nor MusicXML");
});

test("a dense imported score still renders at display rate", async ({ page }) => {
  // 60 s at 120 BPM: right-hand 16th notes in thirds, left-hand four-note chords every eighth (1,920 notes).
  const right: WriterEvent[] = [];
  const left: WriterEvent[] = [];
  for (let i = 0; i < 480; i++) for (const third of [0, 4]) right.push(...note(60 + ((i * 7) % 24) + third, i * 120, 110));
  for (let b = 0; b < 240; b++) for (const p of [36, 43, 48, 52]) left.push(...note(p + (b % 5), b * 240, 230));
  const midi = Buffer.from(writeMidiFile([[{ tick: 0, type: "tempo", bpm: 120 }], right, left]));
  await page.goto("/import");
  await page.getByLabel("Choose a MIDI or MusicXML file").setInputFiles({ name: "dense.mid", mimeType: "audio/midi", buffer: midi });
  await page.getByRole("button", { name: "Add to my library" }).click();
  await expect(page).toHaveURL(/\/pieces\/user-/);
  await page.getByRole("button", { name: "Start audio" }).first().click();
  await page.getByRole("radio", { name: "Listen" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(6000);
  const fps = await page.evaluate(() => {
    const s = (window as unknown as { __pb: { session: { state: { fps: Record<string, number> }; chart: { notes: unknown[] } } } }).__pb.session;
    return { ...s.state.fps, notes: s.chart.notes.length } as Record<string, number>;
  });
  console.log(`[fps dense] ${JSON.stringify(fps)}`);
  expect(fps.notes).toBe(1920);
  expect(fps.mean).toBeGreaterThan(55);
  expect(fps.p95FrameMs).toBeLessThan(25);
});
