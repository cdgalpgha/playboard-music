import { useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import { inputBus } from "@/input/input-bus.ts";
import { QWERTY_LABELS, QWERTY_MAP } from "@/input/computer-keyboard.ts";
import { keyLayout, noteName } from "@/render/keyboard-geometry.ts";
import { engine } from "@/audio/engine.ts";

export type Hand = "L" | "R";

interface Props {
  low: number;
  high: number;
  /** Notes the player should press now, coloured by hand. */
  expected?: ReadonlyMap<number, Hand>;
  labels?: "none" | "c" | "qwerty" | "chords";
  qwertyOctave?: number;
  className?: string;
}

const subscribe = (cb: () => void) => inputBus.subscribeView(cb);
const snapshot = () => inputBus.version;

/** Velocity from where the key is struck: the front edge plays louder, like a real key. */
function velocityFromPointer(e: PointerEvent<HTMLElement>): number {
  const rect = e.currentTarget.getBoundingClientRect();
  const f = Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));
  return Math.round(42 + 80 * f);
}

export function PianoKeyboard({ low, high, expected, labels = "c", qwertyOctave = 4, className = "" }: Props) {
  useSyncExternalStore(subscribe, snapshot);
  const keys = useMemo(() => keyLayout(low, high), [low, high]);
  const pointerNotes = useRef(new Map<number, number>());
  const [focusNote, setFocusNote] = useState(60 >= low && 60 <= high ? 60 : low);

  const qwertyByNote = useMemo(() => {
    const map = new Map<number, string>();
    for (const [code, offset] of Object.entries(QWERTY_MAP))
      map.set(12 * (qwertyOctave + 1) + offset, QWERTY_LABELS[code]!);
    return map;
  }, [qwertyOctave]);

  const press = (pointerId: number, note: number, velocity: number, time: number) => {
    const previous = pointerNotes.current.get(pointerId);
    if (previous === note) return;
    if (previous !== undefined) inputBus.emit({ type: "noteoff", note: previous, time, source: "pointer" });
    pointerNotes.current.set(pointerId, note);
    inputBus.emit({ type: "noteon", note, velocity, time, source: "pointer" });
  };

  const release = (pointerId: number, time: number) => {
    const note = pointerNotes.current.get(pointerId);
    if (note === undefined) return;
    pointerNotes.current.delete(pointerId);
    inputBus.emit({ type: "noteoff", note, time, source: "pointer" });
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>, note: number) => {
    e.preventDefault();
    if (!engine.running) void engine.start();
    e.currentTarget.setPointerCapture(e.pointerId);
    press(e.pointerId, note, velocityFromPointer(e), e.timeStamp);
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!pointerNotes.current.has(e.pointerId)) return;
    // Glissando: the captured pointer follows whichever key is under it.
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-note]");
    const note = el ? Number(el.dataset.note) : NaN;
    if (Number.isFinite(note)) press(e.pointerId, note, velocityFromPointer(e), e.timeStamp);
  };

  const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => release(e.pointerId, e.timeStamp);

  // Roving focus: one key is tabbable, arrows move between keys, Enter plays.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (step) {
      e.preventDefault();
      const next = Math.max(low, Math.min(high, focusNote + step));
      setFocusNote(next);
      document.querySelector<HTMLElement>(`[data-note="${next}"]`)?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (!engine.running) void engine.start();
      press(-1, focusNote, 80, e.timeStamp);
      setTimeout(() => release(-1, performance.now()), 450);
    }
  };

  const whites = keys.filter((k) => !k.black);
  const blacks = keys.filter((k) => k.black);

  const keyButton = (k: (typeof keys)[number]) => {
    const held = inputBus.isHeld(k.note);
    const hand = expected?.get(k.note);
    const label =
      labels === "qwerty"
        ? qwertyByNote.get(k.note)
        : labels === "chords"
          ? !k.black && Math.floor(k.note / 12) - 1 === qwertyOctave
            ? noteName(k.note).replace(/\d+$/, "")
            : null
          : labels === "c" && k.note % 12 === 0
            ? noteName(k.note)
            : null;
    const base = k.black
      ? "absolute top-0 z-10 h-[62%] rounded-b-md border border-black/60 shadow-[inset_0_-4px_0_rgba(255,255,255,0.08)]"
      : "absolute top-0 h-full rounded-b-lg border border-black/15";
    let fill = k.black ? "bg-[#1a1f1c]" : "bg-[#fbfbf8]";
    if (hand && !held) fill = hand === "R" ? (k.black ? "bg-rh-deep" : "bg-rh/55") : k.black ? "bg-lh-deep" : "bg-lh/55";
    if (held) fill = hand === "L" ? "bg-lh" : hand === "R" ? "bg-rh" : k.black ? "bg-[#5d8c74]" : "bg-sage";
    return (
      <button
        key={k.note}
        type="button"
        data-note={k.note}
        data-held={held || undefined}
        data-expected={hand}
        aria-label={noteName(k.note)}
        aria-pressed={held}
        tabIndex={k.note === focusNote ? 0 : -1}
        className={`${base} ${fill} flex touch-none items-end justify-center pb-1.5 select-none`}
        style={{ left: `${k.x * 100}%`, width: `${k.w * 100}%` }}
        onPointerDown={(e) => onPointerDown(e, k.note)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={onPointerUp}
        onFocus={() => setFocusNote(k.note)}
      >
        {label ? (
          <span className={`text-[10px] font-semibold ${k.black ? "text-white/70" : "text-ink-soft/70"}`}>
            {label}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div
      role="group"
      aria-label={`Piano keyboard, ${noteName(low)} to ${noteName(high)}. Arrow keys move, Enter plays.`}
      className={`relative w-full overflow-hidden rounded-b-xl bg-stage ${className}`}
      onKeyDown={onKeyDown}
    >
      <div className="relative h-full w-full">
        {whites.map(keyButton)}
        {blacks.map(keyButton)}
      </div>
    </div>
  );
}
