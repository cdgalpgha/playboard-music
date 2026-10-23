import { useEffect, useState } from "react";
import { Link } from "react-router";
import { builtinProvider, type CatalogItem } from "@/content/catalog.ts";
import { userProvider } from "@/content/user-library.ts";
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
  const [mine, setMine] = useState<CatalogItem[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    builtinProvider.list().then(setItems, (e: Error) => setError(e.message));
    void userProvider.list().then(setMine);
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
      <section className="mt-8 px-4 lg:px-8" aria-labelledby="mine-title">
        <h2 id="mine-title" className="eyebrow mb-2">
          My library · private to this device
        </h2>
        {mine.length ? (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {mine.map((m) => (
              <li key={m.id}>
                <Link to={`/pieces/${m.id}`} className="card flex items-center justify-between gap-3 py-3 hover:shadow-md">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-green-dark">{m.title}</span>
                    <span className="block truncate text-xs text-muted">{m.description}</span>
                  </span>
                  <Icon name="arrow" size={16} className="text-green" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            <Link to="/import" className="text-green underline">
              Import a MIDI or MusicXML file
            </Link>{" "}
            to practise your own music.
          </p>
        )}
      </section>
    </div>
  );
}
