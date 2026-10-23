# Decisions

Choices made where the brief was silent, plus places where a hard rule or a
platform limit forced a specific option. Newest entries go at the bottom of
each section.

## Starting point

**D1. Rebuild v0.2 in TypeScript/React instead of extending it.**
The repo held a 1,300-line vanilla-JS app (`src/main.js`) with string-built
HTML, a `AudioBufferSourceNode` piano, a chord trainer and a YouTube URL
player. The brief requires TypeScript, React, Tailwind and an AudioWorklet
sampler, and none of the v0.2 modules were typed or separable, so the app is
rebuilt. What carries over: the Playboard name and visual identity (sage
palette, DM Sans/Manrope), the QWERTY note layout (A W S E D F T G Y H U J…),
YouTube error messages and URL parsing, record/replay/WAV export, the chord
book, and the Tone.js MP3 samples (now the "Compat" tier). v0.2 is preserved
in git history at commit `a3fb176`.

**D2. Dropped from v0.2:** the genre chord-progression trainer and the local
audio + LRC lyrics player. Neither fits the falling-notes/scoring model, and
the local player overlaps with song play-along. Chord learning moves into the
lesson path and chord book.

## Audio

**D3. Sample source is the original Salamander V3 48 kHz/24-bit set**, not the
Tone.js MP3 subset. Only the original has the 16 velocity layers, hammer
releases, string-resonance releases and pedal samples the brief asks for.

**D4. Studio uses 4 of 16 velocity layers, Lite uses 2.** All 16 layers at
48 kHz stereo would need ~600 MB of PCM in memory, which no browser tab can
hold reliably. Four layers with a continuous, measured gain curve between
them keep dynamics smooth; timbre changes in four steps instead of sixteen.

**D5. Tails are capped per register** (Studio: 10 s up to A2, 8 s to C4,
6.5 s to C5, 5 s to C6, 4 s above; Lite shorter) with a 350 ms cosine fade.
A note held longer than its cap fades early. This is the main memory lever.

**D6. Lead-in silence is trimmed at −46 dB with 0.5 ms kept.** The source
files start 8–15 ms before the hammer is audible; untrimmed, that is most of
the 15 ms latency budget.

**D7. PCM lives in the worklet as Int16, transferred, not shared.**
`SharedArrayBuffer` needs cross-origin isolation (COOP/COEP), and COEP blocks
the YouTube iframe, which hard rule 1 requires. Transferring buffers into the
worklet is zero-copy and needs no isolation. Int16 halves memory versus
Float32 at no audible cost for 24-bit sources dithered by the Opus codec.

**D8. Ogg Opus, with MP3 Compat fallback.** Opus gives the best size for
quality. Browsers that cannot decode Ogg Opus (older Safari) get the
single-layer Compat tier; the UI says so.

**D9. Release samples follow the damper, not the key.** Hammer and
string-resonance releases play when the damper actually falls: key up with
the pedal up, or pedal up after the key was released. Keys from F♯6 up have
no dampers on a real grand, so they ring on after note-off.

**D10. Pedal resonance is modelled, not sampled.** Salamander has no
pedal-down resonance layer. While CC64 is down, a bank of 24 tuned comb
resonators receives a small send of the voice mix. The recorded pedal
mechanism sounds play on pedal down/up.

**D11. Default tier is chosen from the device**: Studio when
`navigator.deviceMemory ≥ 8` (or unknown) on a non-mobile device, otherwise
Lite. Users can change it in Settings.

**D12. Latency is measured per note in the app, from the MIDI event to the
speaker,** using `getOutputTimestamp()` to locate the voice's first frame in
`performance.now()` time. The split is input dispatch (main thread) versus
audio path (render quantum + device buffers); the quantum wait cannot be
separated from device buffering on the main thread, so it is not reported on
its own.

