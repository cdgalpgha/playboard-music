import { useId, type ReactNode } from "react";

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="px-4 pt-6 pb-4 lg:px-8 lg:pt-8">
      <div className="eyebrow">{eyebrow}</div>
      <h1 className="mt-1 text-2xl font-bold text-green-dark lg:text-3xl">{title}</h1>
      {children ? <div className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">{children}</div> : null}
    </header>
  );
}

export function Slider({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  format = (v: number) => `${Math.round(v * 100)}%`,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-semibold text-ink-soft">
          {label}
        </label>
        <output htmlFor={id} className="text-xs text-muted tabular-nums">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className="w-full accent-green"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className="eyebrow">{label}</div>
      <div className="mt-0.5 font-display text-lg font-bold text-green-dark tabular-nums">{value}</div>
      {hint ? <div className="text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-green" : "bg-line"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </button>
      <label htmlFor={id} className="text-sm">
        <span className="font-semibold">{label}</span>
        {description ? <span className="block text-xs text-muted">{description}</span> : null}
      </label>
    </div>
  );
}
