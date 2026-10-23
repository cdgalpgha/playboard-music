import { useState } from "react";
import { Link } from "react-router";
import { engine } from "@/audio/engine.ts";
import { useAudio } from "@/state/audio-store.ts";
import { useInput } from "@/state/input-store.ts";
import { Icon } from "@/ui/Icon.tsx";
import { StartAudioButton } from "@/ui/StartAudioButton.tsx";

function Bar({ tone, children }: { tone: "info" | "warn" | "error"; children: React.ReactNode }) {
  const styles = {
    info: "bg-sage-soft text-green-dark border-sage/50",
    warn: "bg-warn-soft text-[#6e3d10] border-[#f0d2ad]",
    error: "bg-[#fbe5e5] text-bad border-[#efc0c0]",
  }[tone];
  return (
    <div role={tone === "info" ? "status" : "alert"} className={`flex flex-wrap items-center gap-3 border-b px-4 py-2.5 text-sm lg:px-8 ${styles}`}>
      {children}
    </div>
  );
}

function readDismissed(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function Banners() {
  const status = useAudio((s) => s.status);
  const error = useAudio((s) => s.error);
  const progress = useAudio((s) => s.progress);
  const output = useAudio((s) => s.output);
  const outputChanged = useAudio((s) => s.outputChanged);
  const midiStatus = useInput((s) => s.midiStatus);
  const [noMidiDismissed, setNoMidiDismissed] = useState(() => readDismissed("pb-nomidi-dismissed"));

  return (
    <>
      {status !== "running" && status !== "error" && (
        <Bar tone="info">
          <Icon name="headphones" />
          <span className="flex-1">
            {status === "suspended"
              ? "The browser paused audio. Resume to keep playing."
              : "Browsers keep sound off until you allow it. Start audio to load the piano."}
          </span>
          <StartAudioButton className="py-1.5" />
        </Bar>
      )}
      {status === "error" && (
        <Bar tone="error">
          <Icon name="warn" />
          <span className="flex-1">Audio could not start: {error}</span>
          <StartAudioButton className="py-1.5" />
        </Bar>
      )}
      {status === "running" && progress && !progress.done && !progress.error && (
        <Bar tone="info">
          <span className="flex-1" aria-live="polite">
            {progress.playable ? "Piano ready. Adding the remaining velocity layers" : "Loading the piano"} ·{" "}
            {progress.loaded}/{progress.total} files
            {progress.fromCache ? ` (${progress.fromCache} from this device)` : ""}
          </span>
          <span className="h-1.5 w-40 overflow-hidden rounded-full bg-white">
            <span
              className="block h-full bg-green transition-[width]"
              style={{ width: `${progress.total ? (progress.loaded / progress.total) * 100 : 0}%` }}
            />
          </span>
        </Bar>
      )}
      {progress?.error && (
        <Bar tone="error">
          <Icon name="warn" />
          <span className="flex-1">Piano samples failed to load: {progress.error}</span>
          <button type="button" className="btn-secondary py-1.5" onClick={() => void engine.loadTier(progress.tier)}>
            Retry
          </button>
        </Bar>
      )}
      {midiStatus === "unsupported" && !noMidiDismissed && (
        <Bar tone="warn">
          <Icon name="midi" />
          <span className="flex-1">
            This browser has no Web MIDI (Safari on macOS and every browser on iOS). Play with the on-screen keys or
            your computer keyboard, or use Chrome or Edge on a computer for a USB keyboard.
          </span>
          <button
            type="button"
            className="btn-ghost py-1.5"
            onClick={() => {
              setNoMidiDismissed(true);
              try {
                localStorage.setItem("pb-nomidi-dismissed", "1");
              } catch {
                /* storage blocked */
              }
            }}
          >
            Dismiss
          </button>
        </Bar>
      )}
      {output?.wireless && (
        <Bar tone="warn">
          <Icon name="headphones" />
          <span className="flex-1">
            Your audio output looks wireless
            {output.deviceLabel ? ` (${output.deviceLabel})` : ""}
            {output.outputLatencyMs ? `, about ${Math.round(output.outputLatencyMs)} ms behind` : ""}. Bluetooth adds
            delay between pressing a key and hearing it. Use wired headphones or speakers for timing practice.
          </span>
        </Bar>
      )}
      {outputChanged && (
        <Bar tone="warn">
          <Icon name="warn" />
          <span className="flex-1">Your audio output changed. Timing offsets measured for the old device may be wrong.</span>
          <Link to="/setup" className="btn-secondary py-1.5" onClick={() => engine.acknowledgeOutputChange()}>
            Check setup
          </Link>
          <button type="button" className="btn-ghost py-1.5" onClick={() => engine.acknowledgeOutputChange()}>
            Dismiss
          </button>
        </Bar>
      )}
    </>
  );
}
