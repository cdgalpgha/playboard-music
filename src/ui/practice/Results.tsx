import type { Judgement, SessionSummary } from "@/core/scoring.ts";

export const JUDGEMENT_STYLE: Record<Judgement | "wrong", { label: string; color: string }> = {
  perfect: { label: "Perfect", color: "#2f9e6e" },
  good: { label: "Good", color: "#6e9f3c" },
  early: { label: "Early", color: "#b88a1e" },
  late: { label: "Late", color: "#c4682a" },
  miss: { label: "Miss", color: "#b23b3b" },
  wrong: { label: "Wrong", color: "#8a3b3b" },
};

export function TimingHistogram({ summary }: { summary: SessionSummary }) {
  const { histogram, binMs, fromMs } = summary.timing;
  if (!histogram.length) return null;
  const max = Math.max(1, ...histogram);
  const width = 360,
    height = 90;
  const bw = width / histogram.length;
  const zeroX = ((0 - fromMs) / binMs) * bw;
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${width} ${height + 18}`} className="w-full max-w-md" role="img" aria-labelledby="hist-cap">
        {histogram.map((c, i) => {
          const h = (c / max) * height;
          const center = fromMs + (i + 0.5) * binMs;
          const fill = Math.abs(center) <= 40 ? "#57d19a" : Math.abs(center) <= 90 ? "#9bd06a" : center < 0 ? "#f0c35c" : "#f09a5c";
          return <rect key={i} x={i * bw + 0.5} y={height - h} width={bw - 1} height={h} fill={fill} rx={1.5} />;
        })}
        <line x1={zeroX} x2={zeroX} y1={0} y2={height} stroke="#263b31" strokeWidth={1} strokeDasharray="3 2" />
        <text x={0} y={height + 14} fontSize={10} fill="#7d877a">
          {fromMs} ms early
        </text>
        <text x={zeroX} y={height + 14} fontSize={10} fill="#7d877a" textAnchor="middle">
          0
        </text>
        <text x={width} y={height + 14} fontSize={10} fill="#7d877a" textAnchor="end">
          +{-fromMs} ms late
        </text>
      </svg>
      <figcaption id="hist-cap" className="text-xs text-muted">
        Timing of every correct note.{" "}
        {Math.abs(summary.timing.meanMs) < 5
          ? "On average you are right on the beat."
          : `On average you play ${Math.round(Math.abs(summary.timing.meanMs))} ms ${summary.timing.meanMs < 0 ? "early" : "late"}.`}{" "}
        Spread ±{Math.round(summary.timing.sdMs)} ms.
      </figcaption>
    </figure>
  );
}

export function ResultsPanel({
  summary,
  onLoop,
  title = "Results",
}: {
  summary: SessionSummary;
  onLoop?: (measure: number) => void;
  title?: string;
}) {
  const judgements: Judgement[] = ["perfect", "good", "early", "late", "miss"];
  return (
    <section className="card space-y-5" aria-labelledby="results-title" data-testid="results">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <h2 id="results-title" className="eyebrow">
            {title}
          </h2>
          <div className="font-display text-4xl font-bold text-green-dark tabular-nums" data-testid="accuracy">
            {Math.round(summary.accuracy)}%
          </div>
          <div className="text-xs text-muted">{summary.mode === "wait" ? "pitch accuracy (wait-for-me)" : "accuracy"}</div>
        </div>
        <ul className="flex flex-wrap gap-2" aria-label="Notes by judgement">
          {judgements.map((j) => (
            <li key={j} className="chip" style={{ color: JUDGEMENT_STYLE[j].color }}>
              <span className="font-bold tabular-nums">{summary.counts[j]}</span> {JUDGEMENT_STYLE[j].label}
            </li>
          ))}
          <li className="chip" style={{ color: JUDGEMENT_STYLE.wrong.color }}>
            <span className="font-bold tabular-nums">{summary.wrong}</span> Wrong notes
          </li>
        </ul>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {summary.mode === "timed" && <TimingHistogram summary={summary} />}
        <div className="space-y-3 text-sm">
          {summary.velocityConsistency !== null && (
            <p>
              <strong>Velocity consistency {Math.round(summary.velocityConsistency * 100)}%</strong>
              <span className="block text-xs text-muted">
                How evenly you play notes marked at the same dynamic. Above 85% is very even.
              </span>
            </p>
          )}
          {(summary.hands.L !== undefined || summary.hands.R !== undefined) && (
            <p>
              {summary.hands.R !== undefined && <span className="mr-4">Right hand {Math.round(summary.hands.R)}%</span>}
              {summary.hands.L !== undefined && <span>Left hand {Math.round(summary.hands.L)}%</span>}
            </p>
          )}
          {summary.weakSpots.length > 0 && (
            <div>
              <strong>Weak spots</strong>
              <ul className="mt-1 space-y-1">
                {summary.weakSpots.map((w) => (
                  <li key={w.measure} className="flex items-center gap-3">
                    <span>
                      Measure {w.label}: {w.errors} {w.errors === 1 ? "error" : "errors"} in {w.notes} notes
                    </span>
                    {onLoop && (
                      <button type="button" className="text-xs font-semibold text-green underline" onClick={() => onLoop(w.measure)}>
                        Loop it
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
