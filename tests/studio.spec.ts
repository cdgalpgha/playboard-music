import { expect, test } from "@playwright/test";
import { installMockYouTube } from "./fixtures/mock-youtube.ts";

test("start here guides a beginner and ticks off the first steps", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Never played before? Perfect." })).toBeVisible();
  const steps = page.getByRole("list", { name: "Getting started" });
  await steps.getByRole("button", { name: "Start audio" }).click();
  await expect(steps.getByText("1 of 4 done").or(page.getByText("1 of 4 done"))).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: "Open the piano" }).click();
  await page.locator("main").click({ position: { x: 5, y: 5 } });
  await page.keyboard.down("g");
  await page.keyboard.up("g");
  await page.getByRole("link", { name: "Start here" }).click();
  await expect(page.getByText("2 of 4 done")).toBeVisible();
  await expect(page.getByRole("link", { name: "Start lesson 1" })).toBeVisible();
});

test("play along: a pasted link opens the official player with the channel credited, chord keys play", async ({ page }) => {
  await installMockYouTube(page);
  await page.goto("/play-along");
  await page.getByLabel("YouTube link").fill("not a link");
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page.getByRole("alert")).toContainText("isn't a YouTube link");
  await page.getByLabel("YouTube link").fill("https://youtu.be/dQw4w9WgXcQ");
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page).toHaveURL(/v=dQw4w9WgXcQ/);
  await expect(page.locator('iframe[title="YouTube video player"]')).toBeVisible();
  await expect(page.getByText("Uploaded by")).toContainText("Mock Channel");
  await expect(page.getByRole("link", { name: /Watch on YouTube/ })).toHaveAttribute("href", /dQw4w9WgXcQ/);

  await page.getByRole("button", { name: "Play video" }).click();
  await expect(page.getByRole("button", { name: "Pause video" })).toBeVisible();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Set A" }).click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Set B" }).click();
  await expect(page.getByText(/Looping \d:\d\d–\d:\d\d/)).toBeVisible();
  // The loop jumps back to A once the video reaches B.
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __yt: { truth(): number } }).__yt.truth()), { timeout: 5000 })
    .toBeLessThan(2);

  await page.locator("main").click({ position: { x: 5, y: 5 } });
  await page.keyboard.down("Shift");
  await page.keyboard.down("A");
  await expect(page.getByTestId("current-chord")).toHaveText("Am");
  await page.keyboard.up("A");
  await page.keyboard.up("Shift");

  await page.goto("/play-along");
  await expect(page.getByRole("button", { name: /Mock video/ })).toBeVisible();
});

test("chord book plays a chord and filters by name", async ({ page }) => {
  await page.goto("/chords");
  await page.getByPlaceholder(/Find a chord/).fill("Dm");
  const card = page.getByRole("button", { name: /^Dm, Minor/ });
  await expect(card).toBeVisible();
  await expect(page.getByRole("button", { name: /^C, Major/ })).toHaveCount(0);
  await card.click();
  await expect(page.getByRole("button", { name: "Start audio" }).first()).toBeHidden({ timeout: 30_000 });
});

test("practice room scores a chord played on beat one, and coaches a wrong one", async ({ page }) => {
  await page.goto("/play");
  await page.getByRole("button", { name: "Start audio" }).first().click();
  await page.locator("main").click({ position: { x: 5, y: 5 } });
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page.getByText("Listen to the backing chords")).toBeVisible();
  const card = (n: number) => page.locator("ol li").nth(n);
  // Pop: C G Am F. Press G from inside the page the moment its bar is highlighted,
  // so the test runner's polling delay doesn't count against the player.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const target = document.querySelectorAll("ol li")[1]!;
        const obs = new MutationObserver(() => {
          if (target.getAttribute("aria-current") !== "step") return;
          obs.disconnect();
          window.dispatchEvent(new KeyboardEvent("keydown", { key: "g", code: "KeyG" }));
          window.dispatchEvent(new KeyboardEvent("keyup", { key: "g", code: "KeyG" }));
          resolve();
        });
        obs.observe(target, { attributes: true });
      }),
  );
  await expect(page.getByText(/In the pocket/)).toBeVisible();
  await expect(page.getByText("1 well-timed bar", { exact: true })).toBeVisible();
  // A wrong chord gets a hint naming the right one.
  await expect(card(2)).toHaveAttribute("aria-current", "step", { timeout: 8000 });
  await page.keyboard.press("f");
  await expect(page.getByText("Next up: Am. Follow the highlighted chord.")).toBeVisible();
  await page.getByRole("button", { name: "Stop session" }).click();
});
