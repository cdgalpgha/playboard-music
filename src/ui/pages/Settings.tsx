import { useEffect, useState } from "react";
import { engine } from "@/audio/engine.ts";
import { clearSampleCache, sampleCacheBytes } from "@/audio/samples/cache.ts";
import { supportsOpus } from "@/audio/samples/loader.ts";
import { TIER_LABELS, type SampleTier } from "@/audio/samples/manifest.ts";
import { inputBus } from "@/input/input-bus.ts";
import { useAudio } from "@/state/audio-store.ts";
import { setSetting } from "@/storage/db.ts";
import { setYoutubeApiKey, youtubeApiKey } from "@/storage/sync-maps.ts";
import { PageHeader, Toggle } from "../controls.tsx";
import { StartAudioButton } from "../StartAudioButton.tsx";

export default function Settings() {
  const tier = useAudio((s) => s.tier);
  const status = useAudio((s) => s.status);
  const progress = useAudio((s) => s.progress);
  const [cacheBytes, setCacheBytes] = useState<number | null>(null);
  const [monitor, setMonitor] = useState(inputBus.monitor);
  const opus = supportsOpus();
  const [apiKey, setApiKey] = useState("");
  const [keySaved, setKeySaved] = useState(false);
  const envKey = Boolean(import.meta.env.VITE_YOUTUBE_API_KEY);
  useEffect(() => void youtubeApiKey().then(setApiKey), []);

  useEffect(() => {
    void sampleCacheBytes().then(setCacheBytes);
  }, [progress?.done]);

  const tiers: SampleTier[] = opus ? ["lite", "studio", "compat"] : ["compat"];

  return (
    <div className="pb-12">
      <PageHeader eyebrow="Settings" title="Sound and storage" />
      <div className="grid gap-4 px-4 lg:px-8 xl:grid-cols-2">
        <section className="card space-y-3" aria-labelledby="tier-title">
          <h2 id="tier-title" className="text-base font-bold">
            Piano sample tier
          </h2>
          {!opus && (
            <p className="text-sm text-warn">
              This browser cannot decode Ogg Opus, so only the compatibility samples are available.
            </p>
          )}
          <fieldset className="space-y-2">
            <legend className="sr-only">Sample tier</legend>
            {tiers.map((t) => (
              <label key={t} className="flex items-start gap-3 rounded-xl border border-line p-3">
                <input
                  type="radio"
                  name="tier"
                  className="mt-1 accent-green"
                  checked={tier === t}
                  disabled={status !== "running"}
                  onChange={() => void engine.loadTier(t)}
                />
                <span>
                  <span className="block text-sm font-semibold">{TIER_LABELS[t].name}</span>
                  <span className="block text-xs text-muted">{TIER_LABELS[t].detail}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {status !== "running" && <StartAudioButton />}
          <p className="text-xs text-muted">
            Samples are saved on this device after the first download
            {cacheBytes !== null ? ` (${(cacheBytes / 1e6).toFixed(1)} MB stored now)` : ""}.
          </p>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void clearSampleCache().then(() => setCacheBytes(0))}
          >
            Delete downloaded samples
          </button>
        </section>

        <section className="card space-y-3" aria-labelledby="yt-title">
          <h2 id="yt-title" className="text-base font-bold">
            YouTube search
          </h2>
          <p className="text-sm text-ink-soft">
            Searching YouTube from Playboard needs a YouTube Data API v3 key from the Google Cloud console. Without one,
            you can still paste video links. Restrict the key to this website's address so nobody else can use it.
          </p>
          {envKey ? (
            <p className="text-sm text-green-dark">This installation provides a key, so search is ready.</p>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void setYoutubeApiKey(apiKey).then(() => setKeySaved(true));
              }}
            >
              <label className="sr-only" htmlFor="yt-key">
                YouTube Data API key
              </label>
              <input
                id="yt-key"
                className="input-select font-mono"
                autoComplete="off"
                spellCheck={false}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setKeySaved(false);
                }}
                placeholder="AIza…"
              />
              <button className="btn-secondary">{keySaved ? "Saved" : "Save"}</button>
            </form>
          )}
          <p className="text-xs text-muted">The key is kept in this browser only.</p>
        </section>

        <section className="card space-y-4" aria-labelledby="monitor-title">
          <h2 id="monitor-title" className="text-base font-bold">
            Input sound
          </h2>
          <Toggle
            label="Play the app's piano when I press keys"
            description="Turn off if your digital piano's own speakers are on, so you don't hear two pianos."
            checked={monitor}
            onChange={(v) => {
              inputBus.monitor = v;
              setMonitor(v);
              void setSetting("monitor", v);
            }}
          />
        </section>
      </div>
    </div>
  );
}
