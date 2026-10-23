import { expect, test, type Page } from "@playwright/test";
import { installMockMidi } from "./fixtures/mock-midi.ts";
import { installMockYouTube } from "./fixtures/mock-youtube.ts";

type Win = {
  __yt: { truth(): number; seekTo(t: number): void; pauseVideo(): void; state: number; rate: number };
  __midi: { send(b: number[], ts?: number): void };
  __pb: {
    audioStore: { getState(): { progress: { playable: boolean } | null } };
    session: {
      videoMode: boolean;
      chart: { notes: { pitch: number; start: number; hand: string }[] };
      transport: { position(): number; perfAt(t: number): number };
      state: { status: string; live: { counts: Record<string, number> }; rate: number };
    };
  };
};

const w = (page: Page) => page.evaluate.bind(page);

async function setKey(page: Page) {
  await page.goto("/settings");
  await page.getByLabel("YouTube Data API key").fill("test-key-123");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
}

async function openPiece(page: Page) {
  await page.goto("/pieces/ode-to-joy");
  await page.getByRole("button", { name: "Start audio" }).first().click();
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__pb.audioStore.getState().progress?.playable)).toBe(true);
  await page.getByRole("button", { name: "Play along with a YouTube video" }).click();
}

test("search, choose the official upload, and the notes follow the video", async ({ page }) => {
  const { searches } = await installMockYouTube(page);
  await installMockMidi(page);
  await setKey(page);
  await openPiece(page);

  await expect(page.getByLabel("Search YouTube")).toHaveValue("Ludwig van Beethoven Ode to Joy official");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const results = page.getByRole("list", { name: "Search results" }).getByRole("button");
  await expect(results).toHaveCount(3);
  // The official Topic channel ranks first in Original mode; entities are decoded.
  await expect(results.first()).toContainText('Symphony No. 9: "Ode to Joy"');
  await expect(results.first()).toContainText("Official channel");
  const q = searches[0]!.searchParams;
  expect(q.get("videoEmbeddable")).toBe("true");
  expect(q.get("videoSyndicated")).toBe("true");
  expect(q.get("type")).toBe("video");
  expect(q.get("key")).toBe("test-key-123");

  await results.first().click();
  await expect(page.locator("iframe[title='YouTube video player']")).toBeVisible();
  const credit = page.getByTestId("view-credit");
  await expect(credit).toContainText("Your view counts for Ludwig van Beethoven - Topic");
  await expect(credit).toContainText("official upload");
  await expect(page.getByText("Synced to the video")).toBeVisible();
  await expect.poll(() => w(page)(() => (window as unknown as Win).__pb.session.videoMode)).toBe(true);

  // Play from the app: the video starts and chart time tracks it closely despite 250 ms stale polls.
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(2500);
  const drift = await w(page)(() => {
    const x = window as unknown as Win;
    return Math.abs(x.__pb.session.transport.position() - x.__yt.truth());
  });
  expect(drift).toBeLessThan(0.06);

  // Seeking in the video moves the notes.
  await w(page)(() => (window as unknown as Win).__yt.seekTo(20));
  await page.waitForTimeout(600);
  const afterSeek = await w(page)(() => (window as unknown as Win).__pb.session.transport.position());
  expect(afterSeek).toBeGreaterThan(20.2);
  expect(afterSeek).toBeLessThan(21.5);

  // Offset: notes 100 ms later than the video.
  const before = await w(page)(() => {
    const x = window as unknown as Win;
    return x.__yt.truth() - x.__pb.session.transport.position();
  });
  await page.getByRole("button", { name: "Notes 100 ms later" }).click();
  await expect(page.getByText(/notes 100 ms later than the video/)).toBeVisible();
  await page.waitForTimeout(300);
  const after = await w(page)(() => {
    const x = window as unknown as Win;
    return x.__yt.truth() - x.__pb.session.transport.position();
  });
  expect(after - before).toBeGreaterThan(0.07);
  expect(after - before).toBeLessThan(0.13);

  // Pausing with YouTube's own controls pauses the session.
  await w(page)(() => (window as unknown as Win).__yt.pauseVideo());
  await expect.poll(() => w(page)(() => (window as unknown as Win).__pb.session.state.status)).toBe("paused");

  // Tempo snaps to the rates YouTube offers.
  await page.getByLabel("Practice tempo").fill("0.6");
  await expect.poll(() => w(page)(() => (window as unknown as Win).__yt.rate)).toBe(0.5);
});

test("mark the first note, then score against the video's clock", async ({ page }) => {
  await installMockYouTube(page);
  await installMockMidi(page);
  await setKey(page);
  await openPiece(page);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("list", { name: "Search results" }).getByRole("button").first().click();
  await expect(page.getByText("Synced to the video")).toBeVisible();
  // The music in the video starts 3 s in.
  await w(page)(() => (window as unknown as Win).__yt.seekTo(2.6));
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => w(page)(() => (window as unknown as Win).__yt.truth()), { timeout: 5000 }).toBeGreaterThan(3);
  await page.getByRole("button", { name: "First note now" }).click();
  await expect(page.getByText(/First note set at 3\.\d+ s/)).toBeVisible();
  const position = await w(page)(() => (window as unknown as Win).__pb.session.transport.position());
  expect(position).toBeGreaterThan(-0.05);
  expect(position).toBeLessThan(0.4);
  // Play the second right-hand note exactly when the video says it is due.
  await page.evaluate(() => {
    const x = window as unknown as Win;
    const s = x.__pb.session;
    const n = s.chart.notes.filter((v) => v.hand === "R")[2]!;
    x.__midi.send([0x90, n.pitch, 80], s.transport.perfAt(n.start) + 10);
  });
  await expect.poll(() => w(page)(() => (window as unknown as Win).__pb.session.state.live.counts.perfect)).toBe(1);
});

test("without an API key a pasted link still works and the view credit says what is known", async ({ page }) => {
  await installMockYouTube(page);
  await openPiece(page);
  await expect(page.getByText(/add a YouTube Data API key in/)).toBeVisible();
  await page.getByRole("radio", { name: "Karaoke" }).click();
  await page.getByLabel("YouTube link").fill("https://youtu.be/KaraokeAAAA");
  await page.getByRole("button", { name: "Use link" }).click();
  await expect(page.locator("iframe[title='YouTube video player']")).toBeVisible();
  const credit = page.getByTestId("view-credit");
  await expect(credit).toContainText("Your view counts for Mock Channel");
  await expect(credit).toContainText("cannot tell whether this channel is the artist's own");
});

test("karaoke mode searches for karaoke uploads and ranks them first", async ({ page }) => {
  const { searches } = await installMockYouTube(page);
  await setKey(page);
  await openPiece(page);
  await page.getByRole("radio", { name: "Karaoke" }).click();
  await expect(page.getByLabel("Search YouTube")).toHaveValue("Ode to Joy Ludwig van Beethoven karaoke");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const first = page.getByRole("list", { name: "Search results" }).getByRole("button").first();
  await expect(first).toContainText("Karaoke Version");
  expect(searches[0]!.searchParams.get("q")).toBe("Ode to Joy Ludwig van Beethoven karaoke");
  await first.click();
  await expect(page.getByTestId("view-credit")).toContainText("the uploader gets the view, not the original artist");
});
