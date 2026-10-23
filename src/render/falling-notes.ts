import { firstNoteAtOrAfter, type ChartNote } from "@/core/chart.ts";
import type { PracticeSession } from "@/practice/session.ts";
import type { Hand } from "@/core/chart.ts";
import { keyLayout, type KeyRect } from "./keyboard-geometry.ts";

export interface FallingNotesOptions {
  low: number;
  high: number;
  /** Chart seconds visible above the hit line. */
  secondsAhead: number;
  showFingers: boolean;
  reducedMotion: boolean;
}

const COLORS = {
  bg: "#141c18",
  laneBlack: "rgba(255,255,255,0.025)",
  octave: "rgba(255,255,255,0.07)",
  measure: "rgba(255,255,255,0.16)",
  beat: "rgba(255,255,255,0.05)",
  hitLine: "rgba(180,199,160,0.65)",
  R: "#6fc3a0",
  Rdeep: "#3f9c78",
  L: "#f0b45c",
  Ldeep: "#c98a2e",
  perfect: "#57d19a",
  good: "#9bd06a",
  early: "#f0c35c",
  late: "#f09a5c",
  miss: "#e06464",
  wrong: "#e06464",
  text: "rgba(255,255,255,0.85)",
};

const LABEL: Record<string, string> = {
  perfect: "Perfect",
  good: "Good",
  early: "Early",
  late: "Late",
  miss: "Miss",
  wrong: "Wrong note",
};

