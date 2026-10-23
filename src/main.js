import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/manrope/latin-800.css";
import {
  PianoEngine,
  NOTE_NAMES,
  noteName,
  chordNotes,
  QUALITIES,
} from "./audio.js";
import { YouTubeSession, videoId } from "./youtube.js";
import "./style.css";
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const glyph = (name, size = 20) => {
  const paths = {
    piano: "M3 4h18v16H3z M7 4v9m5-9v9m5-9v9M8 13v7m8-7v7",
    studio: "M3 7h18M3 17h18M7 3v8m10 2v8M3 12h18",
    book: "M12 5v16M3 3c4 0 6 1 9 3 3-2 5-3 9-3v15c-4 0-6 1-9 3-3-2-5-3-9-3z",
    learn: "m3 9 9-5 9 5-9 5zM6 11v6c4 3 8 3 12 0v-6m3-2v8",
    songs:
      "M9 18V5l12-2v13M9 9l12-2M9 18c0 3-6 4-6 1 0-3 6-4 6-1m12-2c0 3-6 4-6 1 0-3 6-4 6-1",
    progress: "M4 20V4m0 16h17M8 15l4-5 4 2 5-7",
    play: "m8 4 12 8-12 8z",
    pause: "M8 4v16M16 4v16",
    arrow: "M5 19 19 5M5 5h14v14",
    headphones: "M3 14v-3a9 9 0 0 1 18 0v3M3 12h4v8H3zM17 12h4v8h-4z",
    volume: "m3 9 5 0 5-5v16l-5-5H3zM17 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14",
    youtube:
      "M21 7c0-2-1-3-3-3H6C4 4 3 5 3 7v10c0 2 1 3 3 3h12c2 0 3-1 3-3zM10 8l6 4-6 4z",
    check: "m5 12 4 4L20 5",
    close: "m5 5 14 14M19 5 5 19",
    record: "M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
    midi: "M4 4h16v16H4zM7 4v8h3V4m4 0v8h3V4M8 12v8m8-8v8",
    search: "M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0m-1 5 6 6",
    spark: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z",
    refresh: "M20 8a8 8 0 1 0 0 8M20 2v6h-6",
    download: "M12 3v13m-5-5 5 5 5-5M3 16v5h18v-5",
    settings: "M3 7h18M3 17h18M7 4v6m10 4v6",
    help: "M9 8c0-4 7-4 7 0 0 3-4 2-4 6M12 18v1",
    bolt: "m13 2-9 12h7l-1 8 10-13h-7z",
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(
    paths[name] || paths.spark
  )
    .split(" | ")
    .map((d) => `<path d="${d}"/>`)
    .join("")}</svg>`;
};
function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function store(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
const engine = new PianoEngine(),
  youtube = new YouTubeSession();
const progressions = {
  Pop: [
    ["C", "major"],
    ["G", "major"],
    ["A", "minor"],
    ["F", "major"],
  ],
  "R&B": [
    ["D", "min7"],
    ["G", "major"],
    ["C", "maj7"],
    ["A", "min7"],
  ],
  Jazz: [
    ["D", "min7"],
    ["G", "major"],
    ["C", "maj7"],
    ["A", "min7"],
  ],
  Rock: [
    ["E", "major"],
    ["G", "major"],
    ["D", "major"],
    ["A", "major"],
  ],
  Classical: [
    ["C", "major"],
    ["F", "major"],
    ["G", "major"],
    ["C", "major"],
  ],
  "Lo-fi": [
    ["A", "min7"],
    ["F", "maj7"],
    ["C", "maj7"],
    ["G", "major"],
  ],
};
const storedStats = read("playboard-progress", {});
const state = {
  view: "studio",
  mode: "chords",
  voicing: "genre",
  octave: 4,
  quality: "major",
  inversion: 0,
  transpose: 0,
  pedal: false,
  genre: "Pop",
  bpm: 80,
  metro: false,
  practicing: false,
  step: 0,
  current: "—",
  notes: [],
  search: "",
  bookQuality: "all",
  lesson: 0,
  volume: 72,
  velocity: 72,
  reverb: 20,
  brightness: 65,
  dock: false,
  stats: {
    chords: Number(storedStats.chords) || 0,
    correct: Number(storedStats.correct) || 0,
    sessions: Number(storedStats.sessions) || 0,
  },
  sessionHits: 0,
  sessionAttempts: 0,
  midiName: "",
  midi: null,
};
const chordHeld = new Map(),
  pointerHeld = new Map(),
  pianoHeld = new Map(),
  taps = [];
let spaceHeld = false,
  metroTimer,
  practiceTimer,
  practiceEpoch = 0,
  practiceStart = 0,
  lastScoredBar = -1,
  beatNext = 0,
  beatCount = 0,
  toastTimer,
  recordTimer;
const localAudio = new Audio();
let localUrl = "",
  localName = "",
  lyrics = [];
const pianoMap = {
  KeyA: 0,
  KeyW: 1,
  KeyS: 2,
  KeyE: 3,
  KeyD: 4,
  KeyF: 5,
  KeyT: 6,
  KeyG: 7,
  KeyY: 8,
  KeyH: 9,
  KeyU: 10,
  KeyJ: 11,
  KeyK: 12,
  KeyO: 13,
  KeyL: 14,
  KeyP: 15,
  Semicolon: 16,
  Quote: 17,
};
const chordName = (r, q) => NOTE_NAMES[r] + QUALITIES[q].suffix;
const rootIndex = (r) => NOTE_NAMES.indexOf(r);
const format = (t) =>
  Number.isFinite(t)
    ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`
    : "0:00";
function toast(message) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 4200);
}
function persistStats() {
  store("playboard-progress", state.stats);
}
function engineStatus() {
  const status = $("#engine-status"),
    btn = $("#enable-audio");
  if (status) {
    status.textContent =
      engine.status === "ready"
        ? "30 SAMPLES LOADED"
        : engine.status === "error"
          ? "SAMPLE LOAD FAILED"
          : `LOADING PIANO · ${engine.count}/30`;
    status.classList.toggle("error", engine.status === "error");
  }
  if (btn) {
    btn.disabled = engine.status === "loading";
    btn.innerHTML =
      engine.status === "error"
        ? `${glyph("refresh", 15)} Retry piano`
        : engine.ctx?.state === "running"
          ? `${glyph("check", 15)} Audio enabled`
          : `${glyph("bolt", 15)} Enable audio`;
    btn.classList.toggle("audio-ready", engine.ctx?.state === "running");
  }
  const rate = $("#sample-rate");
  if (rate && engine.ctx)
    rate.textContent = engine.ctx.sampleRate / 1000 + " kHz";
  const loading = $("#sample-progress");
  if (loading) loading.style.width = `${(engine.count / 30) * 100}%`;
  const voices = $("#voice-count");
  if (voices) voices.textContent = `${engine.voices.size} voices`;
}
engine.addEventListener("change", engineStatus);
async function enableAudio() {
  try {
    await engine.unlock();
    engineStatus();
  } catch {
    toast(
      "Piano samples could not load. Check your connection and click Retry piano.",
    );
  }
}
function pressedNotes() {
  return [
    ...chordHeld.values(),
    ...pianoHeld.values(),
    ...pointerHeld.values(),
  ].flatMap((x) => x.notes);
}
function updateKeys() {
  const notes = pressedNotes();
  $$("[data-midi]").forEach((el) =>
    el.classList.toggle("pressed", notes.includes(Number(el.dataset.midi))),
  );
  const display = $("#current-chord");
  if (display) display.textContent = state.current;
  const names = $("#played-notes");
  if (names)
    names.textContent =
      state.notes.map(noteName).join("  ·  ") || "Play a note to begin";
  $$("[data-chord]").forEach((el) =>
    el.classList.toggle("is-playing", el.dataset.chord === state.current),
  );
}
function registerChord(
  root,
  quality,
  {
    octave = state.octave,
    velocity = engine.velocity,
    heldKey = null,
    autoRelease = 0,
  } = {},
) {
  if (engine.status !== "ready") {
    toast("The recorded piano is still loading. Please wait.");
    return null;
  }
  engine.unlock().catch(() => {});
  const physical = chordNotes(root, quality, octave, state.inversion, 0),
    notes = physical.map((n) =>
      Math.max(21, Math.min(108, n + state.transpose)),
    ),
    name = chordName((root + state.transpose + 24) % 12, quality),
    ids = notes.map((n) =>
      engine.noteOn(n, velocity, { autoRelease: autoRelease || undefined }),
    );
  state.current = name;
  state.notes = notes;
  state.stats.chords++;
  persistStats();
  if (heldKey) chordHeld.set(heldKey, { notes: physical, ids });
  scorePractice(root, quality);
  updateKeys();
  if (state.view === "learn") {
    const l = lessons[state.lesson];
    if (root === l.root && quality === l.quality) {
      $("#lesson-feedback").textContent =
        "That’s it. Listen to how the notes belong together.";
      $("#lesson-feedback").className = "lesson-success";
      store("playboard-lessons", {
        ...read("playboard-lessons", {}),
        [state.lesson]: true,
      });
    }
  }
  return { notes, ids };
}
function releaseHeld(map, key) {
  const held = map.get(key);
  if (!held) return;
  held.ids.forEach((id) => engine.releaseVoice(id));
  map.delete(key);
  updateKeys();
}
function releaseAll() {
  for (const map of [chordHeld, pianoHeld, pointerHeld])
    for (const key of [...map.keys()]) releaseHeld(map, key);
  spaceHeld = false;
  engine.setPedal(state.pedal);
  updateKeys();
}
function triggerNote(midi, key, map, velocity = engine.velocity) {
  if (engine.status !== "ready") {
    toast("Piano samples are loading.");
    return;
  }
  engine.unlock().catch(() => {});
  const n = Math.max(21, Math.min(108, midi + state.transpose)),
    id = engine.noteOn(n, velocity);
  map.set(key, { notes: [midi], ids: [id] });
  state.current = noteName(n);
  state.notes = [n];
  updateKeys();
}
function setPedal(on) {
  state.pedal = on;
  engine.setPedal(on);
  const b = $("#sustain");
  if (b) {
    b.classList.toggle("enabled", on);
    b.setAttribute("aria-pressed", String(on));
  }
  $("#pedal-state")?.replaceChildren(
    document.createTextNode(on ? "PEDAL DOWN" : "PEDAL UP"),
  );
}
function panic() {
  releaseAll();
  engine.panic();
  stopPractice();
  setMetro(false);
  setPedal(false);
  toast("All notes stopped.");
}
function setMetro(on) {
  clearInterval(metroTimer);
  state.metro = on;
  if (on) {
    if (engine.status !== "ready") {
      state.metro = false;
      toast("Wait for the piano to load.");
      return;
    }
    engine.unlock().catch(() => {});
    beatNext = engine.ctx.currentTime + 0.08;
    beatCount = 0;
    metroTimer = setInterval(() => {
      while (beatNext < engine.ctx.currentTime + 0.1) {
        engine.click(beatNext, beatCount % 4 === 0);
        beatNext += 60 / state.bpm;
        beatCount++;
      }
    }, 25);
  }
  const b = $("#metronome");
  if (b) {
    b.classList.toggle("enabled", state.metro);
    b.setAttribute("aria-pressed", String(state.metro));
  }
}
function stopPractice() {
  state.practicing = false;
  practiceEpoch++;
  clearInterval(practiceTimer);
  $$(".beat-dot").forEach((d) => d.classList.remove("on"));
  const b = $("#practice-toggle");
  if (b) b.innerHTML = `${glyph("play", 15)} Start session`;
  const p = $("#practice-status");
  if (p) p.textContent = "4 chords · 4 beats per bar";
}
function startPractice() {
  if (state.practicing) {
    stopPractice();
    return;
  }
  if (engine.status !== "ready") {
    toast("Wait for the recorded piano to finish loading.");
    return;
  }
  engine.unlock().catch(() => {});
  setMetro(false);
  state.practicing = true;
  state.step = 0;
  state.sessionAttempts = 0;
  state.sessionHits = 0;
  lastScoredBar = -1;
  state.stats.sessions++;
  persistStats();
  const epoch = ++practiceEpoch,
    beatSeconds = 60 / state.bpm;
  let next = engine.ctx.currentTime + 0.3,
    beat = 0;
  practiceStart = next;
  const schedule = () => {
    if (epoch !== practiceEpoch) return;
    while (next < engine.ctx.currentTime + 0.12) {
      const target = next,
        beatNumber = beat,
        bar = Math.floor(beat / 4),
        step = bar % 4;
      if (beat % 4 === 0) {
        const [root, quality] = progressions[state.genre][step];
        chordNotes(rootIndex(root), quality, 3, 0, state.transpose).forEach(
          (n) =>
            engine.noteOn(n, 0.38, {
              time: target,
              autoRelease: beatSeconds * 3.6,
              record: false,
            }),
        );
      }
      engine.click(target, beat % 4 === 0);
      setTimeout(
        () => {
          if (epoch !== practiceEpoch) return;
          state.step = step;
          $$(".progression-card").forEach((e, i) =>
            e.classList.toggle("current", i === step),
          );
          $$(".beat-dot").forEach((d, i) =>
            d.classList.toggle("on", i === beatNumber % 4),
          );
          const el = $("#practice-status");
          if (el)
            el.textContent = `Bar ${bar + 1} · ${chordName(rootIndex(progressions[state.genre][step][0]), progressions[state.genre][step][1])}`;
        },
        Math.max(0, (target - engine.ctx.currentTime) * 1000),
      );
      next += beatSeconds;
      beat++;
    }
  };
  schedule();
  practiceTimer = setInterval(schedule, 25);
  $("#practice-toggle").innerHTML = `${glyph("pause", 15)} Pause session`;
  $("#feedback").textContent =
    "Listen to the backing chords. Join on the first beat of each bar.";
}
function scorePractice(root, quality) {
  if (!state.practicing) return;
  const elapsed = engine.ctx.currentTime - practiceStart;
  if (elapsed < 0) return;
  const barSeconds = 240 / state.bpm,
    bar = Math.floor(elapsed / barSeconds),
    phase = elapsed % barSeconds;
  const nearNext = phase > barSeconds - 0.18,
    targetBar = nearNext ? bar + 1 : bar,
    step = targetBar % 4,
    expected = progressions[state.genre][step];
  const timing = nearNext ? barSeconds - phase : phase;
  state.sessionAttempts++;
  const correct =
    root === rootIndex(expected[0]) && quality === expected[1] && timing < 0.22;
  const feedback = $("#feedback");
  if (correct && lastScoredBar !== targetBar) {
    lastScoredBar = targetBar;
    state.sessionHits++;
    state.stats.correct++;
    persistStats();
    feedback.textContent = `In the pocket · ${Math.round(timing * 1000)} ms from the bar`;
    feedback.className = "feedback good";
  } else if (lastScoredBar === targetBar && correct) {
    feedback.textContent = "Bar completed. Get ready for the next chord.";
  } else {
    feedback.textContent =
      root === rootIndex(expected[0])
        ? "Right root — match the chord quality and play on beat one."
        : `Next up: ${chordName(rootIndex(expected[0]), expected[1])}. Follow the highlighted chord.`;
    feedback.className = "feedback";
  }
  const accuracy = $("#session-accuracy");
  if (accuracy) accuracy.textContent = state.sessionHits + " well-timed bars";
}
function sidebar() {
  return `<aside class="sidebar"><a class="brand" href="#studio" data-view="studio"><span class="brand-icon">${glyph("piano", 26)}</span><span>playboard<span class="brand-dot">.</span></span></a><div class="workspace-label">YOUR MUSIC WORKSPACE</div><nav>${[
    ["studio", "Play studio"],
    ["songs", "YouTube sessions"],
    ["book", "Chord book"],
    ["learn", "Learn to play"],
    ["progress", "My progress"],
  ]
    .map(
      ([id, label]) =>
        `<button class="nav-item ${state.view === id ? "selected" : ""}" data-view="${id}" aria-label="${label}">${glyph(id)}<span>${label}</span>${id === "songs" ? '<i class="nav-dot"></i>' : ""}</button>`,
    )
    .join(
      "",
    )}</nav><div class="sidebar-bottom"><div class="sample-credit"><span class="tiny-label">THE INSTRUMENT</span><div class="mini-grand">${glyph("piano", 33)}</div><strong>A real grand.<br>At your fingertips.</strong><p>Yamaha C5 recordings.<br>Every note, a little more alive.</p><a href="/samples/salamander/ATTRIBUTION.md" target="_blank" rel="noopener">Salamander · Alexander Holm ${glyph("arrow", 12)}</a></div><div class="profile"><div class="avatar">P</div><div><strong>Your personal studio</strong><span>Free to play. Always.</span></div><i class="connection-dot"></i></div></div></aside>`;
}
function header(title, desc) {
  return `<header class="topbar"><div class="breadcrumb">Workspace <span>/</span> ${title}</div><div class="topbar-right"><span class="headphone-tip">${glyph("headphones", 14)} Best with headphones</span><button id="help" class="icon-button" aria-label="Keyboard guide">${glyph("help", 16)}</button></div></header><div class="page-heading"><div><div class="eyebrow">A SPACE TO SOUND LIKE YOURSELF</div><h1>${title === "Play studio" ? "Less thinking. More playing." : title}</h1><p>${desc}</p></div>${title === "Play studio" ? `<button class="primary" id="enable-audio">${glyph("bolt", 15)} Enable audio</button>` : ""}</div>`;
}
function range(id, label, value, min = 0, max = 100, extra = "") {
  return `<label class="range-control"><span>${label}<output id="${id}-value">${value}${extra}</output></span><input type="range" id="${id}" aria-label="${label}" min="${min}" max="${max}" value="${value}"></label>`;
}
function studio() {
  return `${header("Play studio", "A sampled grand piano. An open canvas. Make it yours.")}<div class="studio-banner"><div><span class="live-dot"></span> THE STUDIO IS YOURS <span class="banner-divider">/</span> <span>Recorded sound. Real expression.</span></div><span class="banner-right">${glyph("spark", 14)} Built for the way you play.</span></div><section class="instrument"><div class="instrument-header"><div class="instrument-identity"><div class="instrument-symbol">${glyph("piano", 29)}</div><div><div class="tiny-label">SALAMANDER COLLECTION</div><h2 id="instrument-title">Concert Grand <span>01</span></h2><p>Yamaha C5 · Acoustic samples</p></div></div><div class="audio-status"><span id="engine-status">LOADING PIANO · ${engine.count}/30</span><div class="sample-track"><i id="sample-progress" style="width:${(engine.count / 30) * 100}%"></i></div><span id="voice-count">0 voices</span></div><button class="text-button panic-button" id="panic">All notes off <kbd>Esc</kbd></button></div><div class="instrument-controls"><label class="instrument-select"><span class="tiny-label">INSTRUMENT</span><select id="tone" aria-label="Instrument"><option value="concert" ${engine.tone === "concert" ? "selected" : ""}>Concert Grand</option><option value="felt" ${engine.tone === "felt" ? "selected" : ""}>Soft Felt · filtered</option><option value="warm" ${engine.tone === "warm" ? "selected" : ""}>Warm Room · filtered</option></select></label>${range("volume", "MASTER", state.volume)}${range("reverb", "ROOM", state.reverb)}${range("brightness", "BRIGHTNESS", state.brightness)}${range("velocity", "TOUCH", state.velocity, 15, 100)}<div class="output-meter"><span class="tiny-label">OUTPUT</span><div class="meter-bars">${Array.from({ length: 16 }, () => "<i></i>").join("")}</div><span>STEREO</span></div></div><div class="performance-toolbar"><div class="segmented" aria-label="Playing mode"><button data-mode="chords" class="${state.mode === "chords" ? "active" : ""}">Chord mode</button><button data-mode="notes" class="${state.mode === "notes" ? "active" : ""}">Piano mode</button></div><div class="stepper"><span>OCTAVE</span><button id="octave-down" aria-label="Lower octave">−</button><b id="octave-value">${state.octave}</b><button id="octave-up" aria-label="Higher octave">+</button></div><label class="compact-select">VOICING<select id="voicing" aria-label="Keyboard chord voicing"><option value="genre" ${state.voicing === "genre" ? "selected" : ""}>Follow genre</option><option value="triads" ${state.voicing === "triads" ? "selected" : ""}>Triads</option><option value="sevenths" ${state.voicing === "sevenths" ? "selected" : ""}>Sevenths</option></select></label><label class="compact-select">TRANSPOSE <select id="transpose" aria-label="Transpose">${Array.from(
    { length: 25 },
    (_, i) => i - 12,
  )
    .map(
      (n) =>
        `<option value="${n}" ${n === state.transpose ? "selected" : ""}>${n > 0 ? "+" : ""}${n}</option>`,
    )
    .join(
      "",
    )}</select></label><button class="pedal-button ${state.pedal ? "enabled" : ""}" id="sustain" aria-pressed="${state.pedal}"><i></i> Sustain</button><button class="text-button midi-button" id="midi-connect">${glyph("midi", 15)} ${state.midiName ? esc(state.midiName) : "Connect MIDI"}</button></div><div class="piano-shell"><div class="piano-display"><div class="note-readout"><span class="tiny-label">NOW PLAYING</span><strong id="current-chord">${state.current}</strong><span id="played-notes">${state.notes.map(noteName).join(" · ") || "Play a note to begin"}</span></div><div class="piano-display-right"><span id="pedal-state">${state.pedal ? "PEDAL DOWN" : "PEDAL UP"}</span><div class="piano-display-dots"><i></i><i></i><i></i></div><span>RECORDED ACOUSTIC PIANO</span></div></div><div class="piano" id="piano">${piano()}</div><div class="piano-caption"><span>ALEXANDER HOLM <i>×</i> PLAYBOARD</span><span>Sampled in minor thirds · A0–C8</span></div></div><div class="instrument-footer"><div class="keyboard-guide">${state.mode === "chords" ? "<span><kbd>A</kbd>–<kbd>G</kbd> Major</span><span><kbd>Shift</kbd> + key Minor</span><span><kbd>Space</kbd> + key Sharp</span>" : "<span><kbd>A W S E D F T G Y H U J</kbd> Chromatic notes</span><span><kbd>Space</kbd> Sustain pedal</span>"}<button id="shortcuts">Keyboard guide ${glyph("arrow", 12)}</button></div><button id="record" class="record-button ${engine.recording ? "recording" : ""}"><i></i>${engine.recording ? "Stop recording" : "Record take"} <span id="record-time"></span></button></div>${engine.recorded.some((e) => e.type === "on") && !engine.recording ? recordResult() : ""}</section><div class="workspace-grid"><section class="practice-panel"><div class="section-heading"><div><div class="eyebrow">THE PRACTICE ROOM</div><h2>Find a pocket. Stay a while.</h2><p>Four chords, a steady pulse, and room to explore.</p></div><div class="beat-indicator">${Array.from({ length: 4 }, () => '<i class="beat-dot"></i>').join("")}</div></div><div class="genre-tabs">${Object.keys(
    progressions,
  )
    .map(
      (g) =>
        `<button data-genre="${g}" class="${state.genre === g ? "active" : ""}">${g}</button>`,
    )
    .join(
      "",
    )}</div><div class="progression">${progressions[state.genre].map(([r, q], i) => `<button class="progression-card ${state.step === i ? "current" : ""}" data-root="${rootIndex(r)}" data-quality="${q}" data-chord="${chordName(rootIndex(r), q)}"><span>0${i + 1}</span><strong>${r}<small>${QUALITIES[q].suffix}</small></strong><em>${QUALITIES[q].label}</em><div class="bar-ticks"><i></i><i></i><i></i><i></i></div></button>`).join("")}</div><div class="practice-transport"><button id="practice-toggle" class="primary">${glyph("play", 15)} Start session</button><label class="tempo"><input type="number" id="bpm" aria-label="Tempo" min="40" max="180" value="${state.bpm}"><span>BPM</span></label><button id="tap-tempo" class="text-button">Tap tempo</button><button id="metronome" class="metronome ${state.metro ? "enabled" : ""}" aria-pressed="${state.metro}" aria-label="Metronome">♩</button></div><div class="practice-meta"><span id="practice-status">4 chords · 4 beats per bar</span><span id="session-accuracy">${state.sessionHits} well-timed bars</span></div><p id="feedback" class="feedback">Play the highlighted chord on beat one. We’ll help you find the timing.</p></section><section class="session-card"><div class="section-heading"><div><div class="eyebrow">YOUR BACKING BAND</div><h2>A session, on your terms.</h2></div>${glyph("youtube", 23)}</div><div class="session-art" aria-hidden="true"><div class="vinyl"><span>p<span>.</span></span></div><span class="session-art-label">PRESS PLAY.<br>FIND YOUR WAY.</span><span class="session-star">✳</span></div><p>Bring a YouTube karaoke or backing track.<br>Play along. Keep the creator in the picture.</p><form class="youtube-form" id="studio-youtube-form"><label class="sr-only" for="studio-youtube-url">YouTube video URL</label><input id="studio-youtube-url" type="url" placeholder="Paste a YouTube link…" required><button aria-label="Open YouTube video">${glyph("arrow", 18)}</button></form><button class="text-button explore-sessions" data-view="songs">Explore YouTube sessions ${glyph("arrow", 13)}</button></section></div><div class="studio-bottom"><span>${glyph("headphones", 14)} Let the outside world wait a little.</span><span>Audio context: <span id="sample-rate">${engine.ctx ? engine.ctx.sampleRate / 1000 + " kHz" : "initializing"}</span> <i>·</i> No API keys. Just music.</span></div>`;
}
function piano() {
  const start = 12 * (state.octave + 1),
    whites = Array.from(
      { length: 22 },
      (_, i) => start + Math.floor(i / 7) * 12 + [0, 2, 4, 5, 7, 9, 11][i % 7],
    ).filter((n) => n <= 108).length;
  let html = "";
  for (let i = 0; i < whites; i++) {
    const pc = [0, 2, 4, 5, 7, 9, 11][i % 7],
      midi = start + Math.floor(i / 7) * 12 + pc;
    if (midi > 108) break;
    const key = Object.entries(pianoMap)
      .find(([, offset]) => start + offset === midi)?.[0]
      ?.replace("Key", "")
      .replace("Semicolon", ";")
      .replace("Quote", "'");
    html += `<button class="white-key" data-midi="${midi}" aria-label="${noteName(midi)}"><span>${NOTE_NAMES[pc]}<small>${Math.floor(midi / 12) - 1}</small></span>${state.mode === "notes" && key ? `<kbd>${esc(key)}</kbd>` : state.mode === "chords" && i < 7 ? `<kbd>${NOTE_NAMES[pc]}</kbd>` : ""}</button>`;
    if ([0, 2, 5, 7, 9].includes(pc) && i < whites - 1 && midi < 108) {
      const blackKey = Object.entries(pianoMap)
        .find(([, offset]) => start + offset === midi + 1)?.[0]
        ?.replace("Key", "");
      html += `<button class="black-key" style="--key-position:${((i + 1) / whites) * 100}%" data-midi="${midi + 1}" aria-label="${noteName(midi + 1)}"><span>${NOTE_NAMES[pc]}♯</span>${state.mode === "notes" && blackKey ? `<kbd>${blackKey}</kbd>` : ""}</button>`;
    }
  }
  return html;
}
const lessons = [
  {
    name: "The feel of a piano",
    root: 0,
    quality: "major",
    desc: "A real piano’s hammer strikes a string when you press a key. The sound decays naturally while you hold it. Release the key and a damper stops the string; the sustain pedal lifts the dampers so it can ring.",
    task: "Play C major. Listen to its attack, then its natural decay. Try again with Sustain enabled.",
  },
  {
    name: "Build a major chord",
    root: 2,
    quality: "major",
    desc: "A major triad has a root, a major third, and a perfect fifth. D major uses D, F♯, and A. In chord mode, one letter plays the three notes together.",
    task: "Press D, hold it briefly, then release. Hear the dampers close.",
  },
  {
    name: "Change the colour",
    root: 2,
    quality: "minor",
    desc: "A minor chord lowers the third by one semitone. D minor is D, F, A. The root and fifth stay the same; the feeling changes.",
    task: "Hold Shift and press D. Compare it to D major.",
  },
  {
    name: "The notes in between",
    root: 3,
    quality: "major",
    desc: "A sharp raises the root one semitone. D♯ major is D♯, G, A♯ (enharmonic spelling). In piano mode, the black keys are individual notes.",
    task: "Hold Space and press D in chord mode to play D♯ major.",
  },
  {
    name: "A little jazz harmony",
    root: 2,
    quality: "min7",
    desc: "A minor seventh chord adds a fourth note, ten semitones above the root. Dm7 contains D, F, A, and C. It moves naturally to G, then Cmaj7.",
    task: "Click Dm7 below, then try the Jazz progression in the studio.",
  },
  {
    name: "Keep the pulse",
    root: 0,
    quality: "major",
    desc: "Count 1, 2, 3, 4 at a steady tempo. Change chord on the next 1. Slow practice builds better timing than rushing through a difficult passage.",
    task: "Play C, then open the practice room at 60 BPM. Aim for the first beat of each bar.",
  },
];
function learn() {
  const l = lessons[state.lesson],
    done = read("playboard-lessons", {});
  return `${header("Learn to play", "Understand the instrument. Build confidence one session at a time.")}<div class="learn-layout"><section class="content-card lesson-main"><div class="eyebrow">FOUNDATIONS / LESSON ${String(state.lesson + 1).padStart(2, "0")}</div><h2>${l.name}</h2><p class="large-copy">${l.desc}</p><div class="lesson-demo"><button class="demo-chord" data-root="${l.root}" data-quality="${l.quality}" data-chord="${chordName(l.root, l.quality)}">${chordName(l.root, l.quality)}<small>PLAY CHORD</small></button><div><h3>Your turn.</h3><p>${l.task}</p><span id="lesson-feedback">Take your time. Listen closely.</span></div></div><div class="lesson-actions"><button id="previous-lesson" class="secondary" ${state.lesson === 0 ? "disabled" : ""}>← Previous</button><span>${state.lesson + 1} / ${lessons.length}</span><button class="primary" id="next-lesson">${state.lesson === lessons.length - 1 ? "Enter the studio" : "Next lesson →"}</button></div></section><aside class="content-card lesson-list"><div class="eyebrow">YOUR LEARNING PATH</div>${lessons.map((l, i) => `<button data-lesson="${i}" class="${i === state.lesson ? "active" : ""}"><span>${done[i] ? glyph("check", 14) : String(i + 1).padStart(2, "0")}</span>${l.name}</button>`).join("")}<p>Less rushing. More listening.</p></aside></div>`;
}
function book() {
  return `${header("Chord book", "Explore the shapes behind the sounds. Listen, learn, and make them yours.")}<section class="content-card"><div class="book-controls"><label class="search">${glyph("search", 17)}<input id="chord-search" aria-label="Search chords" placeholder="Find a chord · Dm7, C, F♯…" value="${esc(state.search)}"></label><label class="compact-select">CHORD TYPE<select id="book-quality" aria-label="Chord type"><option value="all">All types</option>${Object.entries(
    QUALITIES,
  )
    .map(
      ([q, v]) =>
        `<option value="${q}" ${state.bookQuality === q ? "selected" : ""}>${v.label}</option>`,
    )
    .join(
      "",
    )}</select></label><label class="compact-select">INVERSION<select id="inversion" aria-label="Chord inversion">${["Root position", "1st inversion", "2nd inversion"].map((n, i) => `<option value="${i}" ${state.inversion === i ? "selected" : ""}>${n}</option>`).join("")}</select></label></div><div class="chord-grid" id="chord-grid">${chordGrid()}</div></section>`;
}
function chordGrid() {
  return (
    NOTE_NAMES.flatMap((r, root) =>
      Object.entries(QUALITIES).map(([q, quality]) => ({
        r,
        root,
        q,
        quality,
      })),
    )
      .filter(
        ({ root, q, quality }) =>
          (state.bookQuality === "all" || q === state.bookQuality) &&
          (chordName(root, q) + " " + NOTE_NAMES[root] + " " + quality.label)
            .toLowerCase()
            .includes(state.search.toLowerCase().replace("#", "♯")),
      )
      .map(({ r, root, q, quality }) => {
        const notes = chordNotes(
          root,
          q,
          state.octave,
          state.inversion,
          state.transpose,
        );
        return `<button class="book-chord" data-root="${root}" data-quality="${q}" data-chord="${chordName(root, q)}"><div><strong>${r}<em>${quality.suffix}</em></strong>${glyph("play", 15)}</div><small>${quality.label.toUpperCase()}</small><div class="mini-piano">${Array.from({ length: 12 }, (_, i) => `<i class="${notes.map((n) => n % 12).includes(i) ? "lit" : ""} ${[1, 3, 6, 8, 10].includes(i) ? "dark" : ""}"></i>`).join("")}</div><p>${notes.map(noteName).join(" · ")}</p></button>`;
      })
      .join("") ||
    '<div class="empty-state">No chords found. Try a root such as D or a quality such as minor.</div>'
  );
}
const regions = [
  ["Pakistani", "Pakistani pop karaoke instrumental"],
  ["Western", "pop piano karaoke backing track"],
  ["Bangladeshi", "Bangla song karaoke instrumental"],
  ["Indian", "Hindi Indian pop karaoke piano"],
];
function youtubeForm(id) {
  return `<form id="${id}" class="library-youtube-form"><label class="sr-only" for="${id}-input">YouTube video URL</label><span>${glyph("youtube", 20)}</span><input id="${id}-input" type="url" placeholder="Paste a YouTube video link" required><button class="primary">Open session ${glyph("arrow", 14)}</button></form>`;
}
function songs() {
  return `${header("YouTube sessions", "Your piano. Their music. One shared moment.")}<section class="youtube-intro"><div class="eyebrow">THE WORLD IS YOUR BACKING BAND</div><h2>Bring a song.<br>Make room for your sound.</h2><p>Find a karaoke, instrumental, or backing track on YouTube.<br>Paste its link here and play along on the sampled grand.</p>${youtubeForm("library-youtube-form")}<div class="youtube-disclosure">Video plays through YouTube, with its controls and creator credits intact. No API key. Connecting uses YouTube and Noembed for video details.</div></section><section class="discovery-section"><div class="section-heading"><div><div class="eyebrow">FIND YOUR NEXT SESSION</div><h2>Four corners. Endless inspiration.</h2></div><span class="muted">Search directly on YouTube ${glyph("arrow", 13)}</span></div><div class="region-grid">${regions.map(([r, query], i) => `<a class="region-card region-${i}" href="https://www.youtube.com/results?search_query=${encodeURIComponent(query)}" target="_blank" rel="noopener"><span class="region-number">0${i + 1}</span><div class="region-art">${["⌁", "◒", "◌", "✳"][i]}</div><div><span class="tiny-label">KARAOKE & BACKING TRACKS</span><h3>${r}</h3><p>Explore on YouTube ${glyph("arrow", 14)}</p></div></a>`).join("")}</div><p class="discovery-note">These links open YouTube search. Results and availability come from YouTube; this is not a live chart or a curated artist catalog.</p></section><section class="recent-section"><div class="section-heading"><div><div class="eyebrow">PICK UP WHERE YOU LEFT OFF</div><h2>Recently played.</h2></div><span class="muted">Saved on this browser</span></div><div id="recent-videos">${recentVideos()}</div></section><details class="local-section"><summary>Prefer your own audio? Open the local practice player <span>+</span></summary><div class="local-inner"><p>Load audio and optional timed LRC lyrics from your device. Files stay on your device.</p><div class="karaoke-upload"><label class="secondary">Open audio<input type="file" id="karaoke-file" accept="audio/*" hidden></label><label class="secondary">Add timed lyrics (.lrc)<input type="file" id="lyrics-file" accept=".lrc,text/plain" hidden></label></div><strong id="karaoke-title">${esc(localName || "No file loaded")}</strong><div id="karaoke-lyric">Your music. Your moment.</div><div class="karaoke-controls"><button class="primary" id="karaoke-play">${localAudio.paused ? "▶ Play track" : "Ⅱ Pause track"}</button><input id="karaoke-seek" aria-label="Track position" type="range" min="0" max="${localAudio.duration || 1}" step=".1" value="${localAudio.currentTime}"><span id="karaoke-time">${format(localAudio.currentTime)} / ${format(localAudio.duration)}</span><label>Speed<select id="karaoke-speed" aria-label="Local playback speed">${[0.5, 0.75, 1, 1.25].map((n) => `<option value="${n}" ${localAudio.playbackRate === n ? "selected" : ""}>${n}×</option>`).join("")}</select></label></div></div></details>`;
}
function recentVideos() {
  return youtube.history.length
    ? `<div class="recent-grid">${youtube.history.map((v) => `<button class="recent-video" data-video="${v.id}"><img src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" alt="" loading="lazy"><span><strong>${esc(v.title)}</strong><small>Uploaded by ${esc(v.author)}</small></span>${glyph("play", 17)}</button>`).join("")}</div>`
    : '<div class="empty-history">' +
        glyph("youtube", 25) +
        "<div><strong>Your sessions will feel at home here.</strong><p>Open a YouTube video above. Its title and uploader will appear here.</p></div></div>";
}
function progress() {
  const completed = Object.keys(read("playboard-lessons", {})).length;
  return `${header("My progress", "The small sessions add up. This is your space to see it.")}<div class="stat-grid">${[
    [state.stats.chords, "Chords played", "Each one adds a little confidence."],
    [
      state.stats.sessions,
      "Practice sessions",
      "A little consistency goes a long way.",
    ],
    [
      state.stats.correct,
      "Well-timed bars",
      "The right chord on the first beat.",
    ],
    [completed, "Lessons explored", "Listen. Try it. Make it yours."],
  ]
    .map(
      ([n, l, p]) =>
        `<article class="content-card stat">${glyph("spark", 24)}<strong>${n}</strong><h2>${l}</h2><p>${p}</p></article>`,
    )
    .join(
      "",
    )}</div><div class="progress-note"><span>✳</span><h2>Your pace is the right pace.</h2><p>Progress is saved in this browser. No streaks to keep, no pressure to rush.<br>Just you, the piano, and the next little thing you learn.</p><button class="primary" data-view="studio">Spend a little time in the studio ${glyph("arrow", 14)}</button></div>`;
}
function recordResult() {
  const count = engine.recorded.filter((e) => e.type === "on").length;
  return `<div class="record-result"><div><span class="take-indicator"></span><strong>Take 01</strong><span>${count} notes · ${format(engine.recordDuration)} · Piano only</span></div><div><button class="text-button" id="replay">${glyph("play", 13)} Replay</button><button class="secondary" id="download">${glyph("download", 13)} Export dry piano WAV</button></div></div>`;
}
function render() {
  releaseAll();
  stopPractice();
  $("#app").innerHTML =
    sidebar() +
    `<main class="main-content">${{ studio, book, songs, learn, progress }[state.view]()}</main>`;
  bind();
  engineStatus();
  updateKeys();
  updateDock();
}
function navigate(view) {
  state.view = view;
  state.search = "";
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
}
function bindChords() {
  $$("[data-root]").forEach(
    (b) =>
      (b.onclick = () =>
        registerChord(Number(b.dataset.root), b.dataset.quality, {
          autoRelease: 1.5,
        })),
  );
}
function bind() {
  $$("[data-view]").forEach(
    (b) =>
      (b.onclick = (e) => {
        e.preventDefault();
        navigate(b.dataset.view);
      }),
  );
  $("#help")?.addEventListener("click", showGuide);
  $("#shortcuts")?.addEventListener("click", showGuide);
  $("#enable-audio")?.addEventListener("click", enableAudio);
  $("#panic")?.addEventListener("click", panic);
  bindChords();
  $$("[data-mode]").forEach(
    (b) =>
      (b.onclick = () => {
        state.mode = b.dataset.mode;
        render();
      }),
  );
  $("#tone")?.addEventListener("change", (e) => {
    engine.tone = e.target.value;
    $("#instrument-title").innerHTML =
      `${{ concert: "Concert Grand", felt: "Soft Felt", warm: "Warm Room" }[engine.tone]} <span>01</span>`;
  });
  for (const [id, set] of [
    ["volume", (v) => engine.setVolume(v / 100)],
    ["reverb", (v) => engine.setReverb(v / 100)],
    ["brightness", (v) => engine.setBrightness(v)],
    ["velocity", (v) => (engine.velocity = v / 100)],
  ])
    $("#" + id)?.addEventListener("input", (e) => {
      const v = Number(e.target.value);
      state[id] = v;
      $("#" + id + "-value").textContent = v;
      set(v);
    });
  for (const [id, delta] of [
    ["octave-down", -1],
    ["octave-up", 1],
  ])
    $("#" + id)?.addEventListener("click", () => {
      state.octave = Math.max(1, Math.min(6, state.octave + delta));
      render();
    });
  $("#voicing")?.addEventListener(
    "change",
    (e) => (state.voicing = e.target.value),
  );
  $("#transpose")?.addEventListener("change", (e) => {
    releaseAll();
    state.transpose = Number(e.target.value);
  });
  $("#sustain")?.addEventListener("click", () => setPedal(!state.pedal));
  $("#midi-connect")?.addEventListener("click", connectMIDI);
  $$("[data-midi]").forEach((b) => {
    b.onpointerdown = (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      if (pointerHeld.has(e.pointerId)) releaseHeld(pointerHeld, e.pointerId);
      triggerNote(Number(b.dataset.midi), e.pointerId, pointerHeld);
    };
    b.onpointermove = (e) => {
      if (!pointerHeld.has(e.pointerId)) return;
      const next = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest("[data-midi]");
      if (
        next &&
        Number(next.dataset.midi) !== pointerHeld.get(e.pointerId).notes[0]
      ) {
        releaseHeld(pointerHeld, e.pointerId);
        triggerNote(Number(next.dataset.midi), e.pointerId, pointerHeld);
      }
    };
    b.onpointerup = (e) => releaseHeld(pointerHeld, e.pointerId);
    b.onpointercancel = (e) => releaseHeld(pointerHeld, e.pointerId);
    b.onlostpointercapture = (e) => releaseHeld(pointerHeld, e.pointerId);
    b.onclick = (e) => {
      if (e.detail === 0) {
        triggerNote(Number(b.dataset.midi), "accessible", pointerHeld);
        setTimeout(() => releaseHeld(pointerHeld, "accessible"), 600);
      }
    };
  });
  $("#bpm")?.addEventListener("change", (e) => {
    const playing = state.practicing;
    stopPractice();
    state.bpm = Math.max(40, Math.min(180, Number(e.target.value) || 80));
    e.target.value = state.bpm;
    if (playing) startPractice();
    if (state.metro) setMetro(true);
  });
  $("#tap-tempo")?.addEventListener("click", () => {
    const now = performance.now();
    if (taps.length && now - taps.at(-1) > 2000) taps.length = 0;
    taps.push(now);
    if (taps.length > 6) taps.shift();
    if (taps.length > 1) {
      state.bpm = Math.max(
        40,
        Math.min(
          180,
          Math.round(60000 / ((taps.at(-1) - taps[0]) / (taps.length - 1))),
        ),
      );
      $("#bpm").value = state.bpm;
      if (state.practicing) {
        stopPractice();
        startPractice();
      }
      if (state.metro) setMetro(true);
    }
  });
  $("#metronome")?.addEventListener("click", () => setMetro(!state.metro));
  $("#practice-toggle")?.addEventListener("click", startPractice);
  $$("[data-genre]").forEach(
    (b) =>
      (b.onclick = () => {
        state.genre = b.dataset.genre;
        state.step = 0;
        render();
      }),
  );
  $("#chord-search")?.addEventListener("input", (e) => {
    state.search = e.target.value;
    $("#chord-grid").innerHTML = chordGrid();
    bindChords();
  });
  $("#book-quality")?.addEventListener("change", (e) => {
    state.bookQuality = e.target.value;
    $("#chord-grid").innerHTML = chordGrid();
    bindChords();
  });
  $("#inversion")?.addEventListener("change", (e) => {
    state.inversion = Number(e.target.value);
    $("#chord-grid").innerHTML = chordGrid();
    bindChords();
  });
  $$("[data-lesson]").forEach(
    (b) =>
      (b.onclick = () => {
        state.lesson = Number(b.dataset.lesson);
        render();
      }),
  );
  $("#previous-lesson")?.addEventListener("click", () => {
    state.lesson = Math.max(0, state.lesson - 1);
    render();
  });
  $("#next-lesson")?.addEventListener("click", () => {
    if (state.lesson === lessons.length - 1) navigate("studio");
    else {
      state.lesson++;
      render();
    }
  });
  $("#record")?.addEventListener("click", async () => {
    if (engine.recording) {
      engine.stopRecording();
      clearInterval(recordTimer);
      render();
      return;
    }
    await enableAudio();
    if (engine.status !== "ready") return;
    engine.startRecording();
    render();
    recordTimer = setInterval(() => {
      const el = $("#record-time");
      if (el)
        el.textContent = format(engine.ctx.currentTime - engine.recordOrigin);
      if (engine.ctx.currentTime - engine.recordOrigin >= 600) {
        engine.stopRecording();
        clearInterval(recordTimer);
        render();
        toast(
          "Ten-minute recording saved. Start a new take when you’re ready.",
        );
      }
    }, 250);
  });
  $("#replay")?.addEventListener("click", async () => {
    await enableAudio();
    engine.replay();
    toast("Playing your recorded piano take.");
  });
  $("#download")?.addEventListener("click", async () => {
    const button = $("#download");
    button.disabled = true;
    button.textContent = "Rendering WAV…";
    try {
      const blob = await engine.exportWav();
      const a = document.createElement("a"),
        url = URL.createObjectURL(blob);
      a.href = url;
      a.download = "playboard-piano-take.wav";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast(e.message);
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.innerHTML = `${glyph("download", 13)} Export dry piano WAV`;
      }
    }
  });
  for (const id of ["studio-youtube-form", "library-youtube-form"])
    $("#" + id)?.addEventListener("submit", (e) => {
      e.preventDefault();
      openVideo($("#" + id + " input").value);
    });
  bindRecent();
  bindLocal();
}
async function connectMIDI() {
  if (!navigator.requestMIDIAccess) {
    toast("Web MIDI needs Chrome or Edge on HTTPS or localhost.");
    return;
  }
  try {
    state.midi = await navigator.requestMIDIAccess({ sysex: false });
    const attach = () => {
      let names = [];
      for (const input of state.midi.inputs.values()) {
        names.push(input.name);
        input.onmidimessage = (e) => {
          const [status, note, vel] = e.data,
            type = status & 0xf0,
            key = `${input.id}:${status & 15}:${note}`;
          if (type === 0x90 && vel > 0) {
            releaseHeld(pianoHeld, key);
            triggerNote(note, key, pianoHeld, vel / 127);
          } else if (type === 0x80 || (type === 0x90 && vel === 0))
            releaseHeld(pianoHeld, key);
          else if (type === 0xb0 && note === 64) setPedal(vel >= 64);
        };
      }
      state.midiName = names.join(", ");
      const b = $("#midi-connect");
      if (b)
        b.innerHTML =
          glyph("midi", 15) +
          " " +
          esc(state.midiName || "No MIDI keyboard found");
    };
    attach();
    state.midi.onstatechange = attach;
    await enableAudio();
    toast(
      state.midiName
        ? "MIDI connected. Velocity and pedal are active."
        : "Connect a USB MIDI keyboard; it will appear automatically.",
    );
  } catch {
    toast(
      "MIDI access was declined or is unavailable. Your computer keyboard still works.",
    );
  }
}
function showGuide() {
  const root = $("#modal-root");
  root.innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="guide-title"><button id="close-modal" class="icon-button close-modal" aria-label="Close guide">${glyph("close", 20)}</button><div class="eyebrow">GET TO KNOW YOUR INSTRUMENT</div><h2 id="guide-title">Two ways to play.<br>A little more expression.</h2><div class="guide-columns"><div><h3>Chord mode</h3><p>Letter keys A–G play major chords. Shift makes them minor. Follow genre adds sevenths when the selected progression uses them; select Triads for standard major/minor shortcuts.</p><div class="shortcut-row"><kbd>D</kbd><span>D major · D, F♯, A</span></div><div class="shortcut-row"><kbd>Shift + D</kbd><span>D minor · D, F, A</span></div><div class="shortcut-row"><kbd>Space + D</kbd><span>D♯ major · D♯, G, A♯</span></div><div class="shortcut-row"><kbd>Space + Shift + D</kbd><span>D♯ minor</span></div></div><div><h3>Piano mode</h3><p>Play single notes, like a real keyboard.</p><div class="piano-map"><kbd>A</kbd><kbd>W</kbd><kbd>S</kbd><kbd>E</kbd><kbd>D</kbd><kbd>F</kbd><kbd>T</kbd><kbd>G</kbd><kbd>Y</kbd><kbd>H</kbd><kbd>U</kbd><kbd>J</kbd></div><p>C · C♯ · D · D♯ · E · F · F♯ · G · G♯ · A · A♯ · B</p><div class="shortcut-row"><kbd>Space</kbd><span>Hold sustain pedal</span></div><div class="shortcut-row"><kbd>Esc</kbd><span>Stop all notes</span></div></div></div><div class="guide-note">A computer key has no pressure sensitivity. Use Touch for a softer or stronger strike, or connect a MIDI keyboard for velocity-sensitive playing. Release keys to damp notes; Sustain lets released notes ring. Click back on the piano after using YouTube’s controls.</div><button id="got-it" class="primary">Back to the keys ${glyph("arrow", 15)}</button></section></div>`;
  const close = () => {
    root.innerHTML = "";
    $("#help")?.focus();
  };
  $("#close-modal").onclick = close;
  $("#got-it").onclick = close;
  $(".modal-backdrop").onclick = (e) => {
    if (e.target === e.currentTarget) close();
  };
  $("#close-modal").focus();
  $(".modal").addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const items = [
        ...$(".modal").querySelectorAll("button,a[href],input,select"),
      ],
      first = items[0],
      last = items.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}
function dockShell() {
  document.body.insertAdjacentHTML(
    "beforeend",
    `<aside id="media-dock" class="media-dock" aria-label="YouTube practice player" hidden><div class="dock-top"><span>${glyph("youtube", 18)} YOUTUBE SESSION</span><button id="dock-close" class="icon-button" aria-label="Close YouTube session">${glyph("close", 17)}</button></div><div class="youtube-player-wrap"><div id="youtube-frame"></div></div><div class="dock-body"><span class="tiny-label">NOW IN YOUR SESSION</span><h2 id="video-title"></h2><div class="creator-credit"><span class="creator-avatar">${glyph("youtube", 15)}</span><div><small>UPLOADED BY</small><a id="video-author" target="_blank" rel="noopener"></a></div>${glyph("check", 13)}</div><a id="video-original" class="original-link" target="_blank" rel="noopener">Watch original on YouTube ${glyph("arrow", 13)}</a><p id="video-error" role="status"></p><div class="video-transport"><button id="video-play" class="round-play" aria-label="Play YouTube video">${glyph("play", 17)}</button><input id="video-seek" type="range" aria-label="YouTube position" min="0" max="1" value="0" step=".1"><span id="video-time">0:00 / 0:00</span></div><div class="video-mix"><label>${glyph("volume", 16)}<input id="video-volume" type="range" aria-label="YouTube volume" min="0" max="100" value="55"></label><label>SPEED<select id="video-speed" aria-label="YouTube playback speed"><option value=".5">0.5×</option><option value=".75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option></select></label></div><div class="loop-panel"><div><span class="tiny-label">REPEAT A LITTLE. LEARN A LOT.</span><strong>A–B practice loop</strong></div><div class="loop-buttons"><button id="loop-a">Set A</button><button id="loop-b">Set B</button><button id="loop-clear" aria-label="Clear loop">${glyph("refresh", 14)}</button></div><p id="loop-status">Set a start, then an end while the video plays.</p></div><div class="dock-footnote">The video and uploader credit stay visible while you play. Audio stays on YouTube.</div><button id="back-to-piano" class="secondary">Back to the piano ${glyph("piano", 15)}</button></div></aside>`,
  );
  $("#dock-close").onclick = () => {
    youtube.close();
    state.dock = false;
    updateDock();
  };
  $("#back-to-piano").onclick = () => navigate("studio");
  $("#video-play").onclick = () => {
    try {
      localAudio.pause();
      youtube.toggle();
    } catch (e) {
      toast(e.message);
    }
  };
  $("#video-seek").oninput = (e) => youtube.seek(Number(e.target.value));
  $("#video-volume").oninput = (e) => youtube.setVolume(Number(e.target.value));
  $("#video-speed").onchange = (e) => {
    try {
      youtube.setRate(Number(e.target.value));
    } catch (error) {
      e.target.value = String(youtube.rate);
      toast(error.message);
    }
  };
  $("#loop-a").onclick = () => youtube.setA();
  $("#loop-b").onclick = () => {
    try {
      youtube.setB();
    } catch (e) {
      toast(e.message);
    }
  };
  $("#loop-clear").onclick = () => youtube.clearLoop();
}
async function openVideo(url) {
  try {
    if (!videoId(url)) throw Error("Paste a valid YouTube video link.");
    state.dock = true;
    updateDock();
    localAudio.pause();
    await youtube.load(url);
    updateDock();
  } catch (e) {
    toast(e.message);
  }
}
youtube.addEventListener("change", () => {
  if (youtube.id) updateDock();
  const recent = $("#recent-videos");
  if (recent) {
    recent.innerHTML = recentVideos();
    bindRecent();
  }
});
youtube.addEventListener("time", updateVideoTime);
function updateDock() {
  const dock = $("#media-dock");
  if (!dock) return;
  dock.hidden = !state.dock;
  document.body.classList.toggle("with-dock", state.dock);
  if (!youtube.id) return;
  $("#video-title").textContent = youtube.title;
  const author = $("#video-author");
  author.textContent =
    youtube.author || "Creator credit available in the YouTube player";
  if (youtube.authorUrl) author.href = youtube.authorUrl;
  else author.removeAttribute("href");
  $("#video-original").href = "https://www.youtube.com/watch?v=" + youtube.id;
  $("#video-error").textContent =
    youtube.error ||
    (youtube.status === "loading" ? "Connecting to YouTube…" : "");
  $("#video-play").innerHTML = glyph(youtube.playing ? "pause" : "play", 17);
  $("#video-play").setAttribute(
    "aria-label",
    youtube.playing ? "Pause YouTube video" : "Play YouTube video",
  );
  $("#loop-a").textContent =
    youtube.loopA === null ? "Set A" : "A " + format(youtube.loopA);
  $("#loop-b").textContent =
    youtube.loopB === null ? "Set B" : "B " + format(youtube.loopB);
  $("#loop-status").textContent =
    youtube.loopB !== null
      ? "Loop active · " + format(youtube.loopA) + " — " + format(youtube.loopB)
      : youtube.loopA !== null
        ? "Start set. Play ahead, then set B."
        : "Set a start, then an end while the video plays.";
  $("#video-speed").value = String(youtube.rate);
  updateVideoTime();
}
function updateVideoTime() {
  if (!$("#video-time")) return;
  $("#video-time").textContent =
    format(youtube.position) + " / " + format(youtube.duration);
  const seek = $("#video-seek");
  if (document.activeElement !== seek) {
    seek.max = youtube.duration || 1;
    seek.value = youtube.position;
  }
}
function bindRecent() {
  $$("[data-video]").forEach(
    (b) =>
      (b.onclick = () =>
        openVideo("https://www.youtube.com/watch?v=" + b.dataset.video)),
  );
}
function updateLocal() {
  const seek = $("#karaoke-seek");
  if (!seek) return;
  seek.max = localAudio.duration || 1;
  seek.value = localAudio.currentTime;
  $("#karaoke-time").textContent =
    format(localAudio.currentTime) + " / " + format(localAudio.duration);
  $("#karaoke-lyric").textContent =
    lyrics.filter((l) => l.time <= localAudio.currentTime).at(-1)?.text ||
    "Your music. Your moment.";
}
localAudio.addEventListener("timeupdate", updateLocal);
localAudio.addEventListener("ended", () => {
  if ($("#karaoke-play")) $("#karaoke-play").textContent = "▶ Play track";
});
function bindLocal() {
  $("#karaoke-file")?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    localAudio.pause();
    if (localUrl) URL.revokeObjectURL(localUrl);
    localUrl = URL.createObjectURL(file);
    localAudio.src = localUrl;
    localName = file.name;
    lyrics = [];
    $("#karaoke-title").textContent = file.name;
    $("#karaoke-lyric").textContent = "Your music. Your moment.";
    $("#karaoke-play").textContent = "▶ Play track";
  });
  $("#lyrics-file")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    lyrics = [];
    for (const line of text.split(/\r?\n/)) {
      const tags = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
      for (const tag of tags)
        lyrics.push({
          time: Number(tag[1]) * 60 + Number(tag[2]),
          text: line.replace(/\[[^\]]*\]/g, "").trim(),
        });
    }
    lyrics.sort((a, b) => a.time - b.time);
    toast(
      lyrics.length
        ? `${lyrics.length} timed lyric lines loaded`
        : "No timestamps found. Use [00:12.50] lyric text.",
    );
    updateLocal();
  });
  $("#karaoke-play")?.addEventListener("click", async () => {
    if (!localAudio.src) {
      toast("Open an audio file first.");
      return;
    }
    if (localAudio.paused) {
      try {
        youtube.close();
        await localAudio.play();
        $("#karaoke-play").textContent = "Ⅱ Pause track";
      } catch {
        toast("This audio format could not play. Try MP3 or WAV.");
      }
    } else {
      localAudio.pause();
      $("#karaoke-play").textContent = "▶ Play track";
    }
  });
  $("#karaoke-seek")?.addEventListener("input", (e) => {
    if (Number.isFinite(localAudio.duration))
      localAudio.currentTime = Number(e.target.value);
  });
  $("#karaoke-speed")?.addEventListener(
    "change",
    (e) => (localAudio.playbackRate = Number(e.target.value)),
  );
}
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if ($("#modal-root").children.length) {
      $("#modal-root").innerHTML = "";
      return;
    }
    panic();
    return;
  }
  if (
    e.ctrlKey ||
    e.metaKey ||
    e.altKey ||
    ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName) ||
    e.target.isContentEditable ||
    $("#modal-root").children.length
  )
    return;
  if (e.code === "Space") {
    e.preventDefault();
    spaceHeld = true;
    if (state.mode === "notes") engine.setPedal(true);
    return;
  }
  if (e.repeat) return;
  if (state.mode === "notes") {
    if (!Object.hasOwn(pianoMap, e.code)) return;
    e.preventDefault();
    triggerNote(12 * (state.octave + 1) + pianoMap[e.code], e.code, pianoHeld);
    return;
  }
  const letter = e.key.toUpperCase();
  if (!["A", "B", "C", "D", "E", "F", "G"].includes(letter)) return;
  e.preventDefault();
  const root = (NOTE_NAMES.indexOf(letter) + (spaceHeld ? 1 : 0)) % 12;
  let quality = e.shiftKey ? "minor" : "major";
  if (state.voicing === "sevenths") quality = e.shiftKey ? "min7" : "maj7";
  else if (state.voicing === "genre") {
    const match = progressions[state.genre].find(
      ([r, q]) =>
        rootIndex(r) === root &&
        (e.shiftKey ? q.startsWith("min") : !q.startsWith("min")),
    );
    if (match) quality = match[1];
  }
  registerChord(root, quality, { heldKey: e.code });
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    spaceHeld = false;
    if (state.mode === "notes") engine.setPedal(state.pedal);
  }
  releaseHeld(chordHeld, e.code);
  releaseHeld(pianoHeld, e.code);
});
window.addEventListener("blur", releaseAll);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    releaseAll();
    stopPractice();
    setMetro(false);
    localAudio.pause();
  }
});
function meterFrame() {
  const amount = engine.meter();
  $$(".meter-bars i").forEach((el, i) =>
    el.classList.toggle("lit", amount > i / 16),
  );
  const count = $("#voice-count");
  if (count) count.textContent = engine.voices.size + " voices";
  requestAnimationFrame(meterFrame);
}
document.body.insertAdjacentHTML(
  "beforeend",
  '<div id="toast" role="status"></div><div id="modal-root"></div>',
);
dockShell();
render();
engine.load().catch(() => {});
requestAnimationFrame(meterFrame);
