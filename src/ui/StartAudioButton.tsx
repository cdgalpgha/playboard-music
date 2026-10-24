import { engine } from "@/audio/engine.ts";
import { requestMidi } from "@/input/midi-input.ts";
import { useAudio } from "@/state/audio-store.ts";
import { Icon } from "./Icon.tsx";

/** The explicit user gesture that unlocks Web Audio (and asks for MIDI access). */
export function startAudio(): Promise<void> {
  void requestMidi();
  return engine.start();
}

export function StartAudioButton({ className = "" }: { className?: string }) {
  const status = useAudio((s) => s.status);
  if (status === "running") return null;
  return (
    <button
      type="button"
      className={`btn-primary ${className}`}
      disabled={status === "starting"}
      onClick={() => void startAudio().catch(() => undefined)}
    >
      <Icon name="bolt" size={16} />
      {status === "starting" ? "Starting audio…" : status === "suspended" ? "Resume audio" : "Start audio"}
    </button>
  );
}
