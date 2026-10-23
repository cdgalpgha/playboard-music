# Playboard architecture

Playboard is a browser app for learning and playing piano. This document is the
contract the code follows. If code and this file disagree, one of them is a bug.

## 1. Principles

1. **One clock per session, one conversion layer.** Every time value inside the
   core is in *seconds of chart time* or *milliseconds of `performance.now()`*.
   Conversion between them lives in `core/transport.ts` and nowhere else.
2. **Pure core, thin shells.** Scoring, sync math, tempo maps, parsers and
   calibration math are plain TypeScript with no DOM or Web Audio access, so
   they are unit-tested in Node.
3. **The audio thread never waits on the UI thread.** Input handlers post to
   the sampler worklet before they touch React state.
4. **Compliance is structural.** YouTube is only reached through the official
   IFrame player and Data API (`src/video/`). No module fetches or decodes
   YouTube media. Content carries a license record and the catalog refuses
   entries without one.

## 2. Module map

```
src/
  main.tsx                 React root, router, service-worker registration
  app/                     Shell layout, routes, global banners, StartAudio gate
  core/                    Pure logic (unit tested)
    chart.ts               Chart / ChartNote / Measure types + helpers
    tempo-map.ts           ticks <-> seconds, beats <-> seconds
    transport.ts           chart-time clock (audio-master or video-master)
    scoring.ts             ScoringEngine: note matching, judgements, stats
    sync-map.ts            video seconds <-> chart seconds (anchors + offset)
    video-clock.ts         interpolated YouTube clock with drift correction
    calibration.ts         tap analysis -> audio/input offsets
    practice.ts            loop ranges, hand filters, wait-for-me gate
    transforms.ts          transpose, tempo scaling of charts
    keyboard-range.ts      key-count detection (25..88)
    midi-message.ts        raw MIDI bytes -> typed messages
  audio/
    engine.ts              AudioContext lifecycle, graph, device-change watch
    sampler-node.ts        main-thread proxy for the worklet (noteOn/Off/pedal)
    worklet/sampler.worklet.ts   AudioWorkletProcessor: voices, mixing
    worklet/dsp.ts         interpolation, envelopes, resonance bank (shared, testable)
    samples/manifest.ts    tier manifest types
    samples/loader.ts      progressive fetch -> cache -> decode -> worklet
    samples/cache.ts       IndexedDB blob cache for sample files
    metronome.ts           look-ahead click scheduler on the audio clock
    latency.ts             latency probes and the measurement report
    recorder.ts, wav.ts    record / replay / export WAV of free play
  input/
    input-bus.ts           single NoteEvent stream from every source
    midi-input.ts          Web MIDI access, device selection, hot-plug
    computer-keyboard.ts   QWERTY mapping
    mic/                   microphone capture + Basic Pitch worker
  formats/
    midi-file.ts           Standard MIDI File parser -> Chart
    musicxml.ts            MusicXML parser -> Chart (+ measure geometry)
  content/
    catalog.ts             CatalogProvider interface + registry
    builtin/               public-domain and original lessons/songs (JSON)
    user-library.ts        imported files, private, IndexedDB only
  video/
    youtube-api.ts         IFrame API loader + typed player adapter
    youtube-search.ts      Data API search (videoEmbeddable=true)
  storage/
    db.ts                  IndexedDB schema and migrations
    settings.ts, devices.ts, progress.ts
    sync/                  CloudSync interface + Supabase adapter
  render/
    keyboard-geometry.ts   88-key layout shared by canvas and DOM keyboard
    falling-notes.ts       Canvas 2D renderer (imperative, rAF driven)
  ui/                      React components and pages
public/
  samples/<tier>/          Opus sample files + manifest.json
  content/                 MusicXML files for built-in lessons and songs
```

## 3. Data flow

```
 MIDI / QWERTY / pointer / mic
            │  NoteEvent {kind,on|off|pedal, note, velocity, timeMs(perf), source}
            ▼
       input-bus ──────────────► sampler-node.post()  ─► AudioWorklet (sound)
            │  (synchronous fan-out, sound first)
            ├──────────────► keyboard highlight store (rAF-batched)
            ├──────────────► recorder
            └──────────────► session (scoring)  ◄── transport.chartTimeAt(timeMs - inputOffset)
                                   │
                                   ▼
                         ScoringEngine.judge() ─► session stats ─► progress DB
```

