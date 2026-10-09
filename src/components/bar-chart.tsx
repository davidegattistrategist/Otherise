/**
 * Grafico a barre semplice: una colonna per periodo, l'ultima in arancio.
 * Il valore è scritto sopra ogni barra, così si legge anche dal telefono.
 */
import { cx, fmtNum } from "./ui";

export function BarChart({
  bars,
  height = 150,
  format = (v: number) => fmtNum(v, 0),
  label,
  highlightLast = true,
  showValues = true,
}: {
  bars: Array<{ label: string; value: number }>;
  height?: number;
  format?: (v: number) => string;
  label: string;
  highlightLast?: boolean;
  showValues?: boolean;
}) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div role="img" aria-label={`${label}: ${bars.map((b) => `${b.label} ${format(b.value)}`).join(", ")}`} className="flex items-end gap-1 sm:gap-1.5" style={{ height: height + 40 }}>
      {bars.map((b, i) => {
        const last = highlightLast && i === bars.length - 1;
        const h = Math.round((b.value / max) * height);
        return (
          <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${b.label}: ${format(b.value)}`}>
            {showValues ? <span className={cx("text-[10px] leading-none tabular sm:text-[11px]", b.value ? "text-ink-soft" : "text-transparent")}>{b.value ? format(b.value) : "0"}</span> : null}
            <div className={cx("w-full max-w-9 rounded-t-md", last ? "bg-accent" : b.value ? "bg-ink" : "bg-sand-deep")} style={{ height: Math.max(h, 3) }} />
            <span className="truncate text-[10px] text-muted sm:text-[11px]">{b.label}</span>
          </div>
        );
      })}
    </div>
  );
}
