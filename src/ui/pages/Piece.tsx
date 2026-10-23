import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { findItem, type CatalogItem } from "@/content/catalog.ts";
import type { Chart } from "@/core/chart.ts";
import { PageHeader } from "../controls.tsx";
import { PracticePlayer, usePracticeSession } from "../practice/PracticePlayer.tsx";
import { SessionSheet } from "../sheet/SessionSheet.tsx";

function Loaded({ item, chart, xml }: { item: CatalogItem; chart: Chart; xml: string | null }) {
  const session = usePracticeSession(chart, { kind: "song", skills: item.skills });
  const [showSheet, setShowSheet] = useState(true);
  return (
    <div className="px-4 lg:px-8">
      {xml && (
        <label className="mb-2 flex items-center gap-2 text-xs text-ink-soft">
          <input type="checkbox" className="accent-green" checked={showSheet} onChange={(e) => setShowSheet(e.target.checked)} />
          Show sheet music
        </label>
      )}
      <PracticePlayer
        chart={chart}
        session={session}
        above={xml && showSheet ? <SessionSheet session={session} xml={xml} /> : undefined}
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
