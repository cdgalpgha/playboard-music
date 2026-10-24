import type { Page } from "@playwright/test";

/**
 * A stand-in for the YouTube IFrame API. Time advances with performance.now()
 * and the playback rate; getCurrentTime() refreshes only every 250 ms, like a
 * stale postMessage bridge, so the app's clock smoothing is exercised.
 * `window.__yt` is the player; `__yt.truth()` is the exact video time.
 */
const MOCK_API = `
(() => {
  class Player {
    constructor(el, opts) {
      this.opts = opts; this.rate = 1; this.state = 5; this.base = 0; this.basePerf = performance.now();
      this.lastReport = -1e9; this.reported = 0;
      const iframe = document.createElement("iframe");
      iframe.title = "YouTube video player"; iframe.src = "about:blank";
      iframe.style.width = "100%"; iframe.style.height = "100%"; iframe.style.border = "0";
      (typeof el === "string" ? document.getElementById(el) : el).replaceWith(iframe);
      this.iframe = iframe; window.__yt = this;
      setTimeout(() => opts.events && opts.events.onReady && opts.events.onReady({ target: this }), 20);
    }
    truth() { return this.state === 1 ? this.base + (performance.now() - this.basePerf) / 1000 * this.rate : this.base; }
    getCurrentTime() {
      const now = performance.now();
      if (this.state !== 1 || now - this.lastReport >= 250) { this.reported = this.truth(); this.lastReport = now; }
      return this.reported;
    }
    rebase() { this.base = this.truth(); this.basePerf = performance.now(); }
    playVideo() { this.rebase(); this.state = 1; this.lastReport = -1e9; this.emit(1); }
    pauseVideo() { this.rebase(); this.state = 2; this.emit(2); }
    seekTo(t) { this.base = t; this.basePerf = performance.now(); this.lastReport = -1e9; }
    setPlaybackRate(r) { this.rebase(); this.rate = r; }
    getPlaybackRate() { return this.rate; }
    getAvailablePlaybackRates() { return [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]; }
    getPlayerState() { return this.state; }
    getDuration() { return 180; }
    getVideoData() { return { title: "Mock video", author: "Mock Channel", video_id: this.opts.videoId }; }
    setVolume() {}
    cueVideoById() {}
    loadVideoById() {}
    destroy() { this.iframe.remove(); }
    emit(s) { this.opts.events && this.opts.events.onStateChange && this.opts.events.onStateChange({ data: s }); }
  }
  window.YT = { Player };
  window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady();
})();
`;

export const SEARCH_FIXTURE = {
  items: [
    {
      id: { videoId: "KaraokeAAAA" },
      snippet: { title: "Ode to Joy (Karaoke Version) &amp; Lyrics", channelTitle: "Sing Along Studio", channelId: "c-karaoke" },
    },
    {
      id: { videoId: "OfficialBBB" },
      snippet: { title: "Symphony No. 9: &quot;Ode to Joy&quot;", channelTitle: "Ludwig van Beethoven - Topic", channelId: "c-topic" },
    },
    {
      id: { videoId: "FanUploadCC" },
      snippet: { title: "Ode to Joy piano cover", channelTitle: "Somebody's Piano", channelId: "c-fan" },
    },
  ],
};

export async function installMockYouTube(page: Page): Promise<{ searches: URL[] }> {
  const searches: URL[] = [];
  await page.route("https://www.youtube.com/iframe_api", (r) => r.fulfill({ contentType: "application/javascript", body: MOCK_API }));
  await page.route("https://www.googleapis.com/youtube/v3/search?*", (r) => {
    searches.push(new URL(r.request().url()));
    return r.fulfill({ json: SEARCH_FIXTURE });
  });
  await page.route("https://www.googleapis.com/youtube/v3/videos?*", (r) =>
    r.fulfill({
      json: { items: SEARCH_FIXTURE.items.map((i, n) => ({ id: i.id.videoId, contentDetails: { duration: `PT${3 + n}M0${n}S` } })) },
    }),
  );
  await page.route("https://i.ytimg.com/**", (r) => r.fulfill({ status: 204, body: "" }));
  return { searches };
}
