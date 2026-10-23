import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { findItem, type CatalogItem } from "@/content/catalog.ts";
import "@/content/user-library.ts";
import type { Chart } from "@/core/chart.ts";
import { VideoTransport } from "@/practice/video-transport.ts";
import { loadSyncMap } from "@/storage/sync-maps.ts";
import type { YouTubePlayer } from "@/video/youtube-api.ts";
import { PageHeader } from "../controls.tsx";
import { Icon } from "../Icon.tsx";
import { PracticePlayer, usePracticeSession } from "../practice/PracticePlayer.tsx";
import { SessionSheet } from "../sheet/SessionSheet.tsx";
import { SyncPanel } from "../video/SyncPanel.tsx";
import { VideoPicker, ViewCredit, YouTubeEmbed, type ChosenVideo } from "../video/VideoPicker.tsx";

function Loaded({ item, chart, xml }: { item: CatalogItem; chart: Chart; xml: string | null }) {
  const [videoOpen, setVideoOpen] = useState(false);
  const [chosen, setChosen] = useState<ChosenVideo | null>(null);
  const [transport, setTransport] = useState<VideoTransport | null>(null);
  const [videoError, setVideoError] = useState("");
  const [showSheet, setShowSheet] = useState(true);
  const session = usePracticeSession(
    chart,
    { kind: "song", skills: item.skills },
    // With a video, the recording is the accompaniment: no auto-played hand or clicks by default.
    transport ? { autoplayOther: false, metronome: false } : undefined,
    transport ?? undefined,
  );

  useEffect(() => () => transport?.dispose(), [transport]);

  const closeVideo = () => {
    transport?.dispose();
    setTransport(null);
    setChosen(null);
    setVideoError("");
  };

  const onPlayerReady = async (player: YouTubePlayer) => {
    if (!chosen) return;
    const data = player.videoData();
    if (!chosen.channelTitle && data.author) setChosen({ ...chosen, channelTitle: data.author, title: data.title });
    const map = await loadSyncMap(item.id, chosen.videoId);
    setTransport(new VideoTransport(player, map));
    setShowSheet(false);
  };

  const videoSection = videoOpen && (
    <section className="grid gap-4 lg:grid-cols-2" aria-label="YouTube play-along">
      <div className="card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold">Play along with YouTube</h2>
          {chosen && (
            <button type="button" className="btn-ghost py-1" onClick={closeVideo}>
              Choose another video
            </button>
          )}
        </div>
        {chosen ? (
          <>
            <YouTubeEmbed videoId={chosen.videoId} onReady={(p) => void onPlayerReady(p)} onError={setVideoError} />
            {videoError && <p className="text-sm text-bad">{videoError}</p>}
            <ViewCredit video={chosen} />
          </>
        ) : (
          <VideoPicker title={item.title} artist={item.composer} onChoose={setChosen} />
        )}
      </div>
      {transport && chosen ? (
        <SyncPanel chart={chart} transport={transport} songId={item.id} videoId={chosen.videoId} />
      ) : (
        <div className="card space-y-2 text-sm text-ink-soft">
          <h2 className="text-base font-bold text-ink">How play-along works</h2>
          <p>
            The video plays in YouTube's own player and the falling notes follow it. Pause, seek or change speed with
            either set of controls. Playboard never downloads or records the video or its sound.
          </p>
          <p>Sync is saved per video, so the second time it lines up straight away.</p>
        </div>
      )}
    </section>
  );

  return (
    <div className="space-y-3 px-4 lg:px-8">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={videoOpen ? "btn-secondary" : "btn-primary"}
          aria-expanded={videoOpen}
          onClick={() => {
            if (videoOpen) closeVideo();
            setVideoOpen(!videoOpen);
          }}
        >
          <Icon name="youtube" size={16} /> {videoOpen ? "Close video" : "Play along with a YouTube video"}
        </button>
        {xml && (
          <label className="flex items-center gap-2 text-xs text-ink-soft">
            <input type="checkbox" className="accent-green" checked={showSheet} onChange={(e) => setShowSheet(e.target.checked)} />
            Show sheet music
          </label>
        )}
        {transport && <span className="chip text-green">Synced to the video</span>}
      </div>
      {/* Outside the player so a new session never remounts (and restarts) the YouTube embed. */}
      {videoSection}
      <PracticePlayer
        chart={chart}
        session={session}
        above={xml && showSheet ? <SessionSheet session={session} xml={xml} transpose={item.sheetTranspose ?? 0} /> : undefined}
      />
      <p className="mt-6 text-xs text-muted">{item.license.attribution}</p>
    </div>
  );
}

export default function Piece() {
  const { id = "" } = useParams();
  const [loaded, setLoaded] = useState<{ item: CatalogItem; chart: Chart; xml: string | null } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    setError("");
    void (async () => {
      try {
        const found = await findItem(id);
        if (!found) throw new Error("This piece is not in your library.");
        const chart = await found.provider.loadChart(found.item);
        const xml = (await found.provider.loadMusicXml?.(found.item)) ?? null;
        if (!cancelled) setLoaded({ item: found.item, chart, xml });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="pb-12">
      <PageHeader eyebrow="Practise" title={loaded?.item.title ?? (error ? "Piece not found" : "Loading…")}>
        {loaded && (
          <>
            {loaded.item.composer}
            {loaded.item.arranger ? ` · arranged by ${loaded.item.arranger}` : ""}
            {loaded.item.kind === "user" && (
              <>
                {" "}
                ·{" "}
                <Link to={`/import?edit=${loaded.item.id}`} className="text-green underline">
                  Edit tempo, key and hands
                </Link>
              </>
            )}
          </>
        )}
        {error && (
          <>
            {error}{" "}
            <Link to="/pieces" className="text-green underline">
              Back to pieces
            </Link>
          </>
        )}
      </PageHeader>
      {loaded && <Loaded key={loaded.item.id} item={loaded.item} chart={loaded.chart} xml={loaded.xml} />}
    </div>
  );
}