**D13. Dropouts are tracked from inside the worklet.** Chromium 141 exposes
neither `playbackStats` nor `renderCapacity`, and the worklet scope has no
`performance.now()`. The worklet times each block with `Date.now()`, reports
load per stats window, and counts blocks that took longer than their own
duration. The stress test requires zero.

**D14. Phones get a two-octave keyboard window** with octave buttons; 61 or 88
keys at phone width are too narrow to touch.

**D15. A dev-only `window.__pb` handle** exposes stores to the end-to-end tests.
It is behind `import.meta.env.DEV` and absent from production builds.

## Practice and scoring

**D16. The MusicXML parser moved forward from milestone 3 to 2.** Practice
needs real charts, and building a throwaway format first would mean two
parsers. Built-in content is written in a compact notation
(`content/*.ts`), turned into MusicXML by `scripts/build-content.ts`, and
read back through the same parser the app uses; the build fails if a file
does not round-trip.

**D17. Two pieces ship with milestone 2:** Ode to Joy (Beethoven) and the
Minuet in G (Petzold, BWV Anh. 114, first half). Both compositions are public
domain; the arrangements are original to Playboard. In Ode to Joy the low G
of bar 12 is a left-hand thumb note, as in common beginner books, so the right
hand stays in C position.

**D18. Timing is judged in real time.** At half tempo, 50 ms of chart time is
100 ms of the player's time, and that is what is judged. Windows widen at slow
tempos (×1/rate, capped at 1.5×) because slow practice is for learning
notes. Wrong notes cost a quarter of a correct note so that mashing keys
cannot raise a score.

**D19. One bar of count-in in timed mode, none in wait-for-me mode**, which
waits at the first chord anyway.

**D20. Changing tempo, hands or modes while playing restarts scoring from the
current position**, so a run's result always describes one set of
conditions. Each loop pass gets its own summary.

**D21. D.C., D.S. and coda jumps are played straight through.** Repeats and
volta endings are expanded. Jump instructions are rare in beginner material;
supporting them is left for licensed catalogs that need it.

**D22. Velocity consistency** is 1 minus the mean coefficient of variation of
played velocities among notes marked at the same dynamic (groups of four or
more). It measures evenness, not whether the player followed the dynamics.

**D23. Calibration uses 4 count-in beats and 16 scored beats at 100 BPM per
pass**, any input counts as a tap (key, pedal, Space, the on-screen pad), and
taps more than 2.5 median absolute deviations from the median are dropped.
At least 8 must remain. Offsets are stored per input-device/output-device pair.

**D24. Slowing down never changes pitch.** Charts are rendered by the sampler,
so tempo changes only move note times. For YouTube play-along (milestone 5),
YouTube's player keeps pitch at reduced speed.

## Lessons and sheet music

