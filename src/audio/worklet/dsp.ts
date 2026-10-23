/**
 * Sampler DSP. Pure TypeScript with no AudioWorklet globals so the same code
 * runs in the worklet, in unit tests and in the benchmark.
 */
import {
  DEFAULT_PARAMS,
  type SamplerLayout,
  type SamplerParams,
  type ToWorklet,
  type NoteZoneInfo,
} from "./protocol.ts";

const INT16_SCALE = 1 / 32768;
/** Keys from F6 (MIDI 89) up have no dampers (Salamander SFZ "notes without dampers"). */
export const FIRST_UNDAMPED_KEY = 89;
const MAX_NOTE_VOICES = 96;
const NOTE_POOL = 128;
const AUX_POOL = 48;
const SILENT = 1e-4;

interface Pcm {
  left: Int16Array;
  right: Int16Array;
  mono: boolean;
}

class Voice {
  active = false;
  note = 0;
  velocity = 0;
  pcm: Pcm | null = null;
  pos = 0;
  step = 1;
  gain = 0;
  env = 1;
  decay = 1;
  releasing = false;
  /** Fading out because it was stolen or re-struck; not counted as polyphony. */
  dying = false;
  /** Damper has fallen (key up with pedal up). */
  damped = false;
  startFrame = 0;
}

interface QueuedEvent {
  frame: number;
  seq: number;
  msg: ToWorklet;
}

/** Converts a velocity-to-dB curve through the measured layer levels of one zone root. */
export function layerTargetDb(
  layers: Pick<NoteZoneInfo, "lovel" | "hivel" | "rmsDb">[],
  velocity: number,
): number {
  const pts = layers
    .map((l) => ({ v: (l.lovel + l.hivel) / 2, db: l.rmsDb }))
    .sort((a, b) => a.v - b.v);
  const first = pts[0];
  if (!first) return 0;
  if (pts.length === 1) return first.db + 30 * Math.log10(velocity / first.v);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!,
      b = pts[i + 1]!;
    if (velocity <= b.v || i === pts.length - 2) {
      const slope = (b.db - a.db) / (b.v - a.v);
      // Below the first centre, extrapolate the first segment's slope.
      return a.db + slope * (velocity - a.v);
    }
  }
  return first.db;
}

/** Extra velocity attenuation, in the spirit of SFZ amp_veltrack. 1 at velocity 127. */
export function velocityCurve(velocity: number, dynamics: number): number {
  const v = Math.max(1, Math.min(127, velocity)) / 127;
  return 1 - dynamics + dynamics * v * v;
}

/** Damper decay time constant in seconds: slower in the bass. */
export function damperTau(note: number): number {
  return 0.22 * Math.pow(2, -(note - 21) / 30) + 0.025;
}

/**
 * Sympathetic resonance: damped comb filters tuned C2..B3. Each comb rings at
 * its fundamental and harmonics, like an undamped string.
 */
export class ResonanceBank {
  private readonly lines: Float32Array[] = [];
  private readonly idx: Int32Array;
  private readonly lp: Float32Array;
  private readonly fbDown: Float32Array;
  private readonly fbUp: Float32Array;
  private readonly fb: Float32Array;
  private level = 0;

