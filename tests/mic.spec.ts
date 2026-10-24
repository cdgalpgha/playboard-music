import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const fixture = resolve("tests/fixtures/mic-notes.wav");
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

// Chromium plays the WAV as the microphone and grants permission without a prompt.
test.use({
  launchOptions: {
    executablePath,
    args: [
      "--no-sandbox",
      "--autoplay-policy=no-user-gesture-required",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${fixture}`,
    ],
  },
});

type Ev = { note: number; time: number };

test("the microphone path recognises piano notes with Basic Pitch", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/setup");
  await page.evaluate(() => {
    const w = window as unknown as { __heard: Ev[]; __pb?: { inputBus: { subscribe(f: (e: { type: string; note: number; time: number; source: string }) => void): void } } };
    w.__heard = [];
    const hook = () => {
      if (!w.__pb) return setTimeout(hook, 50);
      w.__pb.inputBus.subscribe((e) => {
        if (e.type === "noteon" && e.source === "mic") w.__heard.push({ note: e.note, time: e.time });
      });
    };
    hook();
  });
  await page.getByRole("button", { name: "Start audio" }).first().click();
  await page.getByRole("button", { name: "Listen through the microphone" }).click();
  await expect(page.getByText(/Detector on (webgl|cpu)/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("less accurate").first()).toBeVisible();
  // Two loops of the 4 s file.
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __heard: Ev[] }).__heard.length), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(6);
  const heard = await page.evaluate(() => (window as unknown as { __heard: Ev[] }).__heard);
  const info = await page.getByText(/Detector on/).textContent();
  console.log(`[mic] ${info} · heard ${heard.map((h) => h.note).join(" ")}`);
  const notes = heard.map((h) => h.note);
  // Every detection is one of the three notes in the file, and all three are heard.
  expect(new Set(notes)).toEqual(new Set([60, 69, 66]));
  // Onsets keep the file's spacing: C4 → A4 is 1.0 s, A4 → F#4 is 1.0 s.
  for (let i = 0; i + 2 < heard.length; i++) {
    if (heard[i]!.note === 60 && heard[i + 1]!.note === 69 && heard[i + 2]!.note === 66) {
      const a = heard[i + 1]!.time - heard[i]!.time;
      const b = heard[i + 2]!.time - heard[i + 1]!.time;
      console.log(`[mic] spacing ${a.toFixed(1)} ms, ${b.toFixed(1)} ms (expected 1000)`);
      expect(Math.abs(a - 1000)).toBeLessThan(40);
      expect(Math.abs(b - 1000)).toBeLessThan(40);
      expect(errors).toEqual([]);
      return;
    }
  }
  throw new Error(`No C4, A4, F#4 sequence in ${notes.join(" ")}`);
});
