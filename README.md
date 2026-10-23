# Playboard

A browser app for learning and playing piano: a sampled concert grand on an
AudioWorklet engine, Web MIDI input with velocity and sustain pedal, and
practice tools built around measured timing.

Status: all 7 milestones built (sound, practice, lessons, import, YouTube
play-along, microphone input, progress/sync/offline). See
`docs/reports/` for per-milestone reports, `ARCHITECTURE.md` for how it fits
together and `DECISIONS.md` for the choices behind it.

## Run on Windows

Install Node.js 24 LTS. Download the repository ZIP from GitHub, extract it, and
open the folder containing `package.json`. Click File Explorer's address bar,
type `cmd`, and press Enter. Run:

```bat
npm.cmd install
npm.cmd run dev
```

Open the address Vite prints (normally http://localhost:5173) in Chrome or Edge.
Keep the terminal open; stop with Ctrl+C.

## Development

Node.js 22.12+ or 24 LTS.

```sh
npm ci
npm run dev            # dev server on :5173
npm test               # unit tests (Vitest)
npm run test:e2e       # end-to-end tests (Playwright + Chromium, mocked MIDI)
npm run perf:sampler   # sampler render-cost benchmark
npm run build          # verify sample hashes, typecheck, production build
npm run preview        # serve dist/
```

Playwright uses `/opt/pw-browsers/chromium` when present, or
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

Web MIDI needs a secure context: use `localhost` or HTTPS. Chrome and Edge
support it; Safari and iOS browsers do not (the app tells you so and falls back
to on-screen and computer-keyboard input).

## The piano

Samples are the Salamander Grand Piano V3 by Alexander Holm (Yamaha C5,
48 kHz/24-bit), CC BY 3.0. Credits are in the app's About page.

| Tier | Velocity layers | Download | Memory |
|---|---|---|---|
| Lite | 2 | 3.7 MB + 2.0 MB shared | ~50 MB |
| Studio | 4 + string-resonance releases | 18 MB + 2.0 MB shared | ~155 MB |
| Compat | 1 (MP3, for browsers without Opus) | 2.0 MB | ~45 MB |

Desktops default to Studio, phones to Lite. After the first load, samples come
from IndexedDB.

To rebuild the tiers from the original recordings, download
`SalamanderGrandPianoV3+20161209_48khz24bit.tar.xz` from
https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html, extract it, and run:

```sh
python3 -I scripts/build-samples.py <extracted>/48khz24bit
npm run verify:samples
```

Requires ffmpeg with libopus and Python 3 with NumPy.

## Keys

| Input | Keys |
|---|---|
| Computer keyboard | `A W S E D F T G Y H U J K O L P ; '` play C to F one and a half octaves up; `Z`/`X` shift the octave; `Space` holds the sustain pedal |
| On-screen keyboard | Click or touch; drag for glissando; strike lower on a key to play louder. With focus on the keyboard, arrow keys move and Enter plays. |
| MIDI | Note on/off with velocity, CC64 sustain, CC67 soft pedal |
