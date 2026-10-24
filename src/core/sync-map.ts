/**
 * Maps video time to chart time for one song and one video.
 * Anchors pair a video second with a chart second; between anchors the map is
 * piecewise-linear, outside it extends the nearest segment's slope (slope 1
 * with a single anchor). `offsetMs` shifts the notes later (+) or earlier (−)
 * against the video.
 */

export interface SyncAnchor {
  videoSec: number;
  chartSec: number;
}

function interpolate(points: { x: number; y: number }[], x: number): number {
  if (points.length === 0) return x;
  if (points.length === 1) return points[0]!.y + (x - points[0]!.x);
  let i = 0;
  while (i < points.length - 2 && x > points[i + 1]!.x) i++;
  const a = points[i]!,
    b = points[i + 1]!;
  const slope = (b.y - a.y) / (b.x - a.x);
  return a.y + slope * (x - a.x);
}

export class SyncMap {
  readonly anchors: SyncAnchor[];
  readonly offsetMs: number;

  constructor(anchors: SyncAnchor[] = [], offsetMs = 0) {
    this.offsetMs = offsetMs;
    // Keep anchors strictly increasing on both axes so the map is invertible.
    const sorted = [...anchors].sort((a, b) => a.videoSec - b.videoSec);
    const clean: SyncAnchor[] = [];
    for (const a of sorted) {
      const last = clean.at(-1);
      if (!last || (a.videoSec > last.videoSec + 1e-3 && a.chartSec > last.chartSec + 1e-3)) clean.push(a);
    }
    this.anchors = clean;
  }

  videoToChart(videoSec: number): number {
    return interpolate(
      this.anchors.map((a) => ({ x: a.videoSec, y: a.chartSec })),
      videoSec - this.offsetMs / 1000,
    );
  }

  chartToVideo(chartSec: number): number {
    return (
      interpolate(
        this.anchors.map((a) => ({ x: a.chartSec, y: a.videoSec })),
        chartSec,
      ) +
      this.offsetMs / 1000
    );
  }

  /** Chart seconds per video second at a point (1 = same tempo as the chart). */
  slopeAt(videoSec: number): number {
    return this.videoToChart(videoSec + 0.5) - this.videoToChart(videoSec - 0.5);
  }

  withOffset(offsetMs: number): SyncMap {
    return new SyncMap(this.anchors, Math.max(-5000, Math.min(5000, Math.round(offsetMs))));
  }

  /** Marks that the chart time `chartSec` is heard at `videoSec` (one-tap "start here"). */
  withStart(videoSec: number, chartSec: number): SyncMap {
    if (this.anchors.length < 2) return new SyncMap([{ videoSec, chartSec }], 0);
    // Keep the fitted tempo; move the whole map so this point lines up.
    const shift = videoSec - this.chartToVideo(chartSec) + this.offsetMs / 1000;
    return new SyncMap(
      this.anchors.map((a) => ({ videoSec: a.videoSec + shift, chartSec: a.chartSec })),
      0,
    );
  }

  /**
   * Replaces the anchors inside the tapped span with a straight-line fit of
   * taps against consecutive chart beats. Returns null if the taps are unusable.
   */
  withTaps(tapVideoSecs: number[], beatChartSecs: number[]): SyncMap | null {
    const n = Math.min(tapVideoSecs.length, beatChartSecs.length);
    if (n < 4) return null;
    const xs = beatChartSecs.slice(0, n),
      ys = tapVideoSecs.slice(0, n);
    const mx = xs.reduce((a, b) => a + b, 0) / n,
      my = ys.reduce((a, b) => a + b, 0) / n;
    let sxx = 0,
      sxy = 0;
    for (let i = 0; i < n; i++) {
      sxx += (xs[i]! - mx) ** 2;
      sxy += (xs[i]! - mx) * (ys[i]! - my);
    }
    if (sxx <= 0) return null;
    const videoPerChart = sxy / sxx;
    if (videoPerChart < 0.33 || videoPerChart > 3) return null;
    const toVideo = (c: number) => my + videoPerChart * (c - mx);
    const from = xs[0]!,
      to = xs[n - 1]!;
    const kept = this.anchors.filter((a) => a.chartSec < from - 0.01 || a.chartSec > to + 0.01);
    // Taps include the player's own latency, which the device calibration handles; offset resets.
    return new SyncMap(
      [...kept, { videoSec: toVideo(from), chartSec: from }, { videoSec: toVideo(to), chartSec: to }],
      0,
    );
  }

  toJSON(): { anchors: SyncAnchor[]; offsetMs: number } {
    return { anchors: this.anchors, offsetMs: this.offsetMs };
  }
}
