# Playboard · Studio edition

A desktop-first piano and chord practice web app with a recorded Yamaha C5 grand,
expressive note control, and YouTube karaoke/backing-track sessions. No account,
backend, paid service, or API key is required.

## Run on Windows

Install Node.js 24 LTS. Download the repository ZIP from GitHub, extract it, and
open the folder containing `package.json`. Click File Explorer's address bar,
type `cmd`, and press Enter. Run:

```bat
npm.cmd install
npm.cmd run dev
```

Open the local address shown by Vite (normally http://localhost:5173). Keep the
terminal running. Stop it with Ctrl+C. To update from a downloaded ZIP, extract
the new version to a fresh folder and repeat these commands.

## Development

Node.js 22.12+ or 24 LTS. Commands run in the project root:

```sh
npm ci
npm run dev
npm run build
npm test
```

The cloud machine uses `npm ci --cache /workspace/.npm-cache` because its home
folder is read-only. `npm run build` verifies sample hashes and produces `dist/`.
`npm run preview` serves the production build. All fonts and piano samples are
bundled locally, so instrument playback doesn't need external sound servers.

Tests use `/usr/bin/chromium` when present; otherwise install Playwright Chromium
with `npx playwright install chromium`. To select another Chromium executable, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

## The piano

- **Recorded instrument:** 30 Salamander MP3 samples from a Yamaha C5 by Alexander
  Holm, spaced in minor thirds across A0–C8. The closest sample is transposed at
  most one semitone. These are real acoustic recordings, replacing v0.1's
  oscillator approximation. Source attribution and CC BY 3.0 license are in
  `public/samples/salamander/ATTRIBUTION.md`, also linked in the app.
- **Note behavior:** independent note-on/note-off, per-note release envelopes,
  natural recorded decays, sustain pedal, 96-voice limit, and all-notes-off.
  Pointer dragging supports glissando across the on-screen keys.
- **Expression:** Touch sets the strike level for a computer keyboard. MIDI input
  uses the played velocity; filter response and gain follow the strike. Soft Felt
  and Warm Room are filtered variations of the same grand recordings, not
  separate sampled instruments.
- **Mix:** stereo placement, brightness, adjustable room convolution, master
  volume, output meter, and dynamic compression. The AudioContext requests
  interactive latency. Input/output latency still depends on the browser, audio
  hardware, and operating system; this is not a calibrated physical piano model.
- **Keyboard:** Chord mode uses A–G for major and Shift+A–G for minor. Space raises
  the root by a semitone. Follow genre selects seventh voicings used by the chosen
  progression while preserving Shift for minor; select Triads for the original
  major/minor mapping. Sevenths is available explicitly.
- **Piano mode:** A W S E D F T G Y H U J map to C C♯ D D♯ E F F♯ G G♯ A A♯ B.
  K O L P ; ' extend the next octave. Hold Space as a sustain pedal. Octave,
  transpose, and pedal controls work on screen. Escape stops all notes.
- **USB MIDI:** click Connect MIDI in Chrome/Edge on localhost or HTTPS. Note on,
  note off, velocity, and sustain CC64 are supported. Browser permission is
  requested only after that click. Computer keyboard keys cannot sense pressure.
- **Recording:** capture notes, velocity, release, and pedal timing, replay the
  performance, and export stereo PCM WAV. Export is the dry piano take with its
  selected tonal filter and stereo placement; it does not include room effects,
  YouTube, local audio, backing practice, or the metronome. Takes are in memory
  until page reload and are capped at ten minutes.

## YouTube sessions and creator credits

Paste a YouTube watch/share/Shorts/live URL into the studio or sessions page.
The visible YouTube IFrame player remains mounted when navigating the app.
Video title, uploader name, uploader channel link, and the original YouTube link
appear in the session panel. Uploader credits describe the channel that uploaded
it; they do not infer ownership or the original artist. Original artist names may
appear in the video's own title and player. No attribution is invented.

The app uses YouTube's IFrame API for playback and the keyless Noembed endpoint
for video metadata. Noembed receives the public video URL. If metadata fails,
credits remain available through the player/original YouTube link; the player may
supply a title/uploader as a fallback. External network access is required for
YouTube, Noembed, and thumbnail/media domains. YouTube controls and attribution
remain visible; audio is neither extracted nor downloaded. Autoplay is not forced.

Controls include independent video volume, supported playback speeds, seeking,
and an A–B practice loop. Loops poll the YouTube clock every 200 ms and are not
sample-accurate. Video lyrics remain timed by YouTube. No automatic lyric/chord
extraction or automatic alignment of the piano exercises to arbitrary videos is
claimed. Playback pauses when the tab is hidden. Click back on the piano after
interacting with the embedded player to restore computer-keyboard focus.

Some videos are unavailable, private, region-restricted, or disallow embedding.
The player reports these errors and keeps an original YouTube link as a fallback.
Regional discovery cards open YouTube search for Pakistani, Western, Bangladeshi,
and Indian backing tracks. They are not fabricated songs or a live viral chart.
Recent sessions are saved only in this browser. External video availability and
Noembed service availability are outside the app's control.

Own audio files and timed `.lrc` lyrics remain supported in the expandable local
player. Lyrics follow the audio clock, including seeks. Files stay on the device.

## Practice and learning

Six genres include triads and seventh voicings. Accompaniment and metronome are
scheduled against the Web Audio clock with a short lookahead. Visual beat and bar
indicators follow the scheduled bars. Feedback checks chord identity/quality and
a beginner timing window of ±220 ms; a bar can be scored only once. These scores
are not a formal musical assessment or a latency-calibrated performance score.

The chord book covers all twelve roots with seven qualities (84 chords), root
position and two inversions, actual note names, and playable chord previews.
Six foundations lessons explain piano mechanics, triads, minor harmony, sharps,
sevenths, and pulse. Practice totals and completed lessons use local storage.

## Validation and limitations

The Playwright suite tests recorded sample playback and audible output, exact
chord notes, independent releases, pedal behavior, transpose, volume, progression
advance, saved progress, inversions, lesson interaction, WAV headers and nonzero
PCM samples, local audio/lyric seeking, layout, focus management, and a simulated
MIDI adapter. Sample-load failure and retry are covered.

YouTube tests use a simulated IFrame API and fixture metadata to test integration,
credits, volume, speed, seek, loops, history, unavailable-video errors, URL
validation, and safe text rendering. They do not establish live YouTube playback.
The onboarding cloud network denied live YouTube/Noembed access; test a permitted
embeddable video on your own Internet connection. Required domains were saved to
the cloud configuration draft, which needs review/save/publication to take effect.
No physical MIDI keyboard was available in the cloud for a hardware test.

This sample set is a compact single-layer subset of Salamander, not its full
16-velocity-layer SFZ instrument or a commercial concert-piano plugin. Velocity
changes gain/filtering, not the sampled hammer layer. No microphone pitch scoring,
chart API, vocal removal, full physical resonance modeling, or backend account
sync is implemented. The sound improvement is real recorded audio; subjective
studio quality depends on the source samples and playback setup.

To refresh the bundled source samples intentionally, run
`python3 scripts/fetch-samples.py`, review the attribution and manifest changes,
then run `npm run verify:samples`. Routine installation never re-downloads samples.
