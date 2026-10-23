import { createStore, useStore } from "zustand";
import { FULL_RANGE, type KeyboardRange } from "@/core/keyboard-range.ts";

export type MidiStatus = "unsupported" | "idle" | "requesting" | "ready" | "denied";
export type MicStatus = "off" | "starting" | "listening" | "denied" | "error" | "unsupported";
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
  mic: {
    status: MicStatus;
    error: string;
    backend: string;
    level: number;
    inferenceMs: number;
    /** Median time from a note sounding to its detection. */
    delayMs: number;
    lastNotes: number[];
    /** Audio blocks the detector has received and analyses it has run. */
    blocks: number;
    inferences: number;
    /** Audio waiting to be analysed; grows on devices too slow for real time. */
    backlogSec: number;
    skipped: number;
  };
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
  mic: {
    status: typeof navigator !== "undefined" && "mediaDevices" in navigator ? "off" : "unsupported",
    error: "",
    backend: "",
    level: 0,
    inferenceMs: 0,
    delayMs: 0,
    lastNotes: [],
    blocks: 0,
    inferences: 0,
    backlogSec: 0,
    skipped: 0,
  },
}));

export function useInput<T>(selector: (s: InputState) => T): T {
  return useStore(inputStore, selector);
}
