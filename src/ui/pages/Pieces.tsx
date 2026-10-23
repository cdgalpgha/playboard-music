import { useEffect, useState } from "react";
import { Link } from "react-router";
import { builtinProvider, type CatalogItem } from "@/content/catalog.ts";
import { PageHeader } from "../controls.tsx";
import { Icon } from "../Icon.tsx";

export function PieceCard({ item, to }: { item: CatalogItem; to: string }) {
  return (
    <Link to={to} className="card block transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-green-dark">{item.title}</h2>
          <p className="text-sm text-ink-soft">{item.composer}</p>
        </div>
        <span className="chip shrink-0">Level {item.level}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{item.description}</p>
      <div className="mt-3 flex items-center gap-3 text-xs text-muted">
        <span>
          {item.measures} measures · {Math.floor(item.durationSec / 60)}:{String(item.durationSec % 60).padStart(2, "0")}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 font-semibold text-green">
          Practise <Icon name="arrow" size={14} />
        </span>
      </div>
    </Link>
  );
}

export default function Pieces() {
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    builtinProvider.list().then(setItems, (e: Error) => setError(e.message));
  }, []);
  return (
    <div className="pb-12">
      <PageHeader eyebrow="Pieces" title="Practise a piece">
        Public-domain music in arrangements written for Playboard. Slow it down, loop the hard bars, practise hands
        separately, or let the music wait for you.
      </PageHeader>
      <div className="grid gap-4 px-4 sm:grid-cols-2 lg:px-8 xl:grid-cols-3">
        {error && <p className="text-bad">{error}</p>}
        {items?.map((item) => <PieceCard key={item.id} item={item} to={`/pieces/${item.id}`} />)}
      </div>
    </div>
  );
}
