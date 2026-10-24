import { expect, test } from "@playwright/test";

test("without Web MIDI (Safari, iOS) the app explains why and offers the microphone", async ({ page }) => {
  await page.addInitScript(() => {
    delete (Navigator.prototype as unknown as { requestMIDIAccess?: unknown }).requestMIDIAccess;
  });
  await page.goto("/setup");
  const banner = page.getByRole("alert").filter({ hasText: "no Web MIDI" });
  await expect(banner).toContainText("Safari on macOS and every browser on iOS");
  await expect(banner.getByRole("button", { name: "Use the microphone" })).toBeVisible();
  await expect(page.getByText(/let Playboard listen through the microphone below/)).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { __pb: { inputStore: { getState(): { mode: string; midiStatus: string } } } }).__pb.inputStore.getState()),
  ).toMatchObject({ mode: "mic", midiStatus: "unsupported" });
  // The on-screen keyboard and computer keys still play.
  await page.getByRole("button", { name: "Start audio" }).first().click();
  await page.locator("main").click({ position: { x: 5, y: 5 } });
  await page.keyboard.down("a");
  await expect(page.getByRole("button", { name: "C4", exact: true }).first()).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.up("a");
});

test("Bluetooth-like output latency triggers a warning, and a change asks to re-check setup", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __outputLatency: number };
    w.__outputLatency = 0.18;
    Object.defineProperty(AudioContext.prototype, "outputLatency", { configurable: true, get: () => w.__outputLatency });
  });
  await page.goto("/play");
  await page.getByRole("button", { name: "Start audio" }).first().click();
  await expect(page.getByRole("alert").filter({ hasText: "looks wireless" })).toContainText("about 180 ms behind");
  await page.evaluate(() => ((window as unknown as { __outputLatency: number }).__outputLatency = 0.012));
  await expect(page.getByRole("alert").filter({ hasText: "Your audio output changed" })).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole("alert").filter({ hasText: "looks wireless" })).toHaveCount(0);
});
