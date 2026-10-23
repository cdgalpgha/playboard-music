import { createStore, useStore } from "zustand";
import { audioStore } from "@/state/audio-store.ts";
import { inputDeviceKey } from "@/input/midi-input.ts";
import { db, type CalibrationRecord } from "./db.ts";

/** Offsets for the current input/output pair. Zero until calibrated. */
export interface OffsetState {
  key: string;
  record: CalibrationRecord | null;
  inputOffsetMs: number;
  audioOffsetMs: number;
}

export const offsetStore = createStore<OffsetState>(() => ({
  key: "",
  record: null,
  inputOffsetMs: 0,
  audioOffsetMs: 0,
}));

export function useOffsets<T>(selector: (s: OffsetState) => T): T {
  return useStore(offsetStore, selector);
}

export function currentDevicePair(): { key: string; inputName: string; outputName: string } {
  const input = inputDeviceKey();
  const outputName = audioStore.getState().output?.deviceLabel || "Default output";
  return { key: `${input.key}|${outputName}`, inputName: input.name, outputName };
}

/** Loads the calibration for the current device pair into the offset store. */
export async function refreshOffsets(): Promise<OffsetState> {
  const pair = currentDevicePair();
  let record: CalibrationRecord | null = null;
  try {
    record = (await (await db()).get("devices", pair.key)) ?? null;
  } catch {
    record = null;
  }
  const state: OffsetState = {
    key: pair.key,
    record,
    inputOffsetMs: record?.inputOffsetMs ?? 0,
    audioOffsetMs: record?.audioOffsetMs ?? 0,
  };
  offsetStore.setState(state);
  return state;
}

export async function saveCalibration(values: {
  inputOffsetMs: number;
  audioOffsetMs: number;
  taps: number;
  spreadMs: number;
}): Promise<CalibrationRecord> {
  const pair = currentDevicePair();
  const record: CalibrationRecord = {
    key: pair.key,
    inputName: pair.inputName,
    outputName: pair.outputName,
    ...values,
    updatedAt: Date.now(),
  };
  try {
    await (await db()).put("devices", record);
  } catch {
    /* storage blocked: offsets still apply for this page */
  }
  offsetStore.setState({ key: pair.key, record, inputOffsetMs: record.inputOffsetMs, audioOffsetMs: record.audioOffsetMs });
  return record;
}

export async function clearCalibration(): Promise<void> {
  const pair = currentDevicePair();
  try {
    await (await db()).delete("devices", pair.key);
  } catch {
    /* nothing stored */
  }
  offsetStore.setState({ key: pair.key, record: null, inputOffsetMs: 0, audioOffsetMs: 0 });
}
