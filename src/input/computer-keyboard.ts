import { inputStore } from "@/state/input-store.ts";
import { inputBus } from "./input-bus.ts";

/** Semitone offsets from the base C, kept from Playboard v0.2. */
export const QWERTY_MAP: Record<string, number> = {
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

export const QWERTY_LABELS: Record<string, string> = Object.fromEntries(
  Object.keys(QWERTY_MAP).map((code) => [
    code,
    code.replace("Key", "").replace("Semicolon", ";").replace("Quote", "'"),
  ]),
);

const held = new Map<string, number>();

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function noteForCode(code: string, octave: number): number | null {
  const offset = QWERTY_MAP[code];
  return offset === undefined ? null : 12 * (octave + 1) + offset;
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
  if (document.querySelector("[aria-modal='true']")) return;
  const state = inputStore.getState();
  if (e.code === "Space") {
    // Space is the sustain pedal only when focus is not on a button.
    if ((e.target as HTMLElement | null)?.closest?.("button, a, [role='button'], [role='slider']")) return;
    e.preventDefault();
    if (!e.repeat) inputBus.emit({ type: "pedal", value: 127, time: e.timeStamp, source: "keyboard" });
    return;
  }
  if (e.code === "KeyZ" || e.code === "KeyX") {
    if (!e.repeat)
      inputStore.setState({ qwertyOctave: Math.max(1, Math.min(7, state.qwertyOctave + (e.code === "KeyZ" ? -1 : 1))) });
    return;
  }
  const note = noteForCode(e.code, state.qwertyOctave);
  if (note === null) return;
  e.preventDefault();
  if (e.repeat || held.has(e.code)) return;
  held.set(e.code, note);
  inputBus.emit({ type: "noteon", note, velocity: state.qwertyVelocity, time: e.timeStamp, source: "keyboard" });
}

function onKeyUp(e: KeyboardEvent): void {
  if (e.code === "Space") {
    if (inputBus.pedalDown) inputBus.emit({ type: "pedal", value: 0, time: e.timeStamp, source: "keyboard" });
    return;
  }
  const note = held.get(e.code);
  if (note === undefined) return;
  held.delete(e.code);
  inputBus.emit({ type: "noteoff", note, time: e.timeStamp, source: "keyboard" });
}

function releaseAll(): void {
  const now = performance.now();
  for (const [code, note] of held) {
    held.delete(code);
    inputBus.emit({ type: "noteoff", note, time: now, source: "keyboard" });
  }
}

let installed = false;
export function installComputerKeyboard(): void {
  if (installed) return;
  installed = true;
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", releaseAll);
  document.addEventListener("visibilitychange", () => document.hidden && releaseAll());
}
