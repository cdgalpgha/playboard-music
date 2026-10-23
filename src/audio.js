const SAMPLE_NAMES = [
  "A0",
  ...Array.from({ length: 7 }, (_, i) =>
    ["C", "Ds", "Fs", "A"].map((n) => n + (i + 1)),
  ).flat(),
  "C8",
];
const PCs = { C: 0, Ds: 3, Fs: 6, A: 9 };
const sampleMidi = (name) =>
  12 * (Number(name.at(-1)) + 1) + PCs[name.slice(0, -1)];
export const NOTE_NAMES = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
];
export const noteName = (midi) =>
  NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
export const QUALITIES = {
  major: { label: "Major", suffix: "", intervals: [0, 4, 7] },
  minor: { label: "Minor", suffix: "m", intervals: [0, 3, 7] },
  maj7: { label: "Major 7", suffix: "maj7", intervals: [0, 4, 7, 11] },
  min7: { label: "Minor 7", suffix: "m7", intervals: [0, 3, 7, 10] },
  sus2: { label: "Sus 2", suffix: "sus2", intervals: [0, 2, 7] },
  sus4: { label: "Sus 4", suffix: "sus4", intervals: [0, 5, 7] },
  dim: { label: "Diminished", suffix: "dim", intervals: [0, 3, 6] },
};
export function chordNotes(
  root,
  quality = "major",
  octave = 4,
  inversion = 0,
  transpose = 0,
) {
  const ns = QUALITIES[quality].intervals.map(
    (n) => 12 * (octave + 1) + root + n,
  );
  for (let i = 0; i < inversion; i++) ns.push(ns.shift() + 12);
  return ns.map((n) => Math.max(21, Math.min(108, n + transpose)));
}
export class PianoEngine extends EventTarget {
  constructor() {
    super();
    this.buffers = new Map();
    this.voices = new Map();
    this.pedal = false;
    this.status = "idle";
    this.volume = 0.72;
    this.velocity = 0.72;
    this.tone = "concert";
    this.reverb = 0.2;
    this.brightness = 65;
    this.transpose = 0;
    this.count = 0;
    this.voiceId = 0;
    this.maxVoices = 96;
    this.recorded = [];
    this.recording = false;
    this.recordOrigin = 0;
    this.loopSources = new Set();
  }
  emit() {
    this.dispatchEvent(new Event("change"));
  }
  createContext() {
    if (this.ctx) return;
    this.ctx = new AudioContext({ latencyHint: "interactive" });
    const c = this.ctx;
    this.input = c.createGain();
    this.eq = c.createBiquadFilter();
    this.eq.type = "lowpass";
    this.eq.frequency.value = 15000;
    this.dry = c.createGain();
    this.wet = c.createGain();
    this.convolver = c.createConvolver();
    const ir = c.createBuffer(2, c.sampleRate * 2.2, c.sampleRate);
    let seed = 42;
    for (let channel = 0; channel < 2; channel++) {
      const d = ir.getChannelData(channel);
      for (let i = 0; i < d.length; i++) {
        seed = (seed * 16807) % 2147483647;
        d[i] =
          ((seed / 2147483647) * 2 - 1) *
          Math.pow(1 - i / d.length, 3.5) *
          0.28;
      }
    }
    this.convolver.buffer = ir;
    this.master = c.createGain();
    this.master.gain.value = this.volume;
    this.limiter = c.createDynamicsCompressor();
    this.limiter.threshold.value = -14;
    this.limiter.knee.value = 12;
    this.limiter.ratio.value = 4;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.15;
    this.analyser = c.createAnalyser();
    this.analyser.fftSize = 256;
    this.input.connect(this.eq);
    this.eq.connect(this.dry);
    this.eq.connect(this.convolver);
    this.convolver.connect(this.wet);
    this.dry.connect(this.master);
    this.wet.connect(this.master);
    this.master.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(c.destination);
    this.setReverb(this.reverb);
    this.setBrightness(this.brightness);
  }
  async load() {
    if (this.status === "ready") return;
    if (this.loading) return this.loading;
    this.createContext();
    this.status = "loading";
    this.emit();
    this.loading = (async () => {
      try {
        let cursor = 0;
        const worker = async () => {
          while (cursor < SAMPLE_NAMES.length) {
            const name = SAMPLE_NAMES[cursor++];
            const midi = sampleMidi(name);
            if (this.buffers.has(midi)) continue;
            const response = await fetch(`/samples/salamander/${name}.mp3`);
            if (!response.ok)
              throw Error(`Sample ${name}: HTTP ${response.status}`);
            const buffer = await this.ctx.decodeAudioData(
              await response.arrayBuffer(),
            );
            this.buffers.set(midi, buffer);
            this.count = this.buffers.size;
            this.emit();
          }
        };
        await Promise.all(Array.from({ length: 5 }, worker));
        this.status = "ready";
        this.emit();
      } catch (error) {
        this.status = "error";
        this.error = error.message;
        this.emit();
        throw error;
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }
  async unlock() {
    this.createContext();
    if (this.ctx.state !== "running") await this.ctx.resume();
    if (this.status !== "ready") await this.load();
    this.emit();
  }
  setVolume(value) {
    this.volume = value;
    if (this.master)
      this.master.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
  }
  setReverb(value) {
    this.reverb = value;
    if (this.wet) {
      this.wet.gain.setTargetAtTime(value * 0.6, this.ctx.currentTime, 0.04);
      this.dry.gain.setTargetAtTime(
        1 - value * 0.15,
        this.ctx.currentTime,
        0.04,
      );
    }
  }
  setBrightness(value) {
    this.brightness = value;
    if (this.eq)
      this.eq.frequency.setTargetAtTime(
        1800 + (value / 100) * 16000,
        this.ctx.currentTime,
        0.04,
      );
  }
  noteOn(
    midi,
    velocity = this.velocity,
    { time, autoRelease, record = true } = {},
  ) {
    if (this.status !== "ready") return null;
    const c = this.ctx,
      t = Math.max(time ?? c.currentTime, c.currentTime),
      id = ++this.voiceId;
    if (this.voices.size >= this.maxVoices)
      this.stopVoice(this.voices.keys().next().value, 0.03);
    const n = Math.max(21, Math.min(108, midi));
    const nearest = [...this.buffers.keys()].reduce((a, b) =>
      Math.abs(b - n) < Math.abs(a - n) ? b : a,
    );
    const src = c.createBufferSource();
    src.buffer = this.buffers.get(nearest);
    src.playbackRate.value = 2 ** ((n - nearest) / 12);
    const gain = c.createGain(),
      filter = c.createBiquadFilter(),
      pan = c.createStereoPanner();
    filter.type = "lowpass";
    filter.frequency.value =
      this.tone === "felt"
        ? 1800 + velocity * 3200
        : this.tone === "warm"
          ? 4000 + velocity * 6000
          : 6500 + velocity * 13000;
    pan.pan.value = Math.max(-0.5, Math.min(0.5, (n - 64) / 88));
    gain.gain.setValueAtTime(0, t);
    const level = Math.pow(Math.max(0.05, velocity), 1.65) * 0.65;
    gain.gain.linearRampToValueAtTime(
      level,
      t + (this.tone === "felt" ? 0.009 : 0.003),
    );
    src.connect(filter);
    filter.connect(gain);
    gain.connect(pan);
    pan.connect(this.input);
    const voice = {
      id,
      midi: n,
      src,
      gain,
      pan,
      filter,
      held: true,
      released: false,
      start: t,
      record,
    };
    this.voices.set(id, voice);
    src.onended = () => {
      this.voices.delete(id);
      src.disconnect();
      filter.disconnect();
      gain.disconnect();
      pan.disconnect();
    };
    src.start(t);
    if (autoRelease) this.releaseVoice(id, t + autoRelease, true);
    if (this.recording && record)
      this.recorded.push({
        type: "on",
        id,
        midi: n,
        velocity,
        at: t - this.recordOrigin,
      });
    return id;
  }
  releaseVoice(id, time, force = false) {
    const v = this.voices.get(id);
    if (!v || v.released) return;
    v.held = false;
    if (this.recording && v.record)
      this.recorded.push({
        type: "off",
        id,
        at: (time ?? this.ctx.currentTime) - this.recordOrigin,
      });
    if (this.pedal && !force) return;
    v.released = true;
    const t = Math.max(time ?? this.ctx.currentTime, this.ctx.currentTime);
    v.gain.gain.cancelAndHoldAtTime(t);
    v.gain.gain.setTargetAtTime(0.00001, t, this.tone === "felt" ? 0.11 : 0.07);
    v.src.stop(t + (this.tone === "felt" ? 0.9 : 0.6));
  }
  stopVoice(id, release = 0.03) {
    const v = this.voices.get(id);
    if (!v) return;
    v.gain.gain.cancelAndHoldAtTime(this.ctx.currentTime);
    v.gain.gain.setTargetAtTime(0.00001, this.ctx.currentTime, release);
    try {
      v.src.stop(this.ctx.currentTime + release * 6);
    } catch {}
    this.voices.delete(id);
  }
  setPedal(on) {
    this.pedal = on;
    if (!on)
      for (const [id, v] of this.voices)
        if (!v.held) this.releaseVoice(id, undefined, true);
    if (this.recording)
      this.recorded.push({
        type: "pedal",
        value: on,
        at: this.ctx.currentTime - this.recordOrigin,
      });
  }
  panic() {
    for (const id of [...this.voices.keys()]) this.stopVoice(id);
    for (const src of this.loopSources) {
      try {
        src.stop();
      } catch {}
    }
    this.loopSources.clear();
  }
  click(time, accent = false) {
    if (!this.ctx) return;
    const c = this.ctx,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = "sine";
    o.frequency.value = accent ? 1300 : 900;
    g.gain.setValueAtTime(0.055, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.035);
    o.connect(g);
    g.connect(this.master);
    o.start(time);
    o.stop(time + 0.04);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
  meter() {
    if (!this.analyser) return 0;
    const d = new Float32Array(128);
    this.analyser.getFloatTimeDomainData(d);
    return Math.min(
      1,
      Math.sqrt(d.reduce((s, v) => s + v * v, 0) / d.length) * 4,
    );
  }
  startRecording() {
    this.recorded = [];
    this.recordOrigin = this.ctx.currentTime;
    this.recording = true;
    this.recordSettings = {
      tone: this.tone,
      reverb: this.reverb,
      brightness: this.brightness,
    };
    if (this.pedal) this.recorded.push({ type: "pedal", value: true, at: 0 });
  }
  stopRecording() {
    this.recording = false;
    const at = this.ctx.currentTime - this.recordOrigin;
    const ons = new Set(
      this.recorded.filter((e) => e.type === "on").map((e) => e.id),
    );
    const offs = new Set(
      this.recorded.filter((e) => e.type === "off").map((e) => e.id),
    );
    for (const id of ons)
      if (!offs.has(id)) this.recorded.push({ type: "off", id, at });
    this.recordDuration = at;
    return this.recorded;
  }
  noteEnd(event) {
    let end =
      this.recorded.find((e) => e.type === "off" && e.id === event.id)?.at ??
      this.recordDuration;
    const previous = this.recorded
      .filter((e) => e.type === "pedal" && e.at <= end)
      .at(-1);
    if (previous?.value)
      end =
        this.recorded.find((e) => e.type === "pedal" && !e.value && e.at > end)
          ?.at ?? this.recordDuration;
    return end;
  }
  replay() {
    if (!this.recorded.length) return;
    const origin = this.ctx.currentTime + 0.12,
      ids = new Map();
    for (const e of this.recorded) {
      if (e.type === "on") {
        const id = this.noteOn(e.midi, e.velocity, {
          time: origin + e.at,
          record: false,
        });
        ids.set(e.id, id);
        this.releaseVoice(id, origin + this.noteEnd(e), true);
      }
    }
  }
  async exportWav() {
    if (!this.recorded.some((e) => e.type === "on"))
      throw Error("Record some notes first.");
    const rate = 44100,
      duration = Math.min(this.recordDuration + 4, 604),
      c = new OfflineAudioContext(2, Math.ceil(duration * rate), rate);
    const master = c.createGain();
    master.gain.value = this.volume;
    const limiter = c.createDynamicsCompressor();
    master.connect(limiter);
    limiter.connect(c.destination);
    const offs = new Map();
    for (const e of this.recorded) if (e.type === "off") offs.set(e.id, e.at);
    for (const e of this.recorded) {
      if (e.type !== "on") continue;
      const nearest = [...this.buffers.keys()].reduce((a, b) =>
        Math.abs(b - e.midi) < Math.abs(a - e.midi) ? b : a,
      );
      const src = c.createBufferSource(),
        g = c.createGain(),
        filter = c.createBiquadFilter(),
        pan = c.createStereoPanner();
      src.buffer = this.buffers.get(nearest);
      src.playbackRate.value = 2 ** ((e.midi - nearest) / 12);
      filter.type = "lowpass";
      filter.frequency.value =
        this.recordSettings.tone === "felt"
          ? 1800 + e.velocity * 3200
          : this.recordSettings.tone === "warm"
            ? 4000 + e.velocity * 6000
            : 6500 + e.velocity * 13000;
      pan.pan.value = Math.max(-0.5, Math.min(0.5, (e.midi - 64) / 88));
      g.gain.setValueAtTime(0, e.at);
      g.gain.linearRampToValueAtTime(e.velocity ** 1.65 * 0.65, e.at + 0.005);
      const end = this.noteEnd(e);
      g.gain.setTargetAtTime(
        0.00001,
        Math.max(e.at + 0.01, end),
        this.recordSettings.tone === "felt" ? 0.11 : 0.07,
      );
      src.connect(filter);
      filter.connect(g);
      g.connect(pan);
      pan.connect(master);
      src.start(e.at);
      src.stop(Math.min(duration, end + 1.5));
    }
    const rendered = await c.startRendering();
    return wavBlob(rendered);
  }
}
export function wavBlob(buffer) {
  const frames = buffer.length,
    channels = buffer.numberOfChannels,
    bytes = frames * channels * 2,
    ab = new ArrayBuffer(44 + bytes),
    v = new DataView(ab);
  const str = (at, s) =>
    [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + bytes, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, buffer.sampleRate, true);
  v.setUint32(28, buffer.sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, bytes, true);
  const data = Array.from({ length: channels }, (_, i) =>
    buffer.getChannelData(i),
  );
  let at = 44;
  for (let i = 0; i < frames; i++)
    for (let ch = 0; ch < channels; ch++) {
      const n = Math.max(-1, Math.min(1, data[ch][i]));
      v.setInt16(at, n < 0 ? n * 32768 : n * 32767, true);
      at += 2;
    }
  return new Blob([ab], { type: "audio/wav" });
}
