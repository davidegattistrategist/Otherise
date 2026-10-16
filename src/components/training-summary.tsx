/**
 * Riassunto degli allenamenti di un cliente: costanza sul programma, questa
 * settimana, media e ultimo allenamento, con le barre delle ultime settimane.
 */
import type { TrainingSummary } from "@/lib/training-history";
import { formatShort } from "@/lib/dates";
import { BarChart } from "./bar-chart";
import { cx, fmtNum } from "./ui";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function lastLabel(days: number | null) {
  if (days === null) return "Nessun allenamento";
  if (days <= 0) return "Oggi";
  if (days === 1) return "Ieri";
  return `${days} giorni fa`;
}

export function TrainingSummaryView({ summary, bars = true }: { summary: TrainingSummary; bars?: boolean }) {
  const { thisWeek, consistency: c } = summary;
  const total = thisWeek.program + thisWeek.free;
  const low = c.pct !== null && c.pct < 60;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4" data-training-summary>
        <div>
          <div className="text-xs text-muted">Costanza (2 settimane)</div>
          <div className={cx("text-[30px] leading-none font-light tracking-tight tabular", low && "text-accent-deep")}>{c.pct === null ? "–" : `${c.pct}%`}</div>
          <div className="mt-1 text-xs text-muted">{c.pct !== null ? `${c.done} di ${c.expected} del programma` : c.program ? "si vede dalla prima settimana intera" : "nessun programma attivo"}</div>
        </div>
        <div>
          <div className="text-xs text-muted">Questa settimana</div>
          <div className="text-[30px] leading-none font-light tracking-tight tabular">{total}</div>
          <div className="mt-1 text-xs text-muted">{thisWeek.free ? `${thisWeek.program} del programma + ${plural(thisWeek.free, "libero", "liberi")}` : "del programma"}</div>
        </div>
        <div>
          <div className="text-xs text-muted">Media a settimana</div>
          <div className="text-[30px] leading-none font-light tracking-tight tabular">{fmtNum(summary.average, 1)}</div>
          <div className="mt-1 text-xs text-muted">ultime 4 settimane</div>
        </div>
        <div>
          <div className="text-xs text-muted">Ultimo allenamento</div>
          <div className="text-[22px] leading-tight font-semibold">{lastLabel(summary.daysSinceLast)}</div>
        </div>
      </div>
      {bars ? (
        <div>
          <BarChart label="Allenamenti per settimana" height={80} labelEvery={3} bars={summary.weeks.map((w) => ({ label: formatShort(w.week).replace(/ \d{4}$/, ""), value: w.program + w.free }))} />
          <p className="mt-1 text-xs text-muted">Allenamenti per settimana, del programma e liberi insieme.</p>
        </div>
      ) : null}
    </div>
  );
}
