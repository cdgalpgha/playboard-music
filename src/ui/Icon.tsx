const PATHS = {
  piano: "M3 4h18v16H3z M7 4v9m5-9v9m5-9v9M8 13v7m8-7v7",
  learn: "m3 9 9-5 9 5-9 5zM6 11v6c4 3 8 3 12 0v-6m3-2v8",
  songs: "M9 18V5l12-2v13M9 9l12-2M9 18a3 2 0 1 1-6 0 3 2 0 0 1 6 0m12-2a3 2 0 1 1-6 0 3 2 0 0 1 6 0",
  progress: "M4 20V4m0 16h17M8 15l4-5 4 2 5-7",
  play: "m8 4 12 8-12 8z",
  pause: "M8 4v16M16 4v16",
  stop: "M6 6h12v12H6z",
  record: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  check: "m5 12 4 4L20 5",
  close: "m5 5 14 14M19 5 5 19",
  midi: "M4 4h16v16H4zM8 9v.01M12 7v.01M16 9v.01M9 14h6",
  settings: "M4 7h10m4 0h2M4 17h4m4 0h8M14 4v6M8 14v6",
  info: "M12 8v.01M11 12h1v5h1M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18",
  bolt: "m13 2-9 12h7l-1 8 10-13h-7z",
  warn: "M12 3 2 20h20zM12 10v4m0 3v.01",
  download: "M12 3v13m-5-5 5 5 5-5M3 16v5h18v-5",
  headphones: "M3 14v-3a9 9 0 0 1 18 0v3M3 13h4v8H3zM17 13h4v8h-4z",
  metronome: "M8 21h8l-3-17h-2zM12 14l5-8",
  replay: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5",
  youtube: "M21 7c0-2-1-3-3-3H6C4 4 3 5 3 7v10c0 2 1 3 3 3h12c2 0 3-1 3-3zM10 8l6 4-6 4z",
  upload: "M12 16V3m-5 5 5-5 5 5M3 16v5h18v-5",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3M5 11a7 7 0 0 0 14 0M12 18v3",
  keyboard: "M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10",
  chord: "M6 4v16M12 4v16M18 4v16M4 8h4m2 4h4m2 4h4",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className = "" }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
