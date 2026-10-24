import { expect, test } from "@playwright/test";
import { installMockMidi } from "./fixtures/mock-midi.ts";

type Win = {
  __midi: { send(b: number[], ts?: number): void };
  __pb: {
    audioStore: { getState(): { progress: { playable: boolean } | null } };
    session: { chart: { notes: { pitch: number; hand: string }[] } };
  };
};

test("a lesson shows sheet music, follows playback, and records completion", async ({ page }) => {
  test.setTimeout(90_000);
  await installMockMidi(page);
  await page.goto("/learn");
  await expect(page.getByRole("heading", { name: "Your learning path" })).toBeVisible();
  await expect(page.locator("ol li")).toHaveCount(10);
  await page.getByRole("link", { name: /Meet middle C/ }).click();
  await expect(page.getByRole("heading", { name: "Meet middle C" })).toBeVisible();
  await page.getByRole("button", { name: "Start audio" }).first().click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Win).__pb.audioStore.getState().progress?.playable))
    .toBe(true);
  // The score is engraved and measure 1 is highlighted.
  await expect(page.getByTestId("measure-highlight")).toHaveAttribute("data-measure", "0", { timeout: 20_000 });
  await expect(page.locator("[aria-label='Sheet music'] svg")).toBeVisible();
  // Wait-for-me is preset for this lesson.
  await expect(page.getByRole("button", { name: "Wait for me" })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Practice tempo").fill("1.5");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  // Play every note of the lesson; the music waits at each one.
  await page.evaluate(() => {
    const w = window as unknown as Win;
    for (const n of w.__pb.session.chart.notes) {
      w.__midi.send([0x90, n.pitch, 80]);
      w.__midi.send([0x80, n.pitch, 0]);
    }
  });
  await expect(page.getByTestId("measure-highlight")).not.toHaveAttribute("data-measure", "0", { timeout: 15_000 });
  await expect(page.getByText("Lesson complete.")).toBeVisible({ timeout: 40_000 });
  await expect(page.getByRole("link", { name: /Next: Five fingers in C position/ })).toBeVisible();
  await page.getByRole("link", { name: "Learn to play", exact: true }).click();
  await expect(page.getByRole("link", { name: /Meet middle C \(completed\)/ })).toBeVisible();
});

test("every lesson page loads its score", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/learn");
  await expect(page.locator("ol li a")).toHaveCount(10);
  const links = await page.locator("ol li a").evaluateAll((els) => els.map((e) => e.getAttribute("href")!));
  expect(links).toHaveLength(10);
  for (const href of links) {
    await page.goto(href);
    await expect(page.locator("[aria-label='Sheet music'] svg")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  }
});