  constructor(sampleRate: number) {
    const count = 24;
    this.idx = new Int32Array(count);
    this.lp = new Float32Array(count);
    this.fbDown = new Float32Array(count);
    this.fbUp = new Float32Array(count);
    this.fb = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const freq = 440 * Math.pow(2, (36 + i - 69) / 12);
      const length = Math.max(2, Math.round(sampleRate / freq));
      this.lines.push(new Float32Array(length));
      // Feedback for a target T60: 4 s with the pedal down, 0.12 s when damped.
      this.fbDown[i] = Math.pow(10, -3 / (4 * freq));
      this.fbUp[i] = Math.pow(10, -3 / (0.12 * freq));
      this.fb[i] = this.fbUp[i]!;
    }
  }

  /** Mixes resonance into out arrays. `input` is the dry mono voice mix. */
  process(
    input: Float32Array,
    outL: Float32Array,
    outR: Float32Array,
    from: number,
    to: number,
    pedalDown: boolean,
    amount: number,
  ): void {
    const target = pedalDown ? amount : 0;
    // Smooth the send over ~20 ms worth of blocks.
    this.level += (target - this.level) * 0.08;
    const inGain = 0.0035 * this.level;
    const wet = 0.9;
    for (let c = 0; c < this.lines.length; c++) {
      const goal = pedalDown ? this.fbDown[c]! : this.fbUp[c]!;
      this.fb[c] = this.fb[c]! + (goal - this.fb[c]!) * 0.2;
      const line = this.lines[c]!;
      const fb = this.fb[c]!;
      const len = line.length;
      let i = this.idx[c]!;
      let lp = this.lp[c]!;
      const toLeft = c % 2 === 0 ? 0.7 : 0.3;
      const toRight = 1 - toLeft;
      for (let n = from; n < to; n++) {
        const y = line[i]!;
        // One-pole low-pass in the loop: higher partials die faster, as on strings.
        lp += 0.55 * (y - lp);
        line[i] = input[n]! * inGain + lp * fb;
        if (++i === len) i = 0;
        outL[n]! += y * wet * toLeft;
        outR[n]! += y * wet * toRight;
      }
      this.idx[c] = i;
      this.lp[c] = Math.abs(lp) < 1e-20 ? 0 : lp;
    }
  }
}

export class SamplerCore {
  readonly sampleRate: number;
  params: SamplerParams = { ...DEFAULT_PARAMS };
  onStarted: ((probe: number, frame: number) => void) | null = null;

  private layout: SamplerLayout = { notes: [], releases: [], harmonics: [], pedal: [] };
  private readonly pcm = new Map<number, Pcm>();
  /** Note zones that cover each MIDI key, sorted by velocity. */
  private keyZones: NoteZoneInfo[][] = [];
  private readonly notes: Voice[] = [];
  private readonly aux: Voice[] = [];
  private readonly keyDown = new Uint8Array(128);
  private readonly keyVelocity = new Uint8Array(128);
  private readonly keyStart = new Float64Array(128);
  private pedal = 0;
  private queue: QueuedEvent[] = [];
  private seq = 0;
  private readonly dry: Float32Array;
  private readonly resonance: ResonanceBank;
  private rng = 0x2545f491;
  peak = 0;
  steals = 0;

  constructor(sampleRate: number, blockSize = 128) {
    this.sampleRate = sampleRate;
    for (let i = 0; i < NOTE_POOL; i++) this.notes.push(new Voice());
    for (let i = 0; i < AUX_POOL; i++) this.aux.push(new Voice());
    this.dry = new Float32Array(blockSize);
    this.resonance = new ResonanceBank(sampleRate);
  }

  get pedalDown(): boolean {
    return this.pedal >= 64;
  }

  get loadedZones(): number {
    return this.pcm.size;
  }

  activeVoices(): { notes: number; aux: number } {
    let notes = 0,
      aux = 0;
    for (const v of this.notes) if (v.active && !v.dying) notes++;
    for (const v of this.aux) if (v.active) aux++;
    return { notes, aux };
  }

  /** Queue or apply a message. `frame` is the current frame at the next render. */
  post(msg: ToWorklet, frame: number): void {
    switch (msg.type) {
      case "layout":
        this.setLayout(msg.layout);
        return;
      case "pcm":
        this.pcm.set(msg.id, {
          left: msg.left,
          right: msg.right ?? msg.left,
          mono: msg.right === null,
        });
        return;
      case "clear":
        this.kill();
        this.pcm.clear();
        this.setLayout({ notes: [], releases: [], harmonics: [], pedal: [] });
        return;
      case "params":
        this.params = { ...this.params, ...msg.params };
        return;
      case "cancelScheduled":
        this.queue = this.queue.filter((e) => e.frame <= frame);
        return;
      default: {
        const when = "when" in msg && msg.when !== undefined ? Math.round(msg.when * this.sampleRate) : frame;
        const ev = { frame: Math.max(frame, when), seq: this.seq++, msg };
        // Keep the queue sorted by frame, then arrival order. Usually tiny.
        let i = this.queue.length;
        while (i > 0 && this.queue[i - 1]!.frame > ev.frame) i--;
        this.queue.splice(i, 0, ev);
      }
    }
  }

