import { useStore } from "zustand";
import type { PracticeSession } from "@/practice/session.ts";
import { SheetView } from "./SheetView.tsx";

/** Sheet music that follows a practice session; clicking a measure jumps there. */
export function SessionSheet({ session, xml, transpose = 0 }: { session: PracticeSession; xml: string; transpose?: number }) {
  const measure = useStore(session.store, (s) => s.measure);
  const chart = session.chart;
  const source = chart.measures[measure]?.sourceIndex ?? 0;
  return (
    <SheetView
      xml={xml}
      transpose={transpose}
      current={source}
      className="max-h-[300px]"
      onSelect={(sourceIndex) => {
        const target = chart.measures.find((m) => m.sourceIndex === sourceIndex);
        if (target) session.seekMeasure(target.index);
      }}
    />
  );
}
