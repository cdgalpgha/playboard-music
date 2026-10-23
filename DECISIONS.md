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