  private setLayout(layout: SamplerLayout): void {
    this.layout = layout;
    this.keyZones = Array.from({ length: 128 }, () => []);
    for (const z of layout.notes)
      for (let k = z.lokey; k <= z.hikey; k++) this.keyZones[k]!.push(z);
    for (const list of this.keyZones) list.sort((a, b) => a.lovel - b.lovel);
  }

  render(outL: Float32Array, outR: Float32Array, frame: number): void {
    const n = outL.length;
    outL.fill(0);
    outR.fill(0);
    this.dry.fill(0, 0, n);
    let pos = 0;
    while (pos < n) {
      const next = this.queue[0];
      if (next && next.frame - frame <= pos) {
        this.queue.shift();
        this.apply(next, frame + pos);
        continue;
      }
      const end = next ? Math.min(n, next.frame - frame) : n;
      this.renderVoices(outL, outR, pos, end);
      this.resonance.process(this.dry, outL, outR, pos, end, this.pedalDown, this.params.resonance);
      pos = end;
    }
    const g = this.params.gain;
    let peak = 0;
    for (let i = 0; i < n; i++) {
      const l = softClip(outL[i]! * g),
        r = softClip(outR[i]! * g);
      outL[i] = l;
      outR[i] = r;
      const a = Math.max(Math.abs(l), Math.abs(r));
      if (a > peak) peak = a;
    }
    this.peak = Math.max(peak, this.peak * 0.9);
  }

  private apply(ev: QueuedEvent, frame: number): void {
    const msg = ev.msg;
    switch (msg.type) {
      case "noteOn":
        this.noteOn(msg.note, msg.velocity, frame);
        if (msg.probe !== undefined) this.onStarted?.(msg.probe, frame);
        return;
      case "noteOff":
        this.noteOff(msg.note, frame);
        return;
      case "pedal":
        this.setPedal(msg.value, frame);
        return;
      case "allOff":
        this.kill(ev.seq);
        return;
    }
  }

  private noteOn(note: number, velocity: number, frame: number): void {
    if (note < 0 || note > 127) return;
    const vel = Math.max(1, Math.min(127, Math.round(velocity)));
    const choice = this.pickZone(note, vel);
    // Re-striking a ringing string replaces its vibration.
    for (const v of this.notes)
      if (v.active && !v.dying && v.note === note) this.fade(v, 0.06);
    this.keyDown[note] = 1;
    this.keyVelocity[note] = vel;
    this.keyStart[note] = frame;
    if (!choice) return;
    const { zone, pcm } = choice;
    const layers = this.keyZones[zone.root] ?? this.keyZones[note] ?? [zone];
    const sameRoot = layers.filter((z) => z.root === zone.root);
    const targetDb = layerTargetDb(sameRoot.length ? sameRoot : [zone], vel);
    const gain =
      Math.pow(10, (targetDb - zone.rmsDb) / 20) * velocityCurve(vel, this.params.dynamics) * INT16_SCALE;
    const v = this.allocNote();
    v.active = true;
    v.note = note;
    v.velocity = vel;
    v.pcm = pcm;
    v.pos = 0;
    v.step = Math.pow(2, (note - zone.root) / 12);
    v.gain = gain;
    v.env = 1;
    v.decay = 1;
    v.releasing = false;
    v.dying = false;
    v.damped = false;
    v.startFrame = frame;
  }

  private noteOff(note: number, frame: number): void {
    if (!this.keyDown[note]) return;
    this.keyDown[note] = 0;
    if (!this.pedalDown) this.damp(note, frame);
  }

  private setPedal(value: number, frame: number): void {
    const wasDown = this.pedalDown;
    this.pedal = value;
    if (wasDown === this.pedalDown) return;
    this.triggerPedalNoise(this.pedalDown);
    if (!this.pedalDown)
      for (let note = 0; note < 128; note++) if (!this.keyDown[note]) this.damp(note, frame);
  }