The input bus calls subscribers in a fixed order: sampler first, then
everything else. React components subscribe through a store that batches
updates to one per animation frame, so a ten-note chord causes one re-render.

## 4. Audio graph

```
 AudioWorkletNode "playboard-sampler"  (2 ch out)
   inside: voices (≤ 96) ─► sum ─► pedal resonance bank (when CC64 down) ─► soft clip
        │
        ▼
   pianoGain ─┬─► dry ─────────────┐
              └─► ConvolverNode ─► wet ─┤
 metronome (OscillatorNode clicks) ─────┤
                                        ▼
                                   masterGain ─► DynamicsCompressor (safety) ─► destination
                                        └─► AnalyserNode (meter, tests)
```

- `AudioContext({ latencyHint: 'interactive' })`, sample rate left to the
  device so no resampling happens at output.
- Samples are decoded on the main thread with `decodeAudioData`, converted to
  `Int16Array` per channel and *transferred* (zero copy) to the worklet. The
  worklet holds all PCM; nothing is shared, so cross-origin isolation is not
  required (it would break the YouTube iframe).
- A voice = one sample zone played at `rate = 2^((note - root)/12)` with
  4-point Hermite interpolation, an attack-free start, a velocity gain curve,
  and a release envelope. Note-off with the damper down starts a release and,
  for keys below the top damper, triggers the matching release sample.
- Velocity selects the sample layer; a continuous gain curve keeps loudness
  smooth across layer boundaries.
- Voice stealing: when 96 voices are active, steal the oldest released voice,
  then the quietest. A re-struck key fades its previous voice over 60 ms.
- Pedal resonance: while CC64 ≥ 64, a bank of 24 damped comb resonators tuned
  to piano partials receives a small send of the voice mix. Pedal down/up
  plays the recorded pedal mechanism samples.
- Scheduled notes (chart auto-play, replay) carry a `when` in context seconds;
  the worklet starts them at the exact frame inside the render quantum.

## 5. Sample tiers

| Tier   | Salamander layers | Zones | Format          | Download | PCM in worklet |
|--------|-------------------|-------|-----------------|----------|----------------|
| Lite   | v6, v13           | 60    | Opus 96 kbit/s  | 3.7 MB   | ~50 MB         |
| Studio | v3, v7, v11, v16  | 120   | Opus 160 kbit/s | 18 MB    | ~155 MB        |
| Compat | 1 (Tone.js MP3)   | 30    | MP3             | 2.0 MB   | ~45 MB         |

Zones are the 30 sampled notes (A0, then C/D♯/F♯/A per octave, C8); each
covers its root ±1 semitone. Shared by every Opus tier (`samples/common/`):
88 hammer-release noises, 46 string-resonance releases (Studio only) and 4
pedal-mechanism samples, 2.0 MB.

`scripts/build-samples.py` makes the tiers from the 48 kHz/24-bit source. It
removes the 8–15 ms of silence before each hammer attack (median audible
onset after trimming: 2.7 ms), cuts tails at −60 dB or a per-register cap,
and records each layer's level so velocity gain can be continuous.

Loading order: the middle layer of every zone, nearest middle C first, so the
whole keyboard plays after ~30 files; then the remaining layers. Until a
zone's ideal layer arrives the worklet uses the nearest loaded layer. Files
are cached in IndexedDB (`sampleFiles`, keyed by tier/file, checked against
the manifest SHA-256), so later visits need no network. Compat is used only
when the browser cannot decode Ogg Opus.

## 6. Time and sync model

### 6.1 Chart time
A chart stores note times in seconds at its notated tempo (`tempo-map.ts`
converts from ticks/divisions). Practice tempo `rate` (0.25–1.5) scales time:
the transport advances `rate` chart-seconds per real second.

### 6.2 Transport
`Transport` exposes `chartTimeAt(perfMs)` and `now()`. It has two masters:

- **Audio master** (no video). Anchors are taken from
  `AudioContext.getOutputTimestamp()`, which pairs a context time with the
  `performance.now()` at which that frame reaches the speaker. Chart notes
  for auto-play are scheduled in context time; visuals use the same mapping,
  so a note hits the line when it is heard.
