import { useStore } from "zustand";
import type { PracticeSession } from "@/practice/session.ts";
import { SheetView } from "./SheetView.tsx";

/** Sheet music that follows a practice session; clicking a measure jumps there. */
export function SessionSheet({ session, xml }: { session: PracticeSession; xml: string }) {
  const measure = useStore(session.store, (s) => s.measure);
  const chart = session.chart;
  const source = chart.measures[measure]?.sourceIndex ?? 0;
  return (
    <SheetView
      xml={xml}
      current={source}
      className="max-h-[300px]"
      onSelect={(sourceIndex) => {
        const target = chart.measures.find((m) => m.sourceIndex === sourceIndex);
        if (target) session.seekMeasure(target.index);
      }}
    />
  );
}
