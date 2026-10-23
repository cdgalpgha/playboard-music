/**
 * Practice clock. Time runs on a monotonic axis τ ("transport seconds") that
 * advances `rate` chart-seconds per real second. Without a loop, chart time
 * equals τ. With a loop [from, to), every pass after the first is shifted by a
 * whole loop length: τ = chart + k·L for pass k ≥ 1.
 *
 * Wall time is performance.now() milliseconds of the moment something is
 * heard or seen; the audio engine converts it to context time for scheduling.
 */

export interface LoopRange {
  from: number;
  to: number;
}

export interface Segment {
  chartFrom: number;
  chartTo: number;
  /** τ = chart + tauOffset inside this segment. */
  tauOffset: number;
  pass: number;
}

export class Transport {
  private rateValue = 1;
  private playingValue = false;
  private anchorPerf = 0;
  private anchorTau = 0;
  private loopValue: LoopRange | null = null;
  private holdTau: number | null = null;

  constructor(private readonly now: () => number = () => performance.now()) {}

  get rate(): number {
    return this.rateValue;
  }
  get playing(): boolean {
    return this.playingValue;
  }
  get loop(): LoopRange | null {
    return this.loopValue;
  }
  get holding(): boolean {
    return this.holdTau !== null && this.tauAt() >= this.holdTau;
  }

  /** τ at a wall-clock instant. */
  tauAt(perf: number = this.now()): number {
    if (!this.playingValue) return this.anchorTau;
    const t = this.anchorTau + ((perf - this.anchorPerf) / 1000) * this.rateValue;
    return this.holdTau !== null ? Math.min(t, this.holdTau) : t;
  }

  /** Wall-clock instant at which τ occurs (assumes continuous play). */
  perfAt(tau: number): number {
    return this.anchorPerf + ((tau - this.anchorTau) / this.rateValue) * 1000;
  }

  chartOf(tau: number): { chart: number; pass: number } {
    const loop = this.loopValue;
    if (!loop || tau < loop.to) return { chart: tau, pass: 0 };
    const length = loop.to - loop.from;
    const pass = Math.floor((tau - loop.to) / length) + 1;
    return { chart: tau - pass * length, pass };
  }

  /** Chart time now (or at `perf`). */
  position(perf?: number): number {
    return this.chartOf(this.tauAt(perf)).chart;
  }

  tauOfChart(chart: number, pass: number): number {
    return pass === 0 || !this.loopValue ? chart : chart + pass * (this.loopValue.to - this.loopValue.from);
  }

  play(): void {
    if (this.playingValue) return;
    this.anchorPerf = this.now();
    this.playingValue = true;
  }

  pause(): void {
    if (!this.playingValue) return;
    this.anchorTau = this.tauAt();
    this.playingValue = false;
  }

  /** Jumps to a chart time; the loop pass counter restarts. */
  seek(chart: number): void {
    this.anchorTau = chart;
    this.anchorPerf = this.now();
    this.holdTau = null;
  }

  setRate(rate: number): void {
    const tau = this.tauAt();
    this.anchorTau = tau;
    this.anchorPerf = this.now();
    this.rateValue = Math.max(0.1, Math.min(2, rate));
  }

  /** Sets or clears the loop; the position is re-expressed so play continues smoothly. */
  setLoop(loop: LoopRange | null): void {
    const chart = this.position();
    this.loopValue = loop && loop.to > loop.from ? loop : null;
    this.seek(this.loopValue && (chart < this.loopValue.from || chart >= this.loopValue.to) ? this.loopValue.from : chart);
  }

  /** Stops time at τ (wait-for-me) until `release()`. */
  hold(tau: number): void {
    this.holdTau = tau;
  }

  release(): void {
    if (this.holdTau === null) return;
    const tau = this.tauAt();
    this.holdTau = null;
    this.anchorTau = tau;
    this.anchorPerf = this.now();
  }

  get holdPoint(): number | null {
    return this.holdTau;
  }

  /** Chart-time pieces covering [tauFrom, tauTo), split at loop wraps. */
  segments(tauFrom: number, tauTo: number): Segment[] {
    const out: Segment[] = [];
    const loop = this.loopValue;
    if (tauTo <= tauFrom) return out;
    if (!loop) return [{ chartFrom: tauFrom, chartTo: tauTo, tauOffset: 0, pass: 0 }];
    let tau = tauFrom;
    while (tau < tauTo && out.length < 64) {
      const { chart, pass } = this.chartOf(tau);
      const offset = tau - chart;
      // Each pass ends where chart time reaches loop.to; the next pass starts there.
      const end = Math.min(tauTo, loop.to + offset);
      out.push({ chartFrom: chart, chartTo: end - offset, tauOffset: offset, pass });
      tau = end;
    }
    return out;
  }
}
