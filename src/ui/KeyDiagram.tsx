import type { Hand } from "@/core/chart.ts";
import { isBlack, keyLayout, noteName } from "@/render/keyboard-geometry.ts";

/** A small static keyboard showing which keys to play and with which fingers. */
export function KeyDiagram({ notes, fingers, hand }: { notes: number[]; fingers?: number[]; hand: Hand }) {
  let low = Math.min(...notes) - 2,
    high = Math.max(...notes) + 2;
  while (isBlack(low)) low--;
  while (isBlack(high)) high++;
  const keys = keyLayout(low, high);
  const width = 320,
    height = 96;
  const fill = hand === "R" ? "#6fc3a0" : "#f0b45c";
  const label = notes.map((n, i) => `${noteName(n)}${fingers?.[i] ? ` finger ${fingers[i]}` : ""}`).join(", ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-sm" role="img" aria-label={`Keys: ${label}`}>
      {keys
        .filter((k) => !k.black)
        .map((k) => (
          <rect
            key={k.note}
            x={k.x * width + 0.5}
            y={0.5}
            width={k.w * width - 1}
            height={height - 1}
            rx={3}
            fill={notes.includes(k.note) ? fill : "#fbfbf8"}
            stroke="#c9d0c4"
          />
        ))}
      {keys
        .filter((k) => k.black)
        .map((k) => (
          <rect key={k.note} x={k.x * width} y={0} width={k.w * width} height={height * 0.6} rx={2} fill={notes.includes(k.note) ? "#3f9c78" : "#1a1f1c"} />
        ))}
      {notes.map((n, i) => {
        const k = keys.find((x) => x.note === n);
        const f = fingers?.[i];
        if (!k || !f) return null;
        const cx = (k.x + k.w / 2) * width;
        const cy = k.black ? height * 0.45 : height - 16;
        return (
          <g key={n}>
            <circle cx={cx} cy={cy} r={9} fill="#263b31" />
            <text x={cx} y={cy + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff">
              {f}
            </text>
          </g>
        );
      })}
      {keys
        .filter((k) => !k.black && k.note % 12 === 0)
        .map((k) => (
          <text key={`l${k.note}`} x={(k.x + k.w / 2) * width} y={height - 3} textAnchor="middle" fontSize={8} fill="#7d877a">
            {noteName(k.note)}
          </text>
        ))}
    </svg>
  );
}
