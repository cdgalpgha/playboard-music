import { summarize } from "@/audio/latency.ts";
import { useAudio } from "@/state/audio-store.ts";
import { Stat } from "./controls.tsx";

const fmt = (ms: number | undefined) => (ms === undefined ? "—" : `${ms.toFixed(1)} ms`);

/** Live key-to-sound measurement for notes played in this session. */
export function LatencyPanel() {
  const last = useAudio((s) => s.lastLatency);
  const history = useAudio((s) => s.latencyHistory);
  const output = useAudio((s) => s.output);
  const midi = summarize(history.filter((h) => h.source === "midi"));
  const all = summarize(history);
  const pick = midi ?? all;
  return (
    <section className="card" aria-labelledby="latency-title">
      <h2 id="latency-title" className="text-base font-bold">
        Key-to-sound latency
      </h2>
      <p className="mt-1 text-xs text-muted">
        Measured on every note you play: input event → worklet → speaker, using the browser's audio output clock.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat
          label={midi ? "MIDI median" : "Median"}
          value={pick ? fmt(pick.median) : "—"}
          hint={pick ? `p95 ${fmt(pick.p95)} · ${pick.count} notes` : "Play a few notes"}
        />
        <Stat label="Input dispatch" value={fmt(last?.dispatchMs)} hint="MIDI event → handler" />
        <Stat label="Audio path" value={fmt(last?.audioMs)} hint="handler → next audio block → speaker" />
      </div>
      {output && (
        <p className="mt-4 text-xs text-muted">
          Device reports {output.sampleRate / 1000} kHz, base latency {output.baseLatencyMs.toFixed(1)} ms, output
          latency {output.outputLatencyMs.toFixed(1)} ms{output.deviceLabel ? ` (${output.deviceLabel})` : ""}. USB
          transport before the browser sees the key adds about 1 ms.
        </p>
      )}
    </section>
  );
}
