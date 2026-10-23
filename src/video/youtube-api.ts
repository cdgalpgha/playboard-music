/**
 * YouTube IFrame Player API. The standard embedded player is always visible
 * with YouTube's own controls; nothing here reads, records or separates the
 * video's media (hard rule 1). We only call the documented player methods.
 */

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setPlaybackRate(rate: number): void;
  getPlaybackRate(): number;
  getAvailablePlaybackRates(): number[];
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getVideoData?(): { title?: string; author?: string; video_id?: string };
  setVolume(v: number): void;
  cueVideoById(id: string): void;
  loadVideoById(id: string): void;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    el: HTMLElement | string,
    opts: {
      width?: string | number;
      height?: string | number;
      videoId: string;
      host?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: YTPlayer }) => void;
        onStateChange?: (e: { data: number }) => void;
        onError?: (e: { data: number }) => void;
        onPlaybackRateChange?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export const PLAYER_STATE = { unstarted: -1, ended: 0, playing: 1, paused: 2, buffering: 3, cued: 5 } as const;

export const ERROR_MESSAGES: Record<number, string> = {
  2: "The video ID is invalid.",
  5: "YouTube cannot play this video in this browser.",
  100: "This video was removed or is private.",
  101: "The uploader does not allow this video to be played on other websites.",
  150: "The uploader does not allow this video to be played on other websites.",
  153: "YouTube could not identify this website. Open the video on YouTube instead.",
};

/** Extracts an 11-character video id from a watch, share, Shorts, live or embed URL. */
export function videoIdFrom(input: string): string | null {
  const text = input.trim();
  if (/^[\w-]{11}$/.test(text)) return text;
  try {
    const u = new URL(text);
    if (!["https:", "http:"].includes(u.protocol)) return null;
    const host = u.hostname.toLowerCase();
    let id: string | null | undefined;
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    else if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "www.youtube-nocookie.com"].includes(host)) {
      const parts = u.pathname.split("/").filter(Boolean);
      id = ["shorts", "embed", "live", "v"].includes(parts[0] ?? "") ? parts[1] : u.searchParams.get("v");
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

export function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise<YTNamespace>((resolve, reject) => {
    const timeout = setTimeout(() => {
      apiPromise = null;
      reject(new Error("YouTube did not respond. Check your connection, or open the video on YouTube."));
    }, 15000);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      clearTimeout(timeout);
      resolve(window.YT!);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      clearTimeout(timeout);
      apiPromise = null;
      script.remove();
      reject(new Error("YouTube is unavailable on this network."));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}

export interface PlayerCallbacks {
  onReady?: () => void;
  onState?: (state: number) => void;
  onError?: (message: string, code: number) => void;
}

/** One embedded YouTube player in `container`. */
export class YouTubePlayer {
  private player: YTPlayer | null = null;
  private ready = false;
  videoId: string;

  private constructor(videoId: string) {
    this.videoId = videoId;
  }

  static async create(container: HTMLElement, videoId: string, cb: PlayerCallbacks = {}): Promise<YouTubePlayer> {
    const YT = await loadYouTubeApi();
    const wrapper = new YouTubePlayer(videoId);
    const target = document.createElement("div");
    container.replaceChildren(target);
    await new Promise<void>((resolve) => {
      wrapper.player = new YT.Player(target, {
        width: "100%",
        height: "100%",
        videoId,
        playerVars: { playsinline: 1, controls: 1, rel: 0, enablejsapi: 1, origin: location.origin },
        events: {
          onReady: () => {
            wrapper.ready = true;
            cb.onReady?.();
            resolve();
          },
          onStateChange: (e) => cb.onState?.(e.data),
          onError: (e) => {
            cb.onError?.(ERROR_MESSAGES[e.data] ?? "This video cannot be played here.", e.data);
            resolve();
          },
        },
      });
    });
    return wrapper;
  }

  get isReady(): boolean {
    return this.ready;
  }

  play(): void {
    this.player?.playVideo();
  }
  pause(): void {
    this.player?.pauseVideo();
  }
  seek(seconds: number): void {
    this.player?.seekTo(Math.max(0, seconds), true);
  }
  currentTime(): number {
    return this.player?.getCurrentTime?.() ?? 0;
  }
  duration(): number {
    return this.player?.getDuration?.() ?? 0;
  }
  state(): number {
    return this.player?.getPlayerState?.() ?? PLAYER_STATE.unstarted;
  }
  rate(): number {
    return this.player?.getPlaybackRate?.() ?? 1;
  }
  availableRates(): number[] {
    return this.player?.getAvailablePlaybackRates?.() ?? [1];
  }
  /** Sets the nearest rate YouTube offers; returns it. YouTube keeps pitch when slowing down. */
  setRate(rate: number): number {
    const rates = this.availableRates();
    const nearest = rates.reduce((a, b) => (Math.abs(b - rate) < Math.abs(a - rate) ? b : a), 1);
    this.player?.setPlaybackRate(nearest);
    return nearest;
  }
  setVolume(volume: number): void {
    this.player?.setVolume(Math.round(volume * 100));
  }
  videoData(): { title: string; author: string } {
    const d = this.player?.getVideoData?.() ?? {};
    return { title: d.title ?? "", author: d.author ?? "" };
  }
  load(videoId: string): void {
    this.videoId = videoId;
    this.player?.cueVideoById(videoId);
  }
  destroy(): void {
    try {
      this.player?.destroy();
    } catch {
      /* already gone */
    }
    this.player = null;
  }
}
