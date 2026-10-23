import { expect, test, type Page } from "@playwright/test";
import { installMockMidi } from "./fixtures/mock-midi.ts";

type Win = {
  __midi: { send(b: number[], ts?: number): void };
  __pb: {
    audioStore: { getState(): { progress: { playable: boolean } | null } };
    session: {
      chart: { notes: { id: number; pitch: number; start: number; hand: string }[] };
      transport: { perfAt(tau: number): number; tauAt(): number };
      state: { status: string; live: { counts: Record<string, number>; wrong: number }; summary: unknown };
      resultFor(id: number): string | undefined;
    };
  };
};

async function open(page: Page, id: string) {
  await installMockMidi(page);
  await page.goto(`/pieces/${id}`);
  await page.getByRole("button", { name: "Start audio" }).first().click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Win).__pb.audioStore.getState().progress?.playable))
    .toBe(true);
}

/** Sends a note-on stamped `offsetMs` from the expected time of chart note `index` (right hand). */
async function playNote(page: Page, index: number, offsetMs: number, pitchShift = 0) {
  await page.evaluate(
    ([index, offsetMs, pitchShift]) => {
      const w = window as unknown as Win;
      const s = w.__pb.session;
      const n = s.chart.notes.filter((x) => x.hand === "R")[index]!;
      const ts = s.transport.perfAt(n.start) + offsetMs;
      w.__midi.send([0x90, n.pitch + pitchShift, 80], ts);
      w.__midi.send([0x80, n.pitch + pitchShift, 0], ts + 200);
    },
    [index, offsetMs, pitchShift] as const,
  );
}

test("scoring judges MIDI timestamps against the chart", async ({ page }) => {
  await open(page, "ode-to-joy");
  await page.getByRole("radio", { name: "Right" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  // Sent during the count-in, stamped with the times a player would hit them.
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__pb.session.state.status)).toBe("countin");
  // Perfect, good, late, early, then a wrong pitch.
  await playNote(page, 0, 5);
  await playNote(page, 1, 70);
  await playNote(page, 2, 130);
  await playNote(page, 3, -150);
  await playNote(page, 4, 0, 1);
  const live = await page.evaluate(() => (window as unknown as Win).__pb.session.state.live);
  expect(live.counts).toMatchObject({ perfect: 1, good: 1, late: 1, early: 1 });
  expect(live.wrong).toBe(1);
  // The note under the wrong pitch is missed once its window passes (G4 at 2.4 s).
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Win).__pb.session.state.live.counts.miss), { timeout: 8000 })
    .toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId("live-accuracy")).toContainText("%");
  await page.getByRole("button", { name: "Pause" }).click();
});

test("wait-for-me holds the music until the right notes are played", async ({ page }) => {
  await open(page, "ode-to-joy");
  await page.getByRole("radio", { name: "Right" }).click();
  await page.getByRole("button", { name: "Wait for me" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(1200);
  const tau1 = await page.evaluate(() => (window as unknown as Win).__pb.session.transport.tauAt());
  expect(tau1).toBeCloseTo(0, 2);
  await expect(page.getByTestId("wait-progress")).toContainText("0/");
  await page.evaluate(() => (window as unknown as Win).__midi.send([0x90, 64, 80]));
  await page.evaluate(() => (window as unknown as Win).__midi.send([0x80, 64, 0]));
  await expect(page.getByTestId("wait-progress")).toContainText("1/");
  await page.waitForTimeout(1000);
  const tau2 = await page.evaluate(() => (window as unknown as Win).__pb.session.transport.tauAt());
  // Released, then held again at the second E4 (0.6 s).
  expect(tau2).toBeCloseTo(0.6, 2);
});

test("loop, tempo and hands controls drive the session", async ({ page }) => {
  await open(page, "minuet-in-g");
  await page.getByLabel("Loop from measure").selectOption({ label: "m. 2" });
  await page.getByLabel("Loop to measure").selectOption({ label: "m. 3" });
  await page.getByRole("button", { name: "Set loop" }).click();
  await expect(page.getByRole("button", { name: "Looping" })).toBeVisible();
  await page.getByLabel("Practice tempo").fill("0.5");
  await page.getByRole("radio", { name: "Left" }).click();
  await expect(page.getByRole("button", { name: "Play other hand" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  // Measures 2-3 at 104 BPM in 3/4 at half speed: about 6.9 s per pass, plus a 3.5 s count-in.
  await expect.poll(() => page.locator("text=Loop passes").count(), { timeout: 20_000 }).toBe(1);
  await expect(page.getByText(/Pass 1:/)).toBeVisible();
});

test("calibration measures and stores input and audio offsets", async ({ page }) => {
  await installMockMidi(page);
  await page.goto("/setup");
  await page.getByRole("button", { name: "Start audio" }).first().click();
  // A simulated player: 25 ms after each click is heard, 10 ms after each flash is drawn.
  await page.evaluate(() => {
    const w = window as unknown as Win;
    const observer = new MutationObserver(() => {
      const beat = document.querySelector("[data-testid=cal-beat]");
      const pad = document.querySelector("[data-testid=cal-pad]");
      const text = beat?.textContent ?? "";
      const visual = document.body.textContent?.includes("each flash you see");
      if (!visual && text !== (observer as unknown as { last?: string }).last && /Listen|\//.test(text)) {
        (observer as unknown as { last?: string }).last = text;
        const at = performance.now() + 25;
        w.__midi.send([0x90, 60, 70], at);
        w.__midi.send([0x80, 60, 0], at + 80);
      }
      if (visual && pad?.getAttribute("data-flash") === "on" && !(pad as HTMLElement).dataset.tapped) {
        (pad as HTMLElement).dataset.tapped = "1";
        const at = performance.now() + 10;
        w.__midi.send([0x90, 62, 70], at);
        w.__midi.send([0x80, 62, 0], at + 80);
      }
      if (pad?.getAttribute("data-flash") === "off") delete (pad as HTMLElement | null)?.dataset.tapped;
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  });
  await page.getByRole("button", { name: "Start calibration" }).click();
  const result = page.getByTestId("calibration-result");
  await expect(result).toBeVisible({ timeout: 40_000 });
  const text = (await result.textContent()) ?? "";
  const input = Number(/input offset (-?\d+) ms/.exec(text)?.[1]);
  const audio = Number(/audio offset (-?\d+) ms/.exec(text)?.[1]);
  console.log(`[calibration] ${text}`);
  expect(input).toBeGreaterThanOrEqual(5);
  expect(input).toBeLessThanOrEqual(30);
  expect(audio).toBeGreaterThanOrEqual(3);
  expect(audio).toBeLessThanOrEqual(30);
  // The offsets persist for this device pair.
  await page.reload();
  await page.getByRole("button", { name: "Start audio" }).first().click();
  await expect(page.getByTestId("calibration-result")).toBeVisible();
});

test("falling notes render at display rate while the piece plays", async ({ page }) => {
  await open(page, "minuet-in-g");
  await page.getByRole("radio", { name: "Listen" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(6000);
  const fps = await page.evaluate(
    () => (window as unknown as { __pb: { session: { state: { fps: Record<string, number> } } } }).__pb.session.state.fps,
  );
  console.log(`[fps] ${JSON.stringify(fps)}`);
  expect(fps.mean).toBeGreaterThan(55);
  expect(fps.p95FrameMs).toBeLessThan(25);
});
