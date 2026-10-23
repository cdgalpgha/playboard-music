# Native path for MIDI on iOS and Safari

Safari on macOS and every browser on iOS (all of which use WebKit) do not
implement the Web MIDI API, and Apple has not announced plans to. On those
platforms Playboard falls back to the on-screen keyboard and microphone
detection. Real MIDI input there needs a native shell.

## Plan: Capacitor wrapper with a CoreMIDI plugin

1. **Wrap the existing web app with Capacitor** (iOS target). The app is a
   static Vite build, so `npx cap add ios` with `webDir: "dist"` works without
   code changes. WKWebView supports AudioWorklet, IndexedDB and the YouTube
   IFrame player.
2. **Write a small Capacitor plugin in Swift around CoreMIDI**:
   - `MIDIClientCreateWithBlock` + `MIDIInputPortCreateWithProtocol`
     (MIDI 1.0 protocol) and connect every source from `MIDIGetNumberOfSources`.
   - Watch `kMIDIMsgSetupChanged` / `kMIDIMsgObjectAdded` for hot-plug.
   - For each packet, forward `{ data: [status, d1, d2], timestamp }` to the web
     layer with `notifyListeners("midimessage", …)`. Convert the packet's
     `mach_absolute_time` timestamp to milliseconds and send it with the
     current mach time, so the web side can map it into `performance.now()`
     (offset = `performance.now()` at receipt − (now − timestamp)).
   - Bluetooth LE MIDI devices appear as ordinary sources once paired through
     `CABTMIDICentralViewController`, which the plugin can present.
3. **Adapter on the web side**: a `requestMIDIAccess`-shaped shim that wraps the
   plugin's listeners in `MIDIInput` objects with `onmidimessage`. Because
   `src/input/midi-input.ts` only uses `inputs`, `onstatechange` and
   `onmidimessage(event.data, event.timeStamp)`, nothing else in the app
   changes: the input bus, latency probes and scoring work as on desktop.
4. **Audio session**: set `AVAudioSession` category `.playback` (or
   `.playAndRecord` with `.defaultToSpeaker` when the microphone is used) and a
   preferred IO buffer duration of 0.005 s (≈ 5 ms) for low output latency.

## Why not now

It needs an Apple developer account, signing, and on-device testing with a
USB/Lightning or Bluetooth MIDI keyboard, none of which exist in this
environment. The web app is structured so the shim slots in at one place
(`navigator.requestMIDIAccess`).
