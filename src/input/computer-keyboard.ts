import { inputStore } from "@/state/input-store.ts";
import { chordFor, chordLetter } from "@/core/chords.ts";
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

/** Notes held per physical key; a chord key holds three. */
const held = new Map<string, number[]>();
/** How many held keys sound each note, so overlapping chords don't cut each other off. */
const sounding = new Map<number, number>();
let spaceHeld = false;

function press(code: string, notes: number[], velocity: number, time: number): void {
  held.set(code, notes);
  for (const note of notes) {
    const n = sounding.get(note) ?? 0;
    sounding.set(note, n + 1);
    if (n === 0) inputBus.emit({ type: "noteon", note, velocity, time, source: "keyboard" });
  }
}

function release(code: string, time: number): void {
  const notes = held.get(code);
  if (!notes) return;
  held.delete(code);
  for (const note of notes) {
    const n = (sounding.get(note) ?? 1) - 1;
    if (n > 0) sounding.set(note, n);
    else {
      sounding.delete(note);
      inputBus.emit({ type: "noteoff", note, time, source: "keyboard" });
    }
  }
}

const chordMode = () => {
  const s = inputStore.getState();
  return s.chordKeysActive && s.qwertyMode === "chords";
};

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
  if (chordMode()) {
    onChordKey(e);
    return;
  }
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
  press(e.code, [note], state.qwertyVelocity, e.timeStamp);
}

/** A–G play a major chord; Shift makes it minor; holding Space raises the root a semitone. */
function onChordKey(e: KeyboardEvent): void {
  const state = inputStore.getState();
  if (e.code === "Space") {
    e.preventDefault();
    spaceHeld = true;
    return;
  }
  if (e.code === "KeyZ" || e.code === "KeyX") {
    if (!e.repeat)
      inputStore.setState({ qwertyOctave: Math.max(1, Math.min(7, state.qwertyOctave + (e.code === "KeyZ" ? -1 : 1))) });
    return;
  }
  const letter = chordLetter(e.key, e.code);
  if (!letter) return;
  e.preventDefault();
  if (e.repeat || held.has(e.code)) return;
  const chord = chordFor(letter, {
    minor: e.shiftKey,
    sharp: spaceHeld,
    octave: state.qwertyOctave,
    voicing: state.chordVoicing,
    transpose: state.chordTranspose,
  });
  if (!chord) return;
  press(e.code, chord.notes, state.qwertyVelocity, e.timeStamp);
  inputStore.setState({ lastChord: chord.name });

}

function onKeyUp(e: KeyboardEvent): void {
  if (e.code === "Space") {
    spaceHeld = false;
    if (inputBus.pedalDown) inputBus.emit({ type: "pedal", value: 0, time: e.timeStamp, source: "keyboard" });
    return;
  }
  release(e.code, e.timeStamp);
}

function releaseAll(): void {
  const now = performance.now();
  spaceHeld = false;
  for (const code of [...held.keys()]) release(code, now);
}

let installed = false;
/** Turns chord keys on for the current page; returns the cleanup that turns them off. */
export function enableChordKeys(): () => void {
  inputStore.setState({ chordKeysActive: true });
  return () => {
    releaseAll();
    inputStore.setState({ chordKeysActive: false });
  };
}

export function installComputerKeyboard(): void {
  if (installed) return;
  installed = true;
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", releaseAll);
  document.addEventListener("visibilitychange", () => document.hidden && releaseAll());
}
