import { useEffect, useRef, useState } from "react";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { useMediaQuery } from "../useMediaQuery.ts";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** OSMD lays out in units of 10 px at zoom 1. */
const UNIT_PX = 10;

interface GraphicalMeasureLike {
  PositionAndShape: {
    AbsolutePosition: { x: number; y: number };
    BorderLeft: number;
    BorderRight: number;
    BorderTop: number;
    BorderBottom: number;
  };
}

function measureBoxes(osmd: OpenSheetMusicDisplay): Box[] {
  const list = (osmd.GraphicSheet as unknown as { MeasureList: (GraphicalMeasureLike | undefined)[][] }).MeasureList;
  const scale = UNIT_PX * osmd.zoom;
  return list.map((staves) => {
    let x = Infinity,
      y = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    for (const m of staves) {
      if (!m) continue;
      const p = m.PositionAndShape;
      x = Math.min(x, p.AbsolutePosition.x + p.BorderLeft);
      right = Math.max(right, p.AbsolutePosition.x + p.BorderRight);
      y = Math.min(y, p.AbsolutePosition.y + Math.min(p.BorderTop, -1));
      bottom = Math.max(bottom, p.AbsolutePosition.y + Math.max(p.BorderBottom, 5));
    }
    return Number.isFinite(x) ? { x: x * scale, y: y * scale, w: (right - x) * scale, h: (bottom - y) * scale } : { x: 0, y: 0, w: 0, h: 0 };
  });
}

/**
 * Sheet music for a MusicXML score with the current measure highlighted.
 * `current` is a measure index in the source file (Measure.sourceIndex).
 */
export function SheetView({
  xml,
  current,
  onSelect,
  transpose = 0,
  className = "",
}: {
  xml: string;
  current: number;
  onSelect?: (sourceIndex: number) => void;
  /** Semitones; uses OSMD's transpose plugin so the notation matches transposed playback. */
  transpose?: number;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const osmd = useRef<OpenSheetMusicDisplay | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    let width = 0;
    setLoading(true);
    void (async () => {
      try {
        const { OpenSheetMusicDisplay, TransposeCalculator } = await import("opensheetmusicdisplay");
        if (cancelled || !host.current) return;
        host.current.innerHTML = "";
        const o = new OpenSheetMusicDisplay(host.current, {
          autoResize: false,
          backend: "svg",
          drawTitle: false,
          drawSubtitle: false,
          drawComposer: false,
          drawLyricist: false,
          drawPartNames: false,
          drawMeasureNumbersOnlyAtSystemStart: true,
          autoBeam: true,
          followCursor: false,
        });
        await o.load(xml);
        if (cancelled) return;
        if (transpose) {
          o.TransposeCalculator = new TransposeCalculator();
          o.Sheet.Transpose = transpose;
          o.updateGraphic();
        }
        o.render();
        osmd.current = o;
        setBoxes(measureBoxes(o));
        setLoading(false);
        width = host.current.clientWidth;
        // Re-layout when the width changes (OSMD's own autoResize would re-render too often).
        observer = new ResizeObserver(() => {
          const w = host.current?.clientWidth ?? 0;
          if (Math.abs(w - width) < 8) return;
          width = w;
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            if (cancelled) return;
            o.render();
            setBoxes(measureBoxes(o));
          }, 150);
        });
        observer.observe(host.current);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(resizeTimer);
      observer?.disconnect();
      osmd.current?.clear();
      osmd.current = null;
    };
  }, [xml, transpose]);

  const box = boxes[current];
  useEffect(() => {
    const el = scroller.current;
    if (!el || !box) return;
    const top = box.y - 12,
      bottom = box.y + box.h + 12;
    if (top < el.scrollTop || bottom > el.scrollTop + el.clientHeight)
      el.scrollTo({ top: Math.max(0, top), behavior: reducedMotion ? "auto" : "smooth" });
  }, [box, reducedMotion]);

  return (
    <div
      ref={scroller}
      className={`relative overflow-y-auto rounded-2xl border border-line bg-white ${className}`}
      aria-label="Sheet music"
      role="region"
    >
      {loading && !error && (
        <p className="p-4 text-sm text-muted" role="status">
          Engraving the score…
        </p>
      )}
      {error && <p className="p-4 text-sm text-bad">The sheet music could not be shown: {error}</p>}
      <div className="relative">
        {box && box.w > 0 && (
          <div
            data-testid="measure-highlight"
            data-measure={current}
            aria-hidden="true"
            className="pointer-events-none absolute rounded-lg bg-sage/35 ring-2 ring-green/40"
            style={{ left: box.x - 4, top: box.y, width: box.w + 8, height: box.h }}
          />
        )}
        <div ref={host} className="relative" />
        {onSelect &&
          boxes.map((b, i) => (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              className="absolute rounded-lg opacity-0 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-green"
              style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
              aria-label={`Go to measure ${i + 1}`}
              onClick={() => onSelect(i)}
            />
          ))}
      </div>
    </div>
  );
}
