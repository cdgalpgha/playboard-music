# Playboard

A calming, desktop-first piano and chord practice web app. Built with Vite, vanilla JavaScript, Web Audio, and locally bundled fonts. No account, backend, or API key is required.

## Development

Use Node.js 22.12+ or 24 LTS.

```sh
npm ci
npm run dev
```

In this cloud environment, use `npm ci --cache /workspace/.npm-cache` because the default home directory is read-only. The dev script listens on all interfaces, on port 5173 by default.

```sh
npm run build
npm run preview
npm test
```

Tests use Chromium at `/usr/bin/chromium` when available. Else install Playwright's browser with `npx playwright install chromium`. You can override the browser location with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

## Playing

- A–G: play a major chord rooted on that letter.
- Shift + letter: minor chord.
- Space + letter: sharp major chord.
- Space + Shift + letter: sharp minor chord.
- Click a piano key to play an individual note. Octave, instrument timbre, volume, sustain, and metronome are adjustable.
- Choose Pop, R&B, Jazz, Rock, Classical, or Lo-fi for a four-chord exercise. Practice schedules accompaniment and click sounds on the Web Audio clock. Match the highlighted chord at the start of each bar for feedback.
- Explore 24 major/minor chords and four introductory lessons.
- Record a chord performance, replay it, or export the notes and timing as JSON. This is chord-event recording, not a mixed audio export.
- In Song library, open your own audio file and optional LRC file for karaoke. Lyrics follow audio time, including seeking. Playback speed can be reduced for learning. Files stay on the device.
- LRC format: `[00:12.50]Your lyric here`. Multiple timestamps per line are supported.

## Scope

This is a working first version, not a complete Yousician replacement. Sounds are synthesized rather than sampled acoustic-piano recordings. Built-in backing tracks are original chord exercises, not licensed songs or chart listings. The regional labels describe practice collections, not artist catalogs. There is no AI service, chart API, vocal scoring, microphone pitch recognition, MIDI input, or automatic chord/lyric extraction. A current artist catalog requires an authorized data source and appropriate playback rights. Practice scores use chord identity and a beginner-friendly timing window, not a calibrated assessment of acoustic performance.

Progress is saved only in this browser's local storage. Playback requires an initial user gesture and an audio-capable browser; headphones are recommended. Browser/OS latency and background-tab throttling can affect perceived timing. Stop practice before changing tabs. This app targets PC/laptop keyboards.

## Validation

Six Playwright tests cover shortcut intervals, Web Audio output, progression timing, persistent progress, chord search, lessons, chord recording, regional filtering, local audio and synced lyrics, and desktop/narrow-screen overflow. `npm run build` produces the static deployment in `dist/`.