  /** The damper falls on `note`: start the release and play release samples. */
  private damp(note: number, frame: number): void {
    let found = false;
    for (const v of this.notes) {
      if (!v.active || v.dying || v.damped || v.note !== note) continue;
      found = true;
      v.damped = true;
      if (note >= FIRST_UNDAMPED_KEY) continue;
      v.releasing = true;
      v.decay = Math.exp(-1 / (damperTau(note) * this.sampleRate));
    }
    // Key-return hammer noise plays for every key; string resonance only exists below F6.
    if (found) this.triggerRelease(note, frame);
  }

  private triggerRelease(note: number, frame: number): void {
    const amount = this.params.releaseNoise;
    if (amount <= 0) return;
    const vel = this.keyVelocity[note]!;
    const held = (frame - this.keyStart[note]!) / this.sampleRate;
    const hammer = this.layout.releases.find((r) => r.key === note);
    const hammerPcm = hammer && this.pcm.get(hammer.id);
    // Salamander: hammer noise at -37 dB, amp_veltrack 82%.
    if (hammerPcm) this.startAux(hammerPcm, 1, dbToGain(-37) * velocityCurve(vel, 0.82) * amount, note);
    const loud = vel >= 45;
    const harm = this.layout.harmonics.find((h) => h.loud === loud && note >= h.lokey && note <= h.hikey);
    const harmPcm = harm && this.pcm.get(harm.id);
    if (harm && harmPcm) {
      // String resonance fades the longer the key was held (SFZ rt_decay ~7 dB/s).
      const decayDb = -7 * held;
      if (decayDb > -40) {
        const level = (loud ? -4 : 0) + decayDb;
        this.startAux(
          harmPcm,
          Math.pow(2, (note - harm.root) / 12),
          dbToGain(level) * velocityCurve(vel, 0.92) * amount,
          note,
        );
      }
    }
  }

  private triggerPedalNoise(down: boolean): void {
    const amount = this.params.pedalNoise;
    if (amount <= 0) return;
    const options = this.layout.pedal.filter((p) => p.down === down && this.pcm.has(p.id));
    if (!options.length) return;
    this.rng = (this.rng * 1103515245 + 12345) >>> 0;
    const pick = options[this.rng % options.length]!;
    this.startAux(this.pcm.get(pick.id)!, 1, dbToGain(down ? -20 : -19) * amount, -1);
  }

  private startAux(pcm: Pcm, step: number, gain: number, note: number): void {
    let v = this.aux.find((x) => !x.active);
    if (!v) {
      v = this.aux.reduce((a, b) => (a.env * a.gain < b.env * b.gain ? a : b));
    }
    v.active = true;
    v.note = note;
    v.pcm = pcm;
    v.pos = 0;
    v.step = step;
    v.gain = gain * INT16_SCALE;
    v.env = 1;
    v.decay = 1;
    v.releasing = false;
    v.dying = false;
    v.damped = true;
  }

  private pickZone(note: number, vel: number): { zone: NoteZoneInfo; pcm: Pcm } | null {
    const loaded = (list: NoteZoneInfo[]) => list.filter((z) => this.pcm.has(z.id));
    let candidates = loaded(this.keyZones[note] ?? []);
    if (!candidates.length) {
      // Still loading: borrow the nearest loaded root within a tritone.
      let best: NoteZoneInfo | null = null;
      for (const z of this.layout.notes) {
        if (!this.pcm.has(z.id) || Math.abs(z.root - note) > 6) continue;
        if (!best || Math.abs(z.root - note) < Math.abs(best.root - note)) best = z;
      }
      if (!best) return null;
      candidates = loaded(this.keyZones[best.root] ?? []);
    }
    let zone = candidates.find((z) => vel >= z.lovel && vel <= z.hivel);
    if (!zone) {
      zone = candidates.reduce((a, b) =>
        Math.abs((a.lovel + a.hivel) / 2 - vel) <= Math.abs((b.lovel + b.hivel) / 2 - vel) ? a : b,
      );
    }
    return { zone, pcm: this.pcm.get(zone.id)! };
  }

