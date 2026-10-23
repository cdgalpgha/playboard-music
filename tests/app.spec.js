import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const ready = async (page) => {
  await page.goto("/");
  await expect(page.locator("#engine-status")).toHaveText("30 SAMPLES LOADED", {
    timeout: 20000,
  });
};
const observeAudio = async (page) =>
  page.addInitScript(() => {
    const Base = window.AudioContext;
    window.sampleSources = [];
    window.audioContexts = [];
    window.AudioContext = class extends Base {
      constructor(...args) {
        super(...args);
        window.audioContexts.push(this);
      }
      createBufferSource() {
        const s = super.createBufferSource(),
          start = s.start.bind(s),
          stop = s.stop.bind(s);
        s.calls = { starts: [], stops: [] };
        s.start = (...args) => {
          s.calls.starts.push(args);
          return start(...args);
        };
        s.stop = (...args) => {
          s.calls.stops.push(args);
          return stop(...args);
        };
        window.sampleSources.push(s);
        return s;
      }
      createAnalyser() {
        const a = super.createAnalyser();
        window.outputAnalyser = a;
        return a;
      }
    };
  });

test("sampled chords, modifiers, transpose and individual releases", async ({
  page,
}) => {
  await observeAudio(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await page.keyboard.down("d");
  await expect(page.locator("#current-chord")).toHaveText("D");
  await expect(page.locator(".pressed")).toHaveCount(3);
  await expect(page.locator("#played-notes")).toHaveText("D4 · F♯4 · A4");
  await page.keyboard.down("f");
  await expect(page.locator(".pressed")).toHaveCount(5);
  await page.keyboard.up("d");
  await expect(page.locator(".pressed")).toHaveCount(3);
  expect(
    await page.evaluate(() =>
      window.sampleSources.slice(0, 3).every((s) => s.calls.stops.length === 1),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      window.sampleSources.slice(3, 6).every((s) => s.calls.stops.length === 0),
    ),
  ).toBe(true);
  await page.keyboard.up("f");
  await page.keyboard.press("Shift+d");
  await expect(page.locator("#current-chord")).toHaveText("Dm");
  await expect(page.locator("#played-notes")).toHaveText("D4 · F4 · A4");
  await page.keyboard.down("Space");
  await page.keyboard.press("d");
  await expect(page.locator("#current-chord")).toHaveText("D♯");
  await expect(page.locator("#played-notes")).toHaveText("D♯4 · G4 · A♯4");
  await page.keyboard.up("Space");
  await page.locator("#transpose").selectOption("2");
  await page.keyboard.press("d");
  await expect(page.locator("#current-chord")).toHaveText("E");
  await expect(page.locator("#played-notes")).toHaveText("E4 · G♯4 · B4");
  expect(errors).toEqual([]);
});
test("piano mode maps chromatic notes and pedal holds only released notes", async ({
  page,
}) => {
  await observeAudio(page);
  await ready(page);
  await page.getByRole("button", { name: "Piano mode", exact: true }).click();
  await page.keyboard.down("Space");
  await page.keyboard.press("w");
  await expect(page.locator("#played-notes")).toHaveText("C♯4");
  expect(
    await page.evaluate(() => window.sampleSources[0].calls.stops),
  ).toHaveLength(0);
  await page.keyboard.up("Space");
  expect(
    await page.evaluate(() => window.sampleSources[0].calls.stops),
  ).toHaveLength(1);
  await page.keyboard.down("a");
  await page.keyboard.down("s");
  await expect(page.locator(".pressed")).toHaveCount(2);
  await page.keyboard.up("a");
  await expect(page.locator(".pressed")).toHaveCount(1);
  await page.keyboard.up("s");
  await page.locator("#sustain").click();
  await page.keyboard.press("d");
  expect(
    await page.evaluate(() => window.sampleSources.at(-1).calls.stops),
  ).toHaveLength(0);
  await page.locator("#sustain").click();
  expect(
    await page.evaluate(() => window.sampleSources.at(-1).calls.stops),
  ).toHaveLength(1);
  await page.keyboard.press("Escape");
  await expect(page.locator("#sustain")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
test("actual sampled buffer produces audio and master output responds to volume", async ({
  page,
}) => {
  await observeAudio(page);
  await ready(page);
  await page.keyboard.down("d");
  await expect
    .poll(() => page.evaluate(() => window.audioContexts[0].state))
    .toBe("running");
  expect(
    await page.evaluate(() => window.sampleSources[0].buffer.duration),
  ).toBeGreaterThan(2);
  expect(
    await page.evaluate(() => window.sampleSources[0].playbackRate.value),
  ).toBeCloseTo(2 ** (-1 / 12), 4);
  const level = () =>
    page.evaluate(() => {
      const a = window.outputAnalyser,
        d = new Float32Array(a.fftSize);
      a.getFloatTimeDomainData(d);
      return Math.max(...d.map(Math.abs));
    });
  await expect.poll(level).toBeGreaterThan(0.005);
  await page.locator("#volume").evaluate((el) => {
    el.value = 0;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect.poll(level).toBeLessThan(0.0005);
  await page.keyboard.up("d");
});
test("practice uses seventh chords, advances and keeps progress", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "Jazz", exact: true }).click();
  await expect(page.locator(".progression-card").first()).toContainText("Dm7");
  await page.locator("#bpm").fill("180");
  await page.locator("#bpm").blur();
  await page.locator("#practice-toggle").click();
  await expect(page.locator("#practice-toggle")).toContainText("Pause");
  await expect(page.locator(".progression-card").nth(1)).toHaveClass(
    /current/,
    { timeout: 4000 },
  );
  await page.keyboard.press("g");
  await page.getByRole("button", { name: "My progress", exact: true }).click();
  await expect(page.locator(".stat").nth(0).locator("strong")).toHaveText("1");
  await expect(page.locator(".stat").nth(1).locator("strong")).toHaveText("1");
  await page.reload();
  await page.getByRole("button", { name: "My progress", exact: true }).click();
  await expect(page.locator(".stat").nth(0).locator("strong")).toHaveText("1");
});
test("84 interactive chords, inversions and six lessons", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Chord book", exact: true }).click();
  await expect(page.locator(".book-chord")).toHaveCount(84);
  await page.locator("#chord-search").fill("Dm7");
  await expect(page.locator(".book-chord")).toHaveCount(1);
  await expect(page.locator(".book-chord p")).toHaveText("D4 · F4 · A4 · C5");
  await page.locator("#inversion").selectOption("1");
  await expect(page.locator(".book-chord p")).toHaveText("F4 · A4 · C5 · D5");
  await page.locator(".book-chord").click();
  await expect(page.locator(".book-chord")).toHaveClass(/is-playing/);
  await page
    .getByRole("button", { name: "Learn to play", exact: true })
    .click();
  await expect(page.locator("[data-lesson]")).toHaveCount(6);
  await page.locator('[data-lesson="2"]').click();
  await page.keyboard.press("Shift+d");
  await expect(page.locator("#lesson-feedback")).toContainText("That’s it.");
});
test("recorded piano exports a valid non-silent WAV", async ({ page }) => {
  await ready(page);
  await page.locator("#record").click();
  await expect(page.locator("#record")).toContainText("Stop recording");
  await page.keyboard.down("c");
  await page.waitForTimeout(400);
  await page.keyboard.up("c");
  await page.locator("#record").click();
  await expect(page.locator(".record-result")).toContainText("3 notes");
  await page.locator("#replay").click();
  const download = page.waitForEvent("download");
  await page.locator("#download").click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("playboard-piano-take.wav");
  const bytes = await readFile(await file.path());
  expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
  expect(bytes.toString("ascii", 8, 12)).toBe("WAVE");
  expect(bytes.readUInt16LE(22)).toBe(2);
  expect(bytes.length).toBeGreaterThan(100000);
  let max = 0;
  for (let i = 44; i < bytes.length; i += 2)
    max = Math.max(max, Math.abs(bytes.readInt16LE(i)));
  expect(max).toBeGreaterThan(100);
});

test("local audio and LRC lyrics stay synchronized after seeking", async ({
  page,
}) => {
  const rate = 22050,
    seconds = 4,
    bytes = rate * seconds * 2,
    wav = Buffer.alloc(44 + bytes);
  wav.write("RIFF");
  wav.writeUInt32LE(36 + bytes, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(bytes, 40);
  for (let i = 0; i < rate * seconds; i++)
    wav.writeInt16LE(
      Math.round(Math.sin((i / rate) * Math.PI * 2 * 440) * 1000),
      44 + i * 2,
    );
  await ready(page);
  await page
    .getByRole("button", { name: "YouTube sessions", exact: true })
    .click();
  await page.locator(".local-section summary").click();
  await page
    .locator("#karaoke-file")
    .setInputFiles({
      name: "practice.wav",
      mimeType: "audio/wav",
      buffer: wav,
    });
  await page
    .locator("#lyrics-file")
    .setInputFiles({
      name: "practice.lrc",
      mimeType: "text/plain",
      buffer: Buffer.from("[00:00.00]First line\n[00:02.00]Second line"),
    });
  await page.locator("#karaoke-play").click();
  await expect(page.locator("#karaoke-lyric")).toHaveText("First line");
  await page.locator("#karaoke-seek").evaluate((el) => {
    el.value = 2.5;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#karaoke-lyric")).toHaveText("Second line");
});

test("desktop and narrower views fit; guide focus stays in the dialog", async ({
  page,
}) => {
  for (const width of [1440, 1024, 820, 390]) {
    await page.setViewportSize({ width, height: 1080 });
    await ready(page);
    for (const view of [
      "Play studio",
      "YouTube sessions",
      "Chord book",
      "Learn to play",
      "My progress",
    ]) {
      await page.getByRole("button", { name: view, exact: true }).click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
  await page.locator("#help").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#got-it")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#close-modal")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("MIDI adapter honors velocity, note off, and sustain CC64", async ({
  page,
}) => {
  await observeAudio(page);
  await page.addInitScript(() => {
    window.mockMIDI = {
      id: "test-midi",
      name: "Test MIDI keyboard",
      onmidimessage: null,
    };
    Object.defineProperty(navigator, "requestMIDIAccess", {
      value: async () => ({
        inputs: new Map([["test-midi", window.mockMIDI]]),
        onstatechange: null,
      }),
    });
  });
  await ready(page);
  await page.locator("#midi-connect").click();
  await expect(page.locator("#midi-connect")).toContainText(
    "Test MIDI keyboard",
  );
  await page.evaluate(() =>
    window.mockMIDI.onmidimessage({ data: [0x90, 60, 100] }),
  );
  await expect(page.locator('[data-midi="60"]')).toHaveClass(/pressed/);
  await expect(page.locator("#played-notes")).toHaveText("C4");
  await page.evaluate(() => {
    window.mockMIDI.onmidimessage({ data: [0xb0, 64, 127] });
    window.mockMIDI.onmidimessage({ data: [0x80, 60, 0] });
  });
  expect(
    await page.evaluate(() => window.sampleSources[0].calls.stops.length),
  ).toBe(0);
  await page.evaluate(() =>
    window.mockMIDI.onmidimessage({ data: [0xb0, 64, 0] }),
  );
  expect(
    await page.evaluate(() => window.sampleSources[0].calls.stops.length),
  ).toBe(1);
});
test("sample load failure is visible and can be retried without synthetic fallback", async ({
  page,
}) => {
  let failed = true;
  await page.route("**/samples/salamander/C4.mp3", (route) =>
    failed
      ? route.fulfill({ status: 503, body: "Unavailable" })
      : route.continue(),
  );
  await page.goto("/");
  await expect(page.locator("#engine-status")).toHaveText("SAMPLE LOAD FAILED");
  await page.keyboard.press("d");
  await expect(page.locator("#toast")).toContainText("still loading");
  failed = false;
  await page.locator("#enable-audio").click();
  await expect(page.locator("#engine-status")).toHaveText("30 SAMPLES LOADED", {
    timeout: 20000,
  });
  await page.keyboard.press("d");
  await expect(page.locator("#current-chord")).toHaveText("D");
});
