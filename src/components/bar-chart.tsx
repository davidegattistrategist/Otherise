/**
 * Grafico a barre semplice: una colonna per periodo, l'ultima in arancio.
 * Il valore è scritto sopra ogni barra, così si legge anche dal telefono.
 */
import Link from "next/link";
import { cx, fmtNum } from "./ui";

export function BarChart({
  bars,
  height = 150,
  format = (v: number) => fmtNum(v, 0),
  label,
  highlightLast = true,
  showValues = true,
  selected,
}: {
  /** con href ogni barra si può toccare (es. per aprire il dettaglio del mese) */
  bars: Array<{ label: string; value: number; href?: string }>;
  /** indice della barra aperta (evidenziata) */
  selected?: number;
  height?: number;
  format?: (v: number) => string;
  label: string;
  highlightLast?: boolean;
  showValues?: boolean;
}) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div role="img" aria-label={`${label}: ${bars.map((b) => `${b.label} ${format(b.value)}`).join(", ")}`} className="flex min-w-0 items-end gap-0.5 overflow-hidden sm:gap-1.5" style={{ height: height + 40 }}>
      {bars.map((b, i) => {
        const on = selected !== undefined ? i === selected : highlightLast && i === bars.length - 1;
        const h = Math.round((b.value / max) * height);
        const inner = (
          <>
            {showValues ? <span className={cx("max-w-full truncate text-[10px] leading-none tracking-tighter tabular sm:text-[11px] sm:tracking-normal", b.value ? "text-ink-soft" : "text-transparent")}>{b.value ? format(b.value) : "0"}</span> : null}
            <div className={cx("w-full max-w-9 rounded-t-md", on ? "bg-accent" : b.value ? "bg-ink" : "bg-sand-deep")} style={{ height: Math.max(h, 3) }} />
            <span className={cx("truncate text-[10px] sm:text-[11px]", on && selected !== undefined ? "font-bold text-ink" : "text-muted")}>{b.label}</span>
          </>
        );
        const cls = "flex min-w-0 flex-1 flex-col items-center gap-1";
        return b.href ? (
          <Link key={i} href={b.href} scroll={false} aria-current={on ? "true" : undefined} className={cx(cls, "rounded-md hover:bg-sand")} title={`${b.label}: ${format(b.value)}`}>{inner}</Link>
        ) : (
          <div key={i} className={cls} title={`${b.label}: ${format(b.value)}`}>{inner}</div>
        );
      })}
    </div>
  );
}
