import { expect, test, type Page } from "@playwright/test";
import { installMockMidi, midiSend } from "./fixtures/mock-midi.ts";

type Pb = {
  audioStore: { getState(): Record<string, any> };
  inputBus: { isHeld(n: number): boolean };
};
const state = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __pb: Pb }).__pb.audioStore.getState();
    return { status: s.status, progress: s.progress, stats: s.stats, latency: s.latencyHistory, output: s.output };
  });

async function startAudio(page: Page) {
  await page.getByRole("button", { name: "Start audio" }).first().click();
  await expect.poll(async () => (await state(page)).progress?.playable, { timeout: 30_000 }).toBe(true);
}

test("free play: MIDI note, velocity, sustain pedal and measured latency", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await installMockMidi(page);
  await page.goto("/play");
  await startAudio(page);

  await midiSend(page, [0x90, 60, 100]);
  const c4 = page.getByRole("button", { name: "C4", exact: true }).first();
  await expect(c4).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("C4 100")).toBeVisible();
  await expect.poll(async () => (await state(page)).stats.voices).toBeGreaterThan(0);
  await expect.poll(async () => (await state(page)).stats.peak).toBeGreaterThan(0.001);

  await midiSend(page, [0xb0, 64, 127]);
  await expect(page.getByText("Pedal down")).toBeVisible();
  await midiSend(page, [0x80, 60, 0]);
  await expect(c4).toHaveAttribute("aria-pressed", "false");
  // Pedal held: the voice keeps sounding after note-off.
  await page.waitForTimeout(300);
  expect((await state(page)).stats.voices).toBeGreaterThan(0);

  for (const note of [62, 64, 65, 67, 69, 71, 72, 74, 76, 77]) {
    await midiSend(page, [0x90, note, 70]);
    await page.waitForTimeout(40);
  }
  await expect.poll(async () => (await state(page)).latency.filter((l: { source: string }) => l.source === "midi").length).toBeGreaterThanOrEqual(10);
  const s = await state(page);
  const totals = s.latency.map((l: { totalMs: number }) => l.totalMs).sort((a: number, b: number) => a - b);
  const med = (key: string) => {
    const v = s.latency.map((l: Record<string, number>) => l[key]!).sort((a: number, b: number) => a - b);
    return v[Math.floor(v.length / 2)].toFixed(2);
  };
  console.log(
    `[latency] notes=${totals.length} total median=${med("totalMs")} max=${totals.at(-1).toFixed(2)} ms; ` +
      `dispatch=${med("dispatchMs")} audio=${med("audioMs")} ms; ` +
      `device=${JSON.stringify(s.output)}`,
  );
  // The app's own share: main-thread dispatch, and the audio path beyond what the device reports.
  expect(Number(med("dispatchMs"))).toBeLessThan(3);
  const device = s.output.baseLatencyMs + s.output.outputLatencyMs;
  expect(Number(med("audioMs"))).toBeLessThan(device + 128 / s.output.sampleRate * 1000 + 3);
  expect(errors).toEqual([]);
});

test("on-screen keys play and release with the pointer", async ({ page }) => {
  await page.goto("/play");
  await startAudio(page);
  const e4 = page.getByRole("button", { name: "E4", exact: true }).first();
  const box = (await e4.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.8);
  await page.mouse.down();
  await expect(e4).toHaveAttribute("aria-pressed", "true");
  await page.mouse.up();
  await expect(e4).toHaveAttribute("aria-pressed", "false");
});

test("chord mode: letters play major chords, Shift minor, Space sharp", async ({ page }) => {
  await page.goto("/play");
  await startAudio(page);
  await page.locator("main").click({ position: { x: 5, y: 5 } });
  const key = (name: string) => page.getByRole("button", { name, exact: true }).first();
  await page.keyboard.down("d");
  for (const n of ["D4", "F♯4", "A4"]) await expect(key(n)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("current-chord")).toHaveText("D");
  await page.keyboard.up("d");
  await page.keyboard.down("Shift");
  await page.keyboard.down("D");
  for (const n of ["D4", "F4", "A4"]) await expect(key(n)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("current-chord")).toHaveText("Dm");
  await page.keyboard.up("D");
  await page.keyboard.up("Shift");
  await page.keyboard.down(" ");
  await page.keyboard.down("d");
  for (const n of ["D♯4", "G4", "A♯4"]) await expect(key(n)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("current-chord")).toHaveText("D♯");
  await page.keyboard.up("d");
  await page.keyboard.up(" ");
  await expect(key("D♯4")).toHaveAttribute("aria-pressed", "false");
});

test("piano mode: computer keyboard plays notes and space holds the pedal", async ({ page }) => {
  await page.goto("/play");
  await startAudio(page);
  await page.getByRole("button", { name: "Piano mode" }).click();
  await page.locator("main").click({ position: { x: 5, y: 5 } });
  await page.keyboard.down("a");
  await expect(page.getByRole("button", { name: "C4", exact: true }).first()).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.up("a");
  await page.keyboard.down(" ");
  await expect(page.getByText("Pedal down")).toBeVisible();
  await page.keyboard.up(" ");
  await expect(page.getByText("Pedal up")).toBeVisible();
});

test("ten-finger chords with the pedal held stay inside the audio thread budget", async ({ page }) => {
  await installMockMidi(page);
  await page.goto("/play");
  await startAudio(page);
  await expect.poll(async () => (await state(page)).progress?.done, { timeout: 60_000 }).toBe(true);
  await midiSend(page, [0xb0, 64, 127]);
  const loads: number[] = [];
  const chords = [
    [36, 43, 48, 52, 55, 60, 64, 67, 72, 76],
    [41, 48, 53, 57, 60, 65, 69, 72, 77, 81],
    [43, 50, 55, 59, 62, 67, 71, 74, 79, 83],
    [33, 40, 45, 48, 52, 57, 60, 64, 69, 72],
  ];
  for (let i = 0; i < 40; i++) {
    const chord = chords[i % chords.length]!.map((n) => n + (i % 3));
    for (const n of chord) await midiSend(page, [0x90, n, 50 + ((i * 7 + n) % 70)]);
    await page.waitForTimeout(100);
    for (const n of chord) await midiSend(page, [0x80, n, 0]);
    await page.waitForTimeout(100);
    loads.push((await state(page)).stats.load);
  }
  const s = await state(page);
  const mean = loads.reduce((a, b) => a + b, 0) / loads.length;
  console.log(
    `[stress] voices=${s.stats.voices}+${s.stats.auxVoices} steals=${s.stats.steals} ` +
      `mean load=${(mean * 100).toFixed(1)}% max load=${(Math.max(...loads) * 100).toFixed(1)}% overBudget=${s.stats.overBudget}`,
  );
  expect(s.stats.voices).toBeGreaterThan(40);
  expect(s.stats.overBudget).toBe(0);
});

test("second visit loads the piano from IndexedDB", async ({ page }) => {
  await page.goto("/play");
  await startAudio(page);
  await expect.poll(async () => (await state(page)).progress?.done, { timeout: 60_000 }).toBe(true);
  await page.reload();
  await startAudio(page);
  await expect.poll(async () => (await state(page)).progress?.done, { timeout: 60_000 }).toBe(true);
  const p = (await state(page)).progress;
  expect(p.fromCache).toBe(p.total);
});
