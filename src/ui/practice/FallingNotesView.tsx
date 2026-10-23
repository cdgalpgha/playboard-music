import { useEffect, useRef } from "react";
import type { Hand } from "@/core/chart.ts";
import type { PracticeSession } from "@/practice/session.ts";
import { FallingNotesRenderer } from "@/render/falling-notes.ts";

interface Props {
  session: PracticeSession;
  low: number;
  high: number;
  secondsAhead: number;
  showFingers: boolean;
  reducedMotion: boolean;
  onExpected: (expected: Map<number, Hand>) => void;
}

export function FallingNotesView({ session, low, high, secondsAhead, showFingers, reducedMotion, onExpected }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<FallingNotesRenderer | null>(null);
  const expectedCb = useRef(onExpected);
  expectedCb.current = onExpected;

  useEffect(() => {
    if (!canvas.current) return;
    const r = new FallingNotesRenderer(canvas.current, session, { low, high, secondsAhead, showFingers, reducedMotion });
    r.onExpected = (e) => expectedCb.current(e);
    renderer.current = r;
    r.start();
    const onVisibility = () => (document.hidden ? r.stop() : r.start());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      r.dispose();
      renderer.current = null;
    };
    // The renderer is rebuilt only for a new session; options update below.
  }, [session]);

  useEffect(() => {
    renderer.current?.setOptions({ low, high, secondsAhead, showFingers, reducedMotion });
  }, [low, high, secondsAhead, showFingers, reducedMotion]);

  return (
    <canvas
      ref={canvas}
      className="block h-full w-full"
      role="img"
      aria-label="Falling notes: upcoming notes move down toward the keyboard. Green is the right hand, amber the left."
    />
  );
}
