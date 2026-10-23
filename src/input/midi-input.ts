import { CC, parseMidiMessage } from "@/core/midi-message.ts";
import { rangeFromDeviceName, type KeyboardRange } from "@/core/keyboard-range.ts";
import { inputStore, type MidiDevice } from "@/state/input-store.ts";
import { setSetting, getSetting } from "@/storage/db.ts";
import { engine } from "@/audio/engine.ts";
import { inputBus } from "./input-bus.ts";

let access: MIDIAccess | null = null;
let requesting: Promise<void> | null = null;

function devices(): MidiDevice[] {
  if (!access) return [];
  return [...access.inputs.values()].map((i) => ({
    id: i.id,
    name: i.name ?? "MIDI input",
    manufacturer: i.manufacturer ?? "",
    connected: i.state === "connected",
  }));
}

function handle(this: MIDIInput, e: MIDIMessageEvent): void {
  const selected = inputStore.getState().selectedId;
  if (selected !== "all" && selected !== this.id) return;
  if (!e.data) return;
  const msg = parseMidiMessage(e.data);
  // The event timestamp is when the browser received the bytes, in performance.now() time.
  const time = e.timeStamp;
  switch (msg.kind) {
    case "noteon":
      inputBus.emit({ type: "noteon", note: msg.note, velocity: msg.velocity, time, source: "midi" });
      inputStore.setState({
        lastMidi: { note: msg.note, velocity: msg.velocity, device: this.name ?? "", at: time },
      });
      return;
    case "noteoff":
      inputBus.emit({ type: "noteoff", note: msg.note, time, source: "midi" });
      return;
    case "cc":
      if (msg.controller === CC.sustain) inputBus.emit({ type: "pedal", value: msg.value, time, source: "midi" });
      else if (msg.controller === CC.soft) inputBus.emit({ type: "soft", value: msg.value, time, source: "midi" });
      else if (msg.controller === CC.allNotesOff || msg.controller === CC.allSoundOff) {
        inputBus.releaseAll(time);
        engine.allOff();
      }
      return;
  }
}

function attach(): void {
  if (!access) return;
  for (const input of access.inputs.values()) input.onmidimessage = handle;
  const list = devices();
  const state = inputStore.getState();
  const patch: Partial<typeof state> = { devices: list };
  // A newly seen device suggests a keyboard size until the player confirms one.
  if (!state.rangeConfirmed) {
    const guess = list.map((d) => rangeFromDeviceName(d.name)).find(Boolean);
    if (guess) patch.range = guess;
  }
  inputStore.setState(patch);
}

/** Asks for MIDI permission. Call from a user gesture; safe to call repeatedly. */
export function requestMidi(): Promise<void> {
  if (access) {
    attach();
    return Promise.resolve();
  }
  if (!("requestMIDIAccess" in navigator)) {
    inputStore.setState({ midiStatus: "unsupported" });
    return Promise.resolve();
  }
  requesting ??= (async () => {
    inputStore.setState({ midiStatus: "requesting" });
    try {
      access = await navigator.requestMIDIAccess({ sysex: false });
      access.onstatechange = () => attach();
      inputStore.setState({ midiStatus: "ready", mode: "midi" });
      const saved = await getSetting<string>("midiInput", "all");
      inputStore.setState({ selectedId: saved });
      attach();
    } catch {
      inputStore.setState({ midiStatus: "denied" });
    } finally {
      requesting = null;
    }
  })();
  return requesting;
}

/** Restores the saved keyboard range and computer-key settings. */
let restored = false;
export async function restoreInputSettings(): Promise<void> {
  if (restored) return;
  restored = true;
  inputBus.monitor = await getSetting<boolean>("monitor", true);
  const saved = await getSetting<{ range: KeyboardRange; confirmed: boolean } | null>("keyboardRange", null);
  if (saved) inputStore.setState({ range: saved.range, rangeConfirmed: saved.confirmed });
  const qwerty = await getSetting<{ octave: number; velocity: number } | null>("qwerty", null);
  if (qwerty) inputStore.setState({ qwertyOctave: qwerty.octave, qwertyVelocity: qwerty.velocity });
  inputStore.subscribe((s, prev) => {
    if (s.range !== prev.range || s.rangeConfirmed !== prev.rangeConfirmed)
      void setSetting("keyboardRange", { range: s.range, confirmed: s.rangeConfirmed });
    if (s.qwertyOctave !== prev.qwertyOctave || s.qwertyVelocity !== prev.qwertyVelocity)
      void setSetting("qwerty", { octave: s.qwertyOctave, velocity: s.qwertyVelocity });
  });
}

export function selectMidiInput(id: string): void {
  inputStore.setState({ selectedId: id });
  void setSetting("midiInput", id);
}

/** A stable key for calibration records: the selected device name, or the input mode. */
export function inputDeviceKey(): { key: string; name: string } {
  const s = inputStore.getState();
  if (s.mode !== "midi") return { key: s.mode, name: s.mode === "mic" ? "Microphone" : "Computer keyboard" };
  const device = s.devices.find((d) => d.id === s.selectedId) ?? s.devices.find((d) => d.connected);
  return { key: `midi:${device?.name ?? "any"}`, name: device?.name ?? "MIDI keyboard" };
}
