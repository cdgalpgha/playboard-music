import { createStore, useStore } from "zustand";
import { FULL_RANGE, type KeyboardRange } from "@/core/keyboard-range.ts";

export type MidiStatus = "unsupported" | "idle" | "requesting" | "ready" | "denied";
export type InputMode = "midi" | "keyboard" | "mic";

export interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
  connected: boolean;
}

export interface InputState {
  midiStatus: MidiStatus;
  devices: MidiDevice[];
  /** Device id, or "all" to listen to every connected input. */
  selectedId: string;
  range: KeyboardRange;
  /** True when the range came from the player pressing lowest/highest keys. */
  rangeConfirmed: boolean;
  mode: InputMode;
  /** Computer-keyboard base octave (C of this octave sits on the A key). */
  qwertyOctave: number;
  qwertyVelocity: number;
  lastMidi: { note: number; velocity: number; device: string; at: number } | null;
}

const hasMidi = typeof navigator !== "undefined" && "requestMIDIAccess" in navigator;

export const inputStore = createStore<InputState>(() => ({
  midiStatus: hasMidi ? "idle" : "unsupported",
  devices: [],
  selectedId: "all",
  range: FULL_RANGE,
  rangeConfirmed: false,
  mode: hasMidi ? "midi" : "mic",
  qwertyOctave: 4,
  qwertyVelocity: 88,
  lastMidi: null,
}));

export function useInput<T>(selector: (s: InputState) => T): T {
  return useStore(inputStore, selector);
}
