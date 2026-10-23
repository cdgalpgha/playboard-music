export function videoId(input) {
  try {
    const u = new URL(input.trim());
    if (!["https:", "http:"].includes(u.protocol)) return null;
    const host = u.hostname.toLowerCase();
    let id;
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    else if (
      [
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
        "www.youtube-nocookie.com",
      ].includes(host)
    ) {
      const p = u.pathname.split("/").filter(Boolean);
      id = ["shorts", "embed", "live"].includes(p[0])
        ? p[1]
        : u.searchParams.get("v");
    }
    return /^[\w-]{11}$/.test(id || "") ? id : null;
  } catch {
    return null;
  }
}
const safeChannel = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" &&
      ["www.youtube.com", "youtube.com"].includes(u.hostname)
      ? u.href
      : null;
  } catch {
    return null;
  }
};
let apiPromise;
function api() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    const timeout = setTimeout(() => {
      apiPromise = null;
      reject(
        Error(
          "YouTube could not connect. Check your connection or open the video on YouTube.",
        ),
      );
    }, 14000);
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timeout);
      resolve(window.YT);
    };
    script.onerror = () => {
      clearTimeout(timeout);
      apiPromise = null;
      script.remove();
      reject(Error("YouTube is unavailable on this network."));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}
export class YouTubeSession extends EventTarget {
  constructor() {
    super();
    this.id = null;
    this.title = "Your next session starts here";
    this.author = "";
    this.authorUrl = null;
    this.status = "idle";
    this.error = "";
    this.position = 0;
    this.duration = 0;
    this.volume = 55;
    this.rate = 1;
    this.loopA = null;
    this.loopB = null;
    this.playing = false;
    this.generation = 0;
    this.history = [];
    try {
      this.history = JSON.parse(
        localStorage.getItem("playboard-youtube") || "[]",
      )
        .filter((x) => /^[\w-]{11}$/.test(x.id))
        .slice(0, 12);
    } catch {}
    this.timer = setInterval(() => this.tick(), 200);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.player?.pauseVideo?.();
    });
  }
  emit() {
    this.dispatchEvent(new Event("change"));
  }
  async load(url) {
    const id = videoId(url);
    if (!id)
      throw Error(
        "Paste a valid YouTube watch, share, Shorts, or live-video URL.",
      );
    const generation = ++this.generation;
    this.id = id;
    this.title = "Loading video…";
    this.author = "";
    this.authorUrl = null;
    this.error = "";
    this.status = "loading";
    this.loopA = null;
    this.loopB = null;
    this.position = 0;
    this.rate = 1;
    this.playing = false;
    this.emit();
    this.metadata(id, generation);
    try {
      const YT = await api();
      if (generation !== this.generation) return;
      if (this.player) {
        this.player.cueVideoById(id);
        return;
      }
      this.player = new YT.Player("youtube-frame", {
        host: "https://www.youtube-nocookie.com",
        width: "100%",
        height: "100%",
        videoId: id,
        playerVars: {
          playsinline: 1,
          controls: 1,
          rel: 0,
          enablejsapi: 1,
          origin: location.origin,
        },
        events: {
          onReady: () => {
            if (generation !== this.generation)
              this.player.cueVideoById(this.id);
            this.player.setVolume(this.volume);
            this.status = "ready";
            this.emit();
          },
          onStateChange: (e) => {
            this.playing = e.data === 1;
            if ([1, 2, 5].includes(e.data)) {
              this.status = "ready";
              this.error = "";
              const d = this.player.getVideoData?.();
              if (d?.title && !this.author) this.title = d.title;
              if (d?.author && !this.author) this.author = d.author;
            }
            this.emit();
          },
          onError: (e) => {
            this.playing = false;
            this.status = "error";
            this.error =
              {
                2: "The video ID is invalid.",
                5: "YouTube cannot play this video in this browser.",
                100: "This video was removed or is private.",
                101: "The uploader has disabled playback on other websites.",
                150: "The uploader has disabled playback on other websites.",
                153: "YouTube could not identify this website. Open the video on YouTube instead.",
              }[e.data] || "This video cannot be played here.";
            this.emit();
          },
        },
      });
    } catch (error) {
      if (generation !== this.generation) return;
      this.status = "error";
      this.error = error.message;
      this.emit();
    }
  }
  async metadata(id, generation) {
    try {
      const response = await fetch(
        `https://noembed.com/embed?url=${encodeURIComponent("https://www.youtube.com/watch?v=" + id)}`,
        { signal: AbortSignal.timeout(10000) },
      );
      if (!response.ok) throw Error();
      const d = await response.json();
      if (generation !== this.generation) return;
      if (d.error || !d.title || !d.author_name) throw Error();
      this.title = String(d.title);
      this.author = String(d.author_name);
      this.authorUrl = safeChannel(d.author_url);
      this.remember();
      this.emit();
    } catch {
      if (generation === this.generation) {
        if (this.title === "Loading video…") this.title = "YouTube video";
        this.emit();
      }
    }
  }
  remember() {
    if (!this.author) return;
    this.history = [
      {
        id: this.id,
        title: this.title,
        author: this.author,
        authorUrl: this.authorUrl,
      },
      ...this.history.filter((x) => x.id !== this.id),
    ].slice(0, 12);
    try {
      localStorage.setItem("playboard-youtube", JSON.stringify(this.history));
    } catch {}
  }
  tick() {
    if (!this.player?.getCurrentTime) return;
    try {
      this.position = this.player.getCurrentTime() || 0;
      this.duration = this.player.getDuration() || 0;
      if (
        this.playing &&
        this.loopA !== null &&
        this.loopB !== null &&
        this.position >= this.loopB
      )
        this.player.seekTo(this.loopA, true);
      if (this.status === "loading" && this.player.getPlayerState?.() === 5)
        this.status = "ready";
      this.dispatchEvent(new Event("time"));
    } catch {}
  }
  toggle() {
    if (!this.player?.playVideo)
      throw Error("Load a video and wait for the player to connect.");
    if (this.playing) this.player.pauseVideo();
    else this.player.playVideo();
  }
  seek(t) {
    this.player?.seekTo?.(Math.max(0, t), true);
  }
  setVolume(n) {
    this.volume = n;
    this.player?.setVolume?.(n);
  }
  setRate(n) {
    const available = this.player?.getAvailablePlaybackRates?.() || [1];
    if (!available.includes(n))
      throw Error("This playback speed is unavailable for this video.");
    this.player.setPlaybackRate(n);
    this.rate = n;
    this.emit();
  }
  setA() {
    this.loopA = this.position;
    this.loopB = null;
    this.emit();
  }
  setB() {
    if (this.loopA === null || this.position <= this.loopA + 0.5)
      throw Error("Set A first, then set B at least half a second later.");
    this.loopB = this.position;
    this.emit();
  }
  clearLoop() {
    this.loopA = null;
    this.loopB = null;
    this.emit();
  }
  close() {
    this.player?.pauseVideo?.();
    this.playing = false;
    this.emit();
  }
}