- **Video master**. `VideoClock` polls `player.getCurrentTime()` every 100 ms.
  Between polls it extrapolates `t = t_poll + (perfNow - perf_poll)/1000 * playbackRate`.
  On each poll the error `e = polled - predicted` is corrected: `|e| > 300 ms`
  snaps (seek, buffering), smaller errors slew at 10% of the error per poll so
  motion stays smooth. `SyncMap` then converts video seconds to chart seconds.

### 6.3 Sync map
Per song and per video: a sorted list of anchors `(videoSec, chartSec)` plus
a manual `offsetMs`. Between anchors the map is piecewise-linear; outside, it
extends the nearest segment's slope (slope 1 with a single anchor). A beat map
of the video can be built by tapping along; taps are fitted to chart beats.
The inverse map is used for seeking the video to a chart position.

### 6.4 Input timing
MIDI `event.timeStamp` (perf ms) is the time of record. The scorer uses
`chartTimeAt(timeStamp - inputOffsetMs)`. Keyboard and pointer events use
`event.timeStamp` too. Microphone detections use the capture time of the
analysed frame minus the detector's reported latency.

### 6.5 Calibration
Per (input device, output device) pair:
1. **Audio pass**: clicks at known context times; the user taps along.
   Mean tap error = output latency not reported by the browser + input latency.
2. **Visual pass**: flashes at known frame times; mean error = display + input latency.
`inputOffsetMs` = visual mean (input path). `audioOffsetMs` = audio mean − visual mean.
Outliers (> 2.5 MAD) are dropped; at least 8 taps must remain.

## 7. Scoring

Each expected note can match one played note-on of the same pitch. For each
incoming note-on, the engine picks the unmatched expected note of that pitch
with the smallest |Δt| inside the miss window. Judgement by |Δt|:

| window   | |Δt|        |
|----------|-------------|
| perfect  | ≤ 40 ms     |
| good     | ≤ 90 ms     |
| early/late | ≤ 180 ms  |
| miss     | expected note passed by > 180 ms unmatched |

Windows scale with `1/rate` at slow tempos, capped at 1.5×. A note-on with no
candidate is a *wrong note*. Velocity consistency is 1 − (coefficient of
variation of velocities within each phrase of equal dynamic marking), averaged.
Session output: counts per judgement, accuracy %, signed timing histogram
(10 ms bins), per-measure error totals (weak spots), per-hand accuracy.

Wait-for-me mode replaces timing judgement: the transport pauses at each
onset group until every note in the group is held, and records pitch accuracy.

## 8. Content model

```ts
LicenseInfo = { kind: 'public-domain' | 'original' | 'user-private' | 'licensed',
                attribution: string, source?: string, licenseId?: string }
CatalogItem = { id, title, composer, arranger?, level, skills[], license, chartUrl, videos?: VideoRef[] }
Lesson      = { id, unit, title, goals[], steps: LessonStep[], chart: string /*MusicXML url*/, pass: PassCriteria }
```
`CatalogProvider` has `list()`, `get(id)`, `loadChart(id)`. Providers:
built-in (bundled, PD + original), user library (IndexedDB, never synced to
other users), and a stub interface for licensed catalogs that must supply a
license record per item.

## 9. Storage

IndexedDB database `playboard` (versioned, `storage/db.ts`):
`settings`, `devices` (calibration per device pair), `sampleFiles`,
`userSongs` (file blobs + parsed chart), `syncMaps`, `sessions` (scored runs),
`progress` (daily totals, streak, skill stats), `outbox` (cloud-sync queue).
Cloud sync is optional: when Supabase env vars are set and the user signs in,
`sessions`, `progress`, `syncMaps` and settings sync last-write-wins by
`updatedAt`. User-imported song files stay local unless the user opts in.

## 10. Platform handling

- **Web MIDI missing** (Safari, iOS): banner explains why; default input
  becomes microphone. Native path later: Capacitor + CoreMIDI plugin.
- **Bluetooth output**: `navigator.mediaDevices.ondevicechange` and
  `outputLatency` jumps trigger a warning recommending wired audio and
  re-calibration.
- **Autoplay policy**: the StartAudio gate resumes the AudioContext on a
  user gesture before any sound.

## 11. Testing

- Vitest (Node): core/*, formats/*, worklet dsp, storage logic with fake-indexeddb.
- Playwright (Chromium): mocked `navigator.requestMIDIAccess` device and
  mocked YouTube IFrame API; covers free play, a scored lesson and a synced
  play-along.
- Bench scripts: worklet render cost under load (`scripts/bench-sampler.ts`).