  private allocNote(): Voice {
    let live = 0;
    let free: Voice | null = null;
    for (const v of this.notes) {
      if (!v.active) free ??= v;
      else if (!v.dying) live++;
    }
    if (live >= MAX_NOTE_VOICES) {
      // Steal the quietest released voice, else the oldest one.
      let victim: Voice | null = null;
      for (const v of this.notes) {
        if (!v.active || v.dying) continue;
        if (!victim) victim = v;
        else if (v.releasing !== victim.releasing) {
          if (v.releasing) victim = v;
        } else if (v.releasing ? v.env * v.gain < victim.env * victim.gain : v.startFrame < victim.startFrame) {
          victim = v;
        }
      }
      if (victim) this.fade(victim, 0.005);
      this.steals++;
    }
    if (free) return free;
    // Pool exhausted by fading voices: reuse the quietest one immediately.
    return this.notes.reduce((a, b) => (a.env * a.gain < b.env * b.gain ? a : b));
  }

  private fade(v: Voice, seconds: number): void {
    v.dying = true;
    v.releasing = true;
    v.decay = Math.min(v.decay, Math.exp(-1 / (seconds * this.sampleRate)));
  }

  /** Fade every voice and drop scheduled events sent before the all-off. */
  private kill(beforeSeq = Infinity): void {
    for (const v of this.notes) if (v.active) this.fade(v, 0.01);
    for (const v of this.aux) if (v.active) this.fade(v, 0.01);
    this.keyDown.fill(0);
    this.queue = this.queue.filter((e) => e.seq > beforeSeq);
  }

  private renderVoices(outL: Float32Array, outR: Float32Array, from: number, to: number): void {
    for (const v of this.notes) if (v.active) this.renderVoice(v, outL, outR, from, to, true);
    for (const v of this.aux) if (v.active) this.renderVoice(v, outL, outR, from, to, false);
  }

  private renderVoice(
    v: Voice,
    outL: Float32Array,
    outR: Float32Array,
    from: number,
    to: number,
    feedsResonance: boolean,
  ): void {
    const pcm = v.pcm!;
    const L = pcm.left,
      R = pcm.right,
      last = L.length - 3;
    const dry = this.dry;
    let pos = v.pos,
      env = v.env;
    const step = v.step,
      gain = v.gain,
      decay = v.decay,
      releasing = v.releasing,
      mono = pcm.mono;
    const exact = step === 1;
    for (let n = from; n < to; n++) {
      if (pos >= last) {
        v.active = false;
        break;
      }
      let l: number, r: number;
      if (exact) {
        l = L[pos]!;
        r = mono ? l : R[pos]!;
      } else {
        const i = pos | 0,
          f = pos - i;
        l = hermite(L, i, f);
        r = mono ? l : hermite(R, i, f);
      }
      const g = gain * env;
      l *= g;
      r *= g;
      outL[n]! += l;
      outR[n]! += r;
      if (feedsResonance) dry[n]! += l + r;
      pos += step;
      if (releasing) {
        env *= decay;
        if (env < SILENT) {
          v.active = false;
          break;
        }
      }
    }
    v.pos = pos;
    v.env = env;
  }
}

function hermite(d: Int16Array, i: number, f: number): number {
  const x0 = d[i]!,
    xm1 = i > 0 ? d[i - 1]! : x0,
    x1 = d[i + 1]!,
    x2 = d[i + 2]!;
  const c1 = 0.5 * (x1 - xm1);
  const c2 = xm1 - 2.5 * x0 + 2 * x1 - 0.5 * x2;
  const c3 = 0.5 * (x2 - xm1) + 1.5 * (x0 - x1);
  return ((c3 * f + c2) * f + c1) * f + x0;
}

export function softClip(x: number): number {
  if (x > 0.9) return 0.9 + 0.1 * Math.tanh((x - 0.9) / 0.1);
  if (x < -0.9) return -0.9 + 0.1 * Math.tanh((x + 0.9) / 0.1);
  return x;
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}
