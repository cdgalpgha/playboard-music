import type { LoopRange, Segment, TransportLike } from "@/core/transport.ts";
import { SyncMap } from "@/core/sync-map.ts";
import { VideoClock } from "@/core/video-clock.ts";
import { PLAYER_STATE, type YouTubePlayer } from "@/video/youtube-api.ts";

const POLL_MS = 100;

/**
 * Practice time driven by an embedded YouTube player. Chart time is
 * syncMap.videoToChart(smoothed video time). Loops seek the video; wait-for-me
 * pauses it. τ equals chart time here (no loop shifting), and the loop pass
 * counter increases on each loop seek.
 */
export class VideoTransport implements TransportLike {
  readonly kind = "video" as const;
  readonly clock = new VideoClock();
  private map: SyncMap;
  private loopValue: LoopRange | null = null;
  private holdTau: number | null = null;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private pausedByHold = false;
  private pass = 0;
  private ownJumps = 0;
  private readonly timer: ReturnType<typeof setInterval>;
  readonly player: YouTubePlayer;

  constructor(player: YouTubePlayer, map: SyncMap) {
    this.player = player;
    this.map = map;
    this.poll();
    this.timer = setInterval(() => this.poll(), POLL_MS);
  }

  dispose(): void {
    clearInterval(this.timer);
    if (this.holdTimer) clearTimeout(this.holdTimer);
  }

  get syncMap(): SyncMap {
    return this.map;
  }

  /** Replacing the map moves every note; the session reschedules. */
  setSyncMap(map: SyncMap): void {
    this.map = map;
    this.ownJumps++;
  }

  get generation(): number {
    return this.clock.generation + this.ownJumps;
  }
  get rate(): number {
    return this.clock.rate;
  }
  get playing(): boolean {
    return this.clock.playing;
  }
  get loop(): LoopRange | null {
    return this.loopValue;
  }
  get holdPoint(): number | null {
    return this.holdTau;
  }
  get holding(): boolean {
    return this.holdTau !== null && (this.pausedByHold || this.tauAt() >= this.holdTau);
  }

  private poll(): void {
    const state = this.player.state();
    const playing = state === PLAYER_STATE.playing;
    this.clock.observe({ time: this.player.currentTime(), rate: this.player.rate(), playing }, performance.now());
    const loop = this.loopValue;
    if (loop && playing && this.position() >= loop.to) {
      this.pass++;
      this.player.seek(this.map.chartToVideo(loop.from));
      this.ownJumps++;
    }
  }

  tauAt(perf: number = performance.now()): number {
    const t = this.map.videoToChart(this.clock.time(perf));
    return this.holdTau !== null ? Math.min(t, this.holdTau) : t;
  }

  perfAt(tau: number): number {
    return this.clock.perfAt(this.map.chartToVideo(tau));
  }

  chartOf(tau: number): { chart: number; pass: number } {
    return { chart: tau, pass: this.pass };
  }

  position(perf?: number): number {
    return this.tauAt(perf);
  }

  tauOfChart(chart: number): number {
    return chart;
  }

  segments(tauFrom: number, tauTo: number): Segment[] {
    return tauTo > tauFrom ? [{ chartFrom: tauFrom, chartTo: tauTo, tauOffset: 0, pass: this.pass }] : [];
  }

  play(): void {
    this.player.play();
  }

  pause(): void {
    this.player.pause();
  }

  seek(chart: number): void {
    this.player.seek(this.map.chartToVideo(chart));
    this.ownJumps++;
  }

  /** YouTube offers fixed rates (0.25 to 2); the nearest is used. Pitch is kept. */
  setRate(rate: number): void {
    this.player.setRate(rate);
  }

  setLoop(loop: LoopRange | null): void {
    this.loopValue = loop && loop.to > loop.from ? loop : null;
    if (this.loopValue) {
      const p = this.position();
      if (p < this.loopValue.from || p >= this.loopValue.to) this.seek(this.loopValue.from);
    }
  }

  /** Pauses the video when it reaches τ (wait-for-me). */
  hold(tau: number): void {
    if (this.holdTau === tau) return;
    this.holdTau = tau;
    if (this.holdTimer) clearTimeout(this.holdTimer);
    const delay = this.perfAt(tau) - performance.now();
    const stop = () => {
      if (this.holdTau === null) return;
      this.pausedByHold = true;
      this.player.pause();
    };
    if (delay <= 0) stop();
    else this.holdTimer = setTimeout(stop, delay);
  }

  release(): void {
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = null;
    this.holdTau = null;
    if (this.pausedByHold) {
      this.pausedByHold = false;
      this.player.play();
    }
  }
}
