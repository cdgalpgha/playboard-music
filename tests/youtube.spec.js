import { test, expect } from "@playwright/test";
const id = "M7lc1UVf-VE";
const mockApi = `window.YT={Player:class{constructor(target,options){this.options=options;this.position=0;this.duration=240;this.state=5;this.videoId=options.videoId;this.volume=55;this.rate=1;const iframe=document.createElement('iframe');iframe.title='YouTube video player';iframe.src='about:blank';document.getElementById(target).replaceWith(iframe);window.mockPlayer=this;setTimeout(()=>options.events.onReady({target:this}),5)}setVolume(n){this.volume=n}getCurrentTime(){return this.position}getDuration(){return this.duration}getPlayerState(){return this.state}playVideo(){this.state=1;this.options.events.onStateChange({data:1})}pauseVideo(){this.state=2;this.options.events.onStateChange({data:2})}seekTo(t){this.position=t}getAvailablePlaybackRates(){return [.5,.75,1,1.25]}setPlaybackRate(n){this.rate=n}cueVideoById(id){this.videoId=id;this.state=5;this.position=0;this.options.events.onStateChange({data:5})}getVideoData(){return {title:'Test karaoke — Original Artist',author:'Karaoke Creator'}}}};window.onYouTubeIframeAPIReady();`;
async function fixture(page) {
  await page.route("https://www.youtube.com/iframe_api", (r) =>
    r.fulfill({ contentType: "application/javascript", body: mockApi }),
  );
  await page.route("https://noembed.com/embed?*", (r) =>
    r.fulfill({
      json: {
        title: "Test karaoke — Original Artist",
        author_name: "Karaoke Creator",
        author_url: "https://www.youtube.com/@karaokecreator",
      },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "YouTube sessions", exact: true })
    .click();
  await page
    .locator("#library-youtube-form-input")
    .fill("https://youtu.be/" + id);
  await page.getByRole("button", { name: "Open session", exact: true }).click();
  await expect(page.locator("#video-author")).toHaveText("Karaoke Creator");
  await expect.poll(() => page.evaluate(() => !!window.mockPlayer)).toBe(true);
}
test("YouTube adapter preserves uploader credit, player, seek, speed and loops", async ({
  page,
}) => {
  await fixture(page);
  await expect(page.locator("#video-title")).toHaveText(
    "Test karaoke — Original Artist",
  );
  await expect(page.locator("#video-author")).toHaveAttribute(
    "href",
    "https://www.youtube.com/@karaokecreator",
  );
  await expect(page.locator("#video-original")).toHaveAttribute(
    "href",
    "https://www.youtube.com/watch?v=" + id,
  );
  await expect(page.locator(".youtube-player-wrap iframe")).toBeVisible();
  await page.locator("#video-play").click();
  await expect(page.locator("#video-play")).toHaveAttribute(
    "aria-label",
    "Pause YouTube video",
  );
  await page.locator("#video-volume").evaluate((el) => {
    el.value = 25;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(await page.evaluate(() => window.mockPlayer.volume)).toBe(25);
  await page.locator("#video-speed").selectOption(".75");
  expect(await page.evaluate(() => window.mockPlayer.rate)).toBe(0.75);
  await page.evaluate(() => (window.mockPlayer.position = 10));
  await expect(page.locator("#video-time")).toContainText("0:10");
  await page.locator("#loop-a").click();
  await page.evaluate(() => (window.mockPlayer.position = 20));
  await expect(page.locator("#video-time")).toContainText("0:20");
  await page.locator("#loop-b").click();
  await expect(page.locator("#loop-status")).toContainText("Loop active");
  await page.evaluate(() => (window.mockPlayer.position = 21));
  await expect
    .poll(() => page.evaluate(() => window.mockPlayer.position))
    .toBe(10);
  await page.getByRole("button", { name: "Play studio", exact: true }).click();
  await expect(page.locator(".youtube-player-wrap iframe")).toBeVisible();
  await expect(page.locator("#video-author")).toHaveText("Karaoke Creator");
  await expect(page.locator("#piano")).toBeVisible();
  await page.locator("#dock-close").click();
  await expect(page.locator("#media-dock")).toBeHidden();
  await page.waitForTimeout(300);
  await expect(page.locator("#media-dock")).toBeHidden();
});
test("embed denial shows a useful fallback, history restores credit and bad URLs are rejected", async ({
  page,
}) => {
  await fixture(page);
  await page.evaluate(() =>
    window.mockPlayer.options.events.onError({ data: 150 }),
  );
  await expect(page.locator("#video-error")).toHaveText(
    "The uploader has disabled playback on other websites.",
  );
  await expect(page.locator("#video-original")).toBeVisible();
  await page.locator("#dock-close").click();
  await page
    .locator("#library-youtube-form-input")
    .fill("https://youtube.com.attacker.test/watch?v=" + id);
  await page.getByRole("button", { name: "Open session", exact: true }).click();
  await expect(page.locator("#toast")).toHaveText(
    "Paste a valid YouTube video link.",
  );
  await expect(page.locator("#media-dock")).toBeHidden();
  await page.reload();
  await page
    .getByRole("button", { name: "YouTube sessions", exact: true })
    .click();
  await expect(page.locator(".recent-video")).toContainText(
    "Uploaded by Karaoke Creator",
  );
});
test("metadata errors do not fabricate a creator and malicious metadata is plain text", async ({
  page,
}) => {
  await page.route("https://www.youtube.com/iframe_api", (r) =>
    r.fulfill({ contentType: "application/javascript", body: mockApi }),
  );
  await page.route("https://noembed.com/embed?*", (r) =>
    r.fulfill({
      json: {
        title: "<img src=x onerror=alert(1)>",
        author_name: "<script>evil</script>",
        author_url: "javascript:alert(1)",
      },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "YouTube sessions", exact: true })
    .click();
  await page
    .locator("#library-youtube-form-input")
    .fill("https://www.youtube.com/watch?v=" + id);
  await page.getByRole("button", { name: "Open session", exact: true }).click();
  await expect(page.locator("#video-title")).toHaveText(
    "<img src=x onerror=alert(1)>",
  );
  await expect(page.locator("#video-author")).not.toHaveAttribute("href");
  await expect(page.locator("#video-title img")).toHaveCount(0);
});
