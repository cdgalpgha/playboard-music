import { useEffect, useRef, useState } from "react";
import type { Chart } from "@/core/chart.ts";
import { firstNoteAtOrAfter } from "@/core/chart.ts";
import { SyncMap } from "@/core/sync-map.ts";
import { inputBus } from "@/input/input-bus.ts";
import type { VideoTransport } from "@/practice/video-transport.ts";
import { offsetStore } from "@/storage/devices.ts";
import { saveSyncMap } from "@/storage/sync-maps.ts";

/**
 * Lines the chart up with the video: mark where the first note is heard,
 * tap the beat to fit the video's tempo, and nudge with the offset.
 */
export function SyncPanel({
  chart,
  transport,
  songId,
  videoId,
}: {
  chart: Chart;
  transport: VideoTransport;
  songId: string;
  videoId: string;
}) {
  const [map, setMap] = useState<SyncMap>(transport.syncMap);
  const [tapping, setTapping] = useState(false);
  const [taps, setTaps] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apply = (next: SyncMap) => {
    transport.setSyncMap(next);
    setMap(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveSyncMap(songId, videoId, next), 400);
  };

  // Tap along: every key, pedal press or Space while tapping is one beat.
  useEffect(() => {
    if (!tapping) return;
    return inputBus.subscribe((e) => {
      if (e.source === "playback") return;
      if (e.type === "noteon" || (e.type === "pedal" && e.value >= 64)) {
        const at = e.time - offsetStore.getState().inputOffsetMs;
        setTaps((t) => [...t, transport.clock.time(at)]);
      }
    });
  }, [tapping, transport]);

  const firstNote = chart.notes[firstNoteAtOrAfter(chart.notes, 0)];

  const markStart = (perf: number) => {
    if (!firstNote) return;
    const videoSec = transport.clock.time(perf - offsetStore.getState().inputOffsetMs);
    apply(map.withStart(videoSec, firstNote.start));
    setMessage(`First note set at ${videoSec.toFixed(2)} s in the video.`);
  };

  const finishTapping = () => {
    setTapping(false);
    if (taps.length < 4) {
      setMessage("Tap at least four beats, then press Done.");
      setTaps([]);
      return;
    }
    // Pair the taps with consecutive chart beats, starting from the beat the current map puts nearest the first tap.
    const firstChart = map.videoToChart(taps[0]!);
    let start = 0;
    for (let i = 0; i < chart.beats.length; i++)
      if (Math.abs(chart.beats[i]!.time - firstChart) < Math.abs(chart.beats[start]!.time - firstChart)) start = i;
    const beats = chart.beats.slice(start, start + taps.length).map((b) => b.time);
    const next = map.withTaps(taps, beats);
    if (!next) setMessage("Those taps were too uneven to fit a tempo. Try again, tapping every beat.");
    else {
      apply(next);
      setMessage(`Fitted ${taps.length} beats: the video runs at ${Math.round(next.slopeAt(taps[0]!) * 100)}% of the written tempo.`);
    }
    setTaps([]);
  };

  const nudge = (ms: number) => apply(map.withOffset(map.offsetMs + ms));

  return (
    <section className="card space-y-3" aria-labelledby="sync-title">
      <h2 id="sync-title" className="text-base font-bold">
        Sync with the video
      </h2>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
        <li>Play the video. When you hear the first note, press “First note now”.</li>
        <li>If the recording is faster or slower than the score, tap the beat for a few bars.</li>
        <li>Fine-tune with the offset until the falling notes land with the music.</li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" onClick={(e) => markStart(e.timeStamp)} disabled={!firstNote}>
          First note now
        </button>
        {tapping ? (
          <button type="button" className="btn-primary" onClick={finishTapping}>
            Done · {taps.length} taps
          </button>
        ) : (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setTaps([]);
              setTapping(true);
              setMessage("Tap any key or the pedal on every beat.");
            }}
          >
            Tap the beat
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={() => apply(new SyncMap())}>
          Reset
        </button>
      </div>
      <div>
        <label className="field-label" htmlFor="sync-offset">
          Offset: notes {map.offsetMs === 0 ? "exactly on" : `${Math.abs(map.offsetMs)} ms ${map.offsetMs > 0 ? "later than" : "earlier than"}`} the
          video
        </label>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-ghost px-2 py-1" onClick={() => nudge(-100)} aria-label="Notes 100 ms earlier">
            −100
          </button>
          <button type="button" className="btn-ghost px-2 py-1" onClick={() => nudge(-10)} aria-label="Notes 10 ms earlier">
            −10
          </button>
          <input
            id="sync-offset"
            type="range"
            min={-2000}
            max={2000}
            step={10}
            value={map.offsetMs}
            onChange={(e) => apply(map.withOffset(Number(e.target.value)))}
            className="min-w-0 flex-1 accent-green"
          />
          <button type="button" className="btn-ghost px-2 py-1" onClick={() => nudge(10)} aria-label="Notes 10 ms later">
            +10
          </button>
          <button type="button" className="btn-ghost px-2 py-1" onClick={() => nudge(100)} aria-label="Notes 100 ms later">
            +100
          </button>
        </div>
      </div>
      {message && (
        <p className="text-sm text-green-dark" role="status">
          {message}
        </p>
      )}
      <p className="text-xs text-muted">
        Saved for this song and this video on this device.
        {transport.clock.sourceInterpolates ? "" : " The player reports time coarsely; Playboard smooths it."}
      </p>
    </section>
  );
}
