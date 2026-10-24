/**
 * Smooth video time from coarse player polls.
 *
 * YouTube's getCurrentTime() may return a value that only changes every few
 * hundred milliseconds, or one the API already interpolates. Between polls we
 * extrapolate with performance.now() and the playback rate. Each fresh poll
 * is compared with the prediction: large errors (seeks, buffering) snap, small
 * ones are slewed away a fraction at a time so motion stays smooth.
 * If the source turns out to be stale (repeated identical values while
 * playing), a changed value is taken to have happened halfway between the two
 * polls that bracket it, which removes the staleness bias on average.
 */

export interface VideoSample {
  time: number;
  rate: number;
  playing: boolean;
}

export interface VideoClockOptions {
  snapThreshold: number;
  slew: number;
}

export class VideoClock {
  private base = 0;
  private basePerf = 0;
  private rateValue = 1;
  private playingValue = false;
  private lastValue = NaN;
  private lastPollPerf = 0;
  private staleRun = 0;
  /** False once the source is seen repeating stale values while playing. */
  sourceInterpolates = true;
  /** Increments on every discontinuity (seek, state or rate change, large error). */
  generation = 0;

  private readonly opts: VideoClockOptions;

  constructor(opts: VideoClockOptions = { snapThreshold: 0.3, slew: 0.12 }) {
    this.opts = opts;
  }

  get rate(): number {
    return this.rateValue;
  }
  get playing(): boolean {
    return this.playingValue;
  }

  observe(sample: VideoSample, perf: number): void {
    const prevPoll = this.lastPollPerf;
    this.lastPollPerf = perf;
    const stateChanged = sample.playing !== this.playingValue || sample.rate !== this.rateValue;
    if (stateChanged || !sample.playing) {
      if (stateChanged || Math.abs(sample.time - this.base) > 1e-6) this.snap(sample.time, perf);
      this.playingValue = sample.playing;
      this.rateValue = sample.rate;
      this.lastValue = sample.time;
      this.staleRun = 0;
      return;
    }
    if (sample.time === this.lastValue) {
      if (++this.staleRun >= 2) this.sourceInterpolates = false;
      return;
    }
    // A fresh value. Estimate when it was true.
    const at = this.sourceInterpolates ? perf : (prevPoll + perf) / 2;
    this.staleRun = 0;
    this.lastValue = sample.time;
    const predicted = this.raw(at);
    const error = sample.time - predicted;
    if (Math.abs(error) > this.opts.snapThreshold) this.snap(sample.time, at);
    else {
      this.base = predicted + error * this.opts.slew;
      this.basePerf = at;
    }
  }

  private snap(time: number, perf: number): void {
    this.base = time;
    this.basePerf = perf;
    this.generation++;
  }

  private raw(perf: number): number {
    return this.playingValue ? this.base + ((perf - this.basePerf) / 1000) * this.rateValue : this.base;
  }

  /**
   * Video time at a wall-clock instant. Corrections can step it back by a few
   * milliseconds (well under a pixel of note motion); clamping that away would
   * bias the clock ahead.
   */
  time(perf: number): number {
    return this.raw(perf);
  }

  /** Wall-clock instant at which the video reaches `time`, assuming it keeps playing. */
  perfAt(time: number): number {
    return this.basePerf + ((time - this.base) / this.rateValue) * 1000;
  }
}