**D25. The current-measure highlight is an overlay drawn from OSMD's layout**
(each measure's bounding box across staves), not OSMD's note cursor. The
cursor steps by notes and would need to be advanced in lockstep with the
transport; the overlay only needs the measure index, which the chart keeps as
`sourceIndex` so repeats highlight the right printed bar. Clicking a measure
seeks there.

**D26. Lessons are not locked.** The path shows completion and the
recommended next lesson, but any lesson can be opened. Adults returning to
the piano skip ahead, and a lock adds frustration without teaching anything.

**D27. Early lessons use wait-for-me and pass on pitch accuracy (85%)**; from
lesson 4 on, lessons are timed (75%; 70% for the two-hand Minuet). Lessons 6
and 10 reuse the built-in pieces, with different presets (right hand only with
the left auto-played; both hands at 70% tempo).

**D28. Lesson melodies are traditional or public domain** (Hot Cross Buns,
Mary Had a Little Lamb, Lightly Row / Hänschen klein, Ode to Joy, Minuet in
G); exercises (middle C, five-finger patterns, the C scale, C–F–G chords) and
all arrangements are written for Playboard. Each lesson carries its own
license record and the build rejects one without it.

**D29. OSMD is loaded only when a sheet is shown.** It is a 1.4 MB chunk;
the landing page and free play never fetch it. Vite pre-bundles it in dev so
the dev server does not reload the page on first use.

## Import

**D30. Files are recognised by their bytes, not their extension**: `MThd` is
MIDI, a zip (`PK`) is compressed MusicXML, otherwise the text must contain
`<score-partwise>`. Misnamed files still work and wrong files get a clear
message. RIFF-wrapped MIDI (.rmi) and timewise MusicXML are refused with
instructions.

**D31. Imports keep the original file plus the edits**, not a converted
chart. Edits (transpose, tempo, MIDI track roles) are re-applied on load, so
they can be changed later without re-importing and without loss. `.mxl`
archives are stored unzipped.

**D32. Default hands for MIDI**: with two or more note tracks, the one with
the lowest average pitch is the left hand and the rest are the right hand. A
single track is split at middle C. Drum-channel notes (channel 10) are left
out. Players can reassign or leave out any track.

**D33. Transposing moves notes that fall off the 88 keys back by an octave**
and updates the key signature along the circle of fifths. Imported MusicXML
is transposed in the sheet view too, with OSMD's transpose plugin.

**D34. Imported files are private.** They live in IndexedDB on this device,
are labelled "Imported by you … stored only on this device", and the import
page asks the player to use only music they have the right to use. The cloud
sync planned for milestone 7 does not upload them unless the player opts in.

**D35. Free-play takes can also be exported as MIDI** (120 BPM, 960 ticks
per second, notes, velocities and CC64), reusing the writer built for test
fixtures.

**D36. Theme colour tokens for the hands are `rh`/`lh`.** Naming them
`right`/`left` made Tailwind's `text-left` set both alignment and colour.

## YouTube play-along

**D37. The embed uses the standard `www.youtube.com` player with YouTube's
controls on**, not the privacy-enhanced `youtube-nocookie.com` host, to stay
as close as possible to "the standard embedded player" and to keep views
counting normally. Nothing is drawn over the player, and its box is at least
200 × 200 px (YouTube's minimum) at every screen width.

**D38. No third-party metadata service.** v0.2 used Noembed for titles and
uploader names. Now titles and channels come from the Data API search result
or, for pasted links, from the player itself (`getVideoData()`).

**D39. The Data API key is supplied by whoever runs or uses the app**
(`VITE_YOUTUBE_API_KEY` at build time, or a key typed in Settings and kept in
IndexedDB). A browser app cannot hide a key, so the Settings text says to
restrict it to the site's address. Without a key, search is replaced by
pasting a link.

**D40. "Official" means the channel name matches the artist (also with
"Official"/"Music"), ends in VEVO, or is an auto-generated "- Topic"
channel.** The Data API does not say whether a channel belongs to an artist,
so this is a heuristic and the UI words it as such; pasted links are labelled
"cannot tell". Every embed states which channel receives the view.

**D41. Search uses `type=video`, `videoEmbeddable=true` and
`videoSyndicated=true`**, so results can be played outside youtube.com.
`videos.list` adds durations (1 quota unit). Original mode appends
"official" to the query; Karaoke mode appends "karaoke"; results are re-ranked
but YouTube's order is kept within a rank.

**D42. With a video, auto-played hands and clicks default to off and there
is no count-in.** The recording is the accompaniment and its own count-in.

**D43. The video clock was validated against simulated players, not the real
one.** In this cloud container YouTube serves the player and metadata but
refuses playback (`errorCode: "auth"`), so `getCurrentTime()` could not be
observed live. The clock handles both possible behaviours: a value the API
already interpolates, and a stale value that changes every few hundred
milliseconds. Against a stale 250 ms source the smoothed clock is off by
+4.5 ms on average (raw polling: −126 ms).

**D44. Sync maps are stored per song and per video** (`syncMaps` store), as
anchors plus an offset in milliseconds. Positive offsets make the notes later
than the video.
