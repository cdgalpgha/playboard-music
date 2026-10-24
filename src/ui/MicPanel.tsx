import { startMic, stopMic } from "@/input/mic/mic-input.ts";
import { noteName } from "@/render/keyboard-geometry.ts";
import { useInput } from "@/state/input-store.ts";
import { Icon } from "./Icon.tsx";

export const MIC_CAVEAT =
  "Less accurate than MIDI: notes are recognised from sound about half a second late, soft or very fast notes can be missed, and loudness is estimated.";

/** Start/stop microphone listening, with level, detected notes and honest numbers. */
export function MicPanel() {
  const mic = useInput((s) => s.mic);
  const listening = mic.status === "listening" || mic.status === "starting";
  return (
    <div className="space-y-2" data-testid="mic-panel">
      <p>
        Playing an acoustic piano, or a keyboard without USB? Playboard can listen through your microphone.{" "}
        <span className="chip text-warn">Less accurate</span>
      </p>
      <p className="text-xs text-muted">
        {MIC_CAVEAT} Use headphones so Playboard's own sound is not picked up.
      </p>
      {mic.status === "unsupported" ? (
        <p className="text-bad">This browser does not offer microphone input.</p>
      ) : listening ? (
        <button type="button" className="btn-secondary" onClick={stopMic}>
          <Icon name="mic" size={16} /> Stop listening
        </button>
      ) : (
        <button type="button" className="btn-primary" onClick={() => void startMic()}>
          <Icon name="mic" size={16} /> Listen through the microphone
        </button>
      )}
      {mic.status === "starting" && <p role="status">Loading the note detector…</p>}
      {mic.status === "denied" && (
        <p className="text-bad">Microphone access was blocked. Allow it in the site settings (left of the address bar), then try again.</p>
      )}
      {mic.status === "error" && <p className="text-bad">The microphone could not start: {mic.error}</p>}
      {mic.status === "listening" && (
        <div className="space-y-1.5" aria-live="polite">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold">Level</span>
            <span className="h-2 w-40 overflow-hidden rounded-full bg-line">
              <span className="block h-full bg-green" style={{ width: `${Math.round(mic.level * 100)}%` }} />
            </span>
          </div>
          <p data-testid="mic-notes">
            Heard: {mic.lastNotes.length ? mic.lastNotes.slice(-8).map((n) => noteName(n)).join(" ") : "nothing yet, play a note"}
          </p>
          <p className="text-xs text-muted">
            Detector on {mic.backend || "…"} · {mic.blocks ? `${mic.inferences} analyses` : "waiting for audio"} ·{" "}
            {mic.inferenceMs} ms per analysis
            {mic.delayMs ? ` · notes arrive about ${mic.delayMs} ms after they sound` : ""}
          </p>
          {(mic.backlogSec > 1 || mic.skipped > 0) && (
            <p className="text-xs text-warn">
              This device analyses sound slower than real time, so notes arrive late
              {mic.skipped ? " and some passages were skipped" : ""}. A MIDI keyboard avoids this.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
