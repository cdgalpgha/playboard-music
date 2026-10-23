import { engine } from "./engine.ts";

/** Schedules a short woodblock-like click at an exact context time. */
export function scheduleClick(when: number, accent: boolean, volume = 0.6): void {
  const ctx = engine.ctx,
    bus = engine.metronomeBus;
  if (!ctx || !bus) return;
  const osc = ctx.createOscillator();
  const band = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = accent ? 1760 : 1320;
  band.type = "bandpass";
  band.frequency.value = accent ? 1900 : 1400;
  band.Q.value = 3;
  const level = (accent ? 0.5 : 0.32) * volume;
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(level, when + 0.001);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
  osc.connect(band).connect(gain).connect(bus);
  osc.start(when);
  osc.stop(when + 0.05);
  osc.onended = () => {
    osc.disconnect();
    band.disconnect();
    gain.disconnect();
  };
}

/** Free-running metronome on the audio clock with a 120 ms look-ahead. */
export class Metronome {
  bpm = 90;
  beatsPerBar = 4;
  volume = 0.6;
  /** Called once per beat, close to when the click is heard. */
  onBeat: ((beat: number) => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private next = 0;
  private beat = 0;
  private visualTimers: ReturnType<typeof setTimeout>[] = [];

  get running(): boolean {
    return this.timer !== null;
  }

  start(): void {
    const ctx = engine.ctx;
    if (!ctx || this.timer) return;
    this.next = ctx.currentTime + 0.06;
    this.beat = 0;
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.visualTimers.forEach(clearTimeout);
    this.visualTimers = [];
  }

  setBpm(bpm: number): void {
    this.bpm = Math.max(20, Math.min(300, bpm));
  }

  private schedule(): void {
    const ctx = engine.ctx;
    if (!ctx) return;
    while (this.next < ctx.currentTime + 0.12) {
      const beat = this.beat;
      scheduleClick(this.next, beat % this.beatsPerBar === 0, this.volume);
      const delay = Math.max(0, engine.heardAt(this.next) - performance.now());
      this.visualTimers.push(setTimeout(() => this.onBeat?.(beat), delay));
      if (this.visualTimers.length > 16) this.visualTimers.shift();
      this.next += 60 / this.bpm;
      this.beat++;
    }
  }
}