/** Draws falling notes on a canvas at the display refresh rate. */
export class FallingNotesRenderer {
  private readonly g: CanvasRenderingContext2D;
  private keys: KeyRect[] = [];
  private keyByNote = new Map<number, KeyRect>();
  private raf = 0;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private readonly observer: ResizeObserver;
  private readonly maxDuration: number;
  private frameDeltas: number[] = [];
  private drawTimes: number[] = [];
  private lastFrame = 0;
  private lastReport = 0;
  private expectedKey = "";
  onExpected: ((expected: Map<number, Hand>) => void) | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly session: PracticeSession,
    private opts: FallingNotesOptions,
  ) {
    const g = canvas.getContext("2d", { alpha: false });
    if (!g) throw new Error("Canvas 2D is not available.");
    this.g = g;
    this.maxDuration = Math.min(12, session.chart.notes.reduce((m, n) => Math.max(m, n.end - n.start), 0));
    this.setOptions(opts);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }

  setOptions(opts: FallingNotesOptions): void {
    this.opts = opts;
    this.keys = keyLayout(opts.low, opts.high);
    this.keyByNote = new Map(this.keys.map((k) => [k.note, k]));
  }

  start(): void {
    if (this.raf) return;
    const loop = (ts: number) => {
      this.raf = requestAnimationFrame(loop);
      this.trackFrame(ts);
      const t0 = performance.now();
      this.draw(t0);
      this.drawTimes.push(performance.now() - t0);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  dispose(): void {
    this.stop();
    this.observer.disconnect();
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.draw(performance.now());
  }

  private trackFrame(ts: number): void {
    if (this.lastFrame) this.frameDeltas.push(ts - this.lastFrame);
    this.lastFrame = ts;
    if (ts - this.lastReport < 1000 || this.frameDeltas.length < 10) return;
    const d = [...this.frameDeltas].sort((a, b) => a - b);
    const mean = d.reduce((a, b) => a + b, 0) / d.length;
    const draw = [...this.drawTimes].sort((a, b) => a - b);
    this.session.reportFps({
      p95DrawMs: draw[Math.floor(draw.length * 0.95)] ?? 0,
      mean: 1000 / mean,
      p95FrameMs: d[Math.floor(d.length * 0.95)]!,
      // A frame is dropped when its interval is more than 1.5× the median.
      dropped: d.filter((x) => x > d[d.length >> 1]! * 1.5).length,
      frames: d.length,
    });
    this.frameDeltas = [];
    this.drawTimes = [];
    this.lastReport = ts;
  }

  private draw(perf: number): void {
    const { g, width: w, height: h, dpr, opts, session } = this;
    const transport = session.transport;
    const state = session.state;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = COLORS.bg;
    g.fillRect(0, 0, w, h);

    // Lanes: shade black-key columns, mark each C.
    for (const k of this.keys) {
      if (k.black) {
        g.fillStyle = COLORS.laneBlack;
        g.fillRect(k.x * w, 0, k.w * w, h);
      } else if (k.note % 12 === 0) {
        g.fillStyle = COLORS.octave;
        g.fillRect(Math.round(k.x * w), 0, 1, h);
      }
    }

    const hitY = h - 1;
    const pps = h / opts.secondsAhead;
    const tau = transport.tauAt(perf);
    const { pass: currentPass } = transport.chartOf(tau);
    const yOf = (t: number) => hitY - (t - tau) * pps;
    const segments = transport.segments(tau - this.maxDuration - 0.1, tau + opts.secondsAhead + 0.1);
    const active = session.activeHands();
    const chart = session.chart;

    // Measure and beat lines.
    for (const seg of segments) {
      for (const b of chart.beats) {
        if (b.time < seg.chartFrom || b.time >= seg.chartTo) continue;
        const y = yOf(b.time + seg.tauOffset);
        if (y < 0 || y > hitY) continue;
        g.fillStyle = b.downbeat ? COLORS.measure : COLORS.beat;
        g.fillRect(0, Math.round(y), w, 1);
      }
      g.fillStyle = "rgba(255,255,255,0.35)";
      g.font = "600 10px 'DM Sans', sans-serif";
      for (const m of chart.measures) {
        if (m.start < seg.chartFrom || m.start >= seg.chartTo) continue;
        const y = yOf(m.start + seg.tauOffset);
        if (y > 12 && y < hitY) g.fillText(m.label, 4, y - 3);
      }
    }

    // Notes.
    const waiting = session.waitingGroup();
    const expected = new Map<number, Hand>();
    const lead = 0.06 * transport.rate;
    for (const seg of segments) {
      const notes = chart.notes;
      let i = firstNoteAtOrAfter(notes, seg.chartFrom - this.maxDuration);
      for (; i < notes.length; i++) {
        const n = notes[i]!;
        if (n.start >= seg.chartTo) break;
        if (n.end <= seg.chartFrom) continue;
        const start = n.start + seg.tauOffset,
          end = n.end + seg.tauOffset;
        const bottom = Math.min(hitY, yOf(start));
        const top = yOf(end);
        if (bottom < 0 || top > hitY) continue;
        const k = this.keyByNote.get(n.pitch);
        if (!k) continue;
        const isActive = active.has(n.hand);
        if (isActive && start <= tau + lead && end > tau) expected.set(n.pitch, n.hand);
        const result = seg.pass === currentPass ? session.resultFor(n.id) : undefined;
        const isWaiting = waiting !== null && Math.abs(waiting.time - n.start) < 0.031 && isActive && seg.pass === currentPass;
        if (isWaiting) expected.set(n.pitch, n.hand);
        this.drawNote(n, k, top, bottom, isActive, result, isWaiting, perf);
      }
    }
    if (this.onExpected) {
      const key = [...expected.entries()].map(([p, hand]) => p + hand).join(",");
      if (key !== this.expectedKey) {
        this.expectedKey = key;
        this.onExpected(expected);
      }
    }

    // Hit line.
    g.fillStyle = COLORS.hitLine;
    g.fillRect(0, hitY - 1, w, 2);

    this.drawFeedback(perf, hitY);

    if (state.status === "countin") {
      g.fillStyle = COLORS.text;
      g.font = "700 22px Manrope, sans-serif";
      g.textAlign = "center";
      g.fillText("Count-in…", w / 2, h * 0.4);
      g.textAlign = "start";
    } else if (state.status === "finished") {
      g.fillStyle = COLORS.text;
      g.font = "700 22px Manrope, sans-serif";
      g.textAlign = "center";
      g.fillText("Finished", w / 2, h * 0.4);
      g.textAlign = "start";
    } else if (waiting && transport.holding) {
      g.fillStyle = COLORS.text;
      g.font = "600 14px 'DM Sans', sans-serif";
      g.textAlign = "center";
      g.fillText("Waiting for you", w / 2, 24);
      g.textAlign = "start";
    }
  }

  private drawNote(
    n: ChartNote,
    k: KeyRect,
    top: number,
    bottom: number,
    active: boolean,
    result: string | undefined,
    waiting: boolean,
    perf: number,
  ): void {
    const { g, width: w, opts } = this;
    const pad = k.black ? 1 : 2;
    const x = k.x * w + pad;
    const width = Math.max(2, k.w * w - pad * 2);
    // A 2 px gap separates repeated notes on the same key.
    const height = Math.max(3, bottom - top - 2);
    const base = n.hand === "R" ? (k.black ? COLORS.Rdeep : COLORS.R) : k.black ? COLORS.Ldeep : COLORS.L;
    g.globalAlpha = active ? 1 : 0.32;
    if (result === "miss") g.globalAlpha = 0.35;
    g.fillStyle = result === "miss" ? COLORS.miss : base;
    g.beginPath();
    g.roundRect(x, top, width, height, Math.min(5, width / 3));
    g.fill();
    if (result && result !== "miss") {
      g.strokeStyle = COLORS[result as keyof typeof COLORS] ?? "#fff";
      g.lineWidth = 2;
      g.stroke();
    }
    if (waiting) {
      const pulse = opts.reducedMotion ? 1 : 0.6 + 0.4 * Math.sin(perf / 140);
      g.globalAlpha = pulse;
      g.strokeStyle = "#ffffff";
      g.lineWidth = 2;
      g.stroke();
    }
    g.globalAlpha = 1;
    if (opts.showFingers && n.finger && height > 16 && width > 9) {
      g.fillStyle = "rgba(20,28,24,0.85)";
      g.font = `700 ${Math.min(13, width * 0.8)}px 'DM Sans', sans-serif`;
      g.textAlign = "center";
      g.fillText(String(n.finger), x + width / 2, bottom - 5);
      g.textAlign = "start";
    }
  }

  private drawFeedback(perf: number, hitY: number): void {
    const { g, width: w, opts } = this;
    const life = opts.reducedMotion ? 700 : 450;
    for (const f of this.session.feedback) {
      const age = perf - f.at;
      if (age < 0 || age > life) continue;
      const k = this.keyByNote.get(f.pitch);
      if (!k) continue;
      const color = COLORS[f.judgement];
      const fade = opts.reducedMotion ? 1 : 1 - age / life;
      g.globalAlpha = fade;
      g.fillStyle = color;
      const cx = (k.x + k.w / 2) * w;
      if (!opts.reducedMotion) {
        const r = 10 + (age / life) * 16;
        g.beginPath();
        g.arc(cx, hitY, r, Math.PI, 0);
        g.fill();
      } else g.fillRect(k.x * w, hitY - 4, k.w * w, 4);
      g.font = "700 11px 'DM Sans', sans-serif";
      g.textAlign = "center";
      const rise = opts.reducedMotion ? 0 : (age / life) * 14;
      g.fillText(LABEL[f.judgement] ?? "", cx, hitY - 30 - rise);
      g.textAlign = "start";
    }
    g.globalAlpha = 1;
  }
}
