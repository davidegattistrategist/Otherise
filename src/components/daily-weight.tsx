"use client";

/**
 * Peso giorno per giorno: grafico (pesate + media di 7 giorni), riassunto,
 * modulo per segnarlo e elenco delle pesate. Lo usa il cliente in Progressi
 * (facoltativo) e lo staff nella scheda del cliente.
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { diffDays, formatShort, type ISODate } from "@/lib/dates";
import { lastDays, parseKg, rollingAverage, weightSummary, type WeightEntry } from "@/lib/body/weights";
import { deleteWeight, saveWeight } from "@/app/weights/actions";
import { BigNumber, Button, Card, Eyebrow, cx, fmtNum } from "./ui";
import { IconDown, IconX } from "./icons";

const RANGES: Array<{ days: number | null; label: string }> = [
  { days: 30, label: "30 giorni" },
  { days: 90, label: "3 mesi" },
  { days: 365, label: "1 anno" },
  { days: null, label: "Tutto" },
];

export function DailyWeight({
  entries,
  today,
  clientId,
  staff = false,
  canEdit = true,
}: {
  entries: WeightEntry[];
  today: ISODate;
  /** solo per lo staff: di quale cliente */
  clientId?: string;
  staff?: boolean;
  canEdit?: boolean;
}) {
  const summary = weightSummary(entries, today);
  const span = entries.length ? diffDays(entries[0].date, today) + 1 : 0;
  // gli intervalli che hanno senso con le pesate che ci sono
  const ranges = RANGES.filter((r) => r.days === null || span > r.days);
  const [range, setRange] = useState<number | null>(span > 90 ? 90 : null);
  const shown = useMemo(() => lastDays(entries, range, today), [entries, range, today]);

  return (
    <Card className="flex flex-col gap-4" data-daily-weight>
      <div className="flex flex-col gap-1">
        <Eyebrow>Peso giorno per giorno</Eyebrow>
        <p className="text-sm text-muted">
          {staff
            ? "Lo segna il cliente in Progressi (è facoltativo). Conta la media della settimana, non il singolo giorno."
            : "Facoltativo. Pesati al mattino, a digiuno e dopo il bagno: conta l'andamento della settimana, non il singolo giorno."}
        </p>
      </div>

      {summary ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3" data-weight-summary>
          <div>
            <div className="text-xs text-muted">Media ultimi 7 giorni</div>
            <BigNumber value={fmtNum(summary.avg7, 1)} unit="kg" />
            <div className="text-xs text-muted">{summary.count7 === 1 ? "1 pesata" : `${summary.count7} pesate`}</div>
          </div>
          <div>
            <div className="text-xs text-muted">In 4 settimane</div>
            <BigNumber value={summary.change28 === null ? "–" : `${summary.change28 > 0 ? "+" : summary.change28 < 0 ? "−" : ""}${fmtNum(Math.abs(summary.change28), 1)}`} unit={summary.change28 === null ? undefined : "kg"} />
            {summary.change28 === null ? <div className="text-xs text-muted">servono pesate di un mese fa</div> : null}
          </div>
          <div className="col-span-2 sm:col-span-1">
            <div className="text-xs text-muted">Ultima pesata</div>
            <div className="text-[15px] font-semibold tabular">{fmtNum(summary.last.kg, 2)} kg <span className="font-normal text-muted">· {summary.last.date === today ? "oggi" : formatShort(summary.last.date)}</span></div>
            {summary.stale && staff ? <div className="text-xs text-accent-deep">Non si pesa da più di 10 giorni</div> : null}
          </div>
        </div>
      ) : (
        <p className="text-[15px]">{staff ? "Il cliente non ha ancora segnato il peso." : "Ancora nessuna pesata: segna la prima qui sotto."}</p>
      )}

      {entries.length > 1 ? (
        <div className="flex flex-col gap-2">
          {ranges.length > 1 ? (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Periodo del grafico">
              {ranges.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  aria-pressed={range === r.days}
                  onClick={() => setRange(r.days)}
                  className={cx("min-h-9 rounded-full px-3 text-[13px] font-semibold", range === r.days ? "bg-ink text-card" : "bg-sand ring-1 ring-sand-deep")}
                >
                  {r.label}
                </button>
              ))}
            </div>
          ) : null}
          <WeightChart entries={shown.length > 1 ? shown : entries} all={entries} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-muted-dark" /> pesata del giorno</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-ink" /> media di 7 giorni</span>
          </div>
        </div>
      ) : null}

      {canEdit ? <WeightForm entries={entries} today={today} clientId={clientId} /> : null}

      {entries.length ? <WeightList entries={entries} clientId={clientId} canEdit={canEdit} /> : null}
    </Card>
  );
}

function WeightForm({ entries, today, clientId }: { entries: WeightEntry[]; today: ISODate; clientId?: string }) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const existing = entries.find((e) => e.date === date);
  const [kg, setKg] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const submit = () => {
    setMsg(null);
    if (parseKg(kg) === null) return setMsg({ tone: "error", text: "Scrivi il peso in chili, per esempio 64,5." });
    start(async () => {
      const r = await saveWeight({ clientId, date, kg });
      if (!r.ok) return setMsg({ tone: "error", text: r.error });
      setKg("");
      setMsg({ tone: "ok", text: `Salvato: ${fmtNum(parseKg(kg), 2)} kg ${date === today ? "oggi" : `il ${formatShort(date)}`}.` });
      router.refresh();
    });
  };
  return (
    <form
      className="flex flex-col gap-2 rounded-2xl bg-sand/70 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      data-weight-form
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold">
          Peso (kg)
          <input
            aria-label="Peso in chili"
            inputMode="decimal"
            autoComplete="off"
            value={kg}
            onChange={(e) => setKg(e.target.value)}
            placeholder={existing ? fmtNum(existing.kg, 2) : "es. 64,5"}
            className="w-28 rounded-xl border border-sand-deep bg-card px-3 py-2.5 text-[17px] font-normal tabular"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold">
          Giorno
          <input
            type="date"
            aria-label="Giorno della pesata"
            value={date}
            max={today}
            onChange={(e) => {
              setDate(e.target.value || today);
              setMsg(null);
            }}
            className="rounded-xl border border-sand-deep bg-card px-3 py-2.5 text-[15px] font-normal"
          />
        </label>
        <Button type="submit" disabled={pending} className="min-h-11" data-weight-save>
          {pending ? "Salvo…" : existing ? "Aggiorna" : "Salva"}
        </Button>
      </div>
      {existing ? <p className="text-xs text-muted">Quel giorno hai già segnato {fmtNum(existing.kg, 2)} kg: salvando lo sostituisci.</p> : null}
      {msg ? <p role={msg.tone === "error" ? "alert" : "status"} className={cx("text-sm font-semibold", msg.tone === "error" ? "text-accent-deep" : "text-ink")}>{msg.text}</p> : null}
    </form>
  );
}

function WeightList({ entries, clientId, canEdit }: { entries: WeightEntry[]; clientId?: string; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const rows = [...entries].reverse();
  return (
    <details className="group" data-weight-list>
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <span>Tutte le pesate ({entries.length})</span>
        <IconDown size={16} className="shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      {error ? <p role="alert" className="text-sm font-semibold text-accent-deep">{error}</p> : null}
      <ul className="mt-1 flex max-h-80 flex-col overflow-y-auto">
        {rows.map((e) => (
          <li key={e.date} className="flex items-center justify-between gap-3 border-t border-sand-deep py-1.5 first:border-t-0" data-weight-row={e.date}>
            <span className="text-[15px]">{formatShort(e.date, Number(rows[0].date.slice(0, 4)))}</span>
            <span className="flex items-center gap-1">
              <span className="font-semibold tabular">{fmtNum(e.kg, 2)} kg</span>
              {canEdit ? (
                <button
                  type="button"
                  disabled={pending}
                  aria-label={`Togli il peso del ${formatShort(e.date)}`}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-sand hover:text-ink"
                  onClick={() =>
                    start(async () => {
                      setError(null);
                      const r = await deleteWeight({ clientId, date: e.date });
                      if (!r.ok) setError(r.error);
                      else router.refresh();
                    })
                  }
                >
                  <IconX size={14} />
                </button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Grafico sul tempo vero (i giorni senza pesata restano vuoti): puntini = pesate, linea = media di 7 giorni. */
function WeightChart({ entries, all }: { entries: WeightEntry[]; all: WeightEntry[] }) {
  const [sel, setSel] = useState<number | null>(null);
  // la media usa anche le pesate prima dell'intervallo mostrato
  const avg = useMemo(() => {
    const full = new Map(rollingAverage(all).map((a) => [a.date, a.avg]));
    return entries.map((e) => full.get(e.date) ?? e.kg);
  }, [entries, all]);
  const W = 340;
  const H = 150;
  const padL = 34;
  const padR = 14;
  const padT = 20;
  const padB = 22;
  const first = entries[0].date;
  const lastDate = entries[entries.length - 1].date;
  const days = Math.max(1, diffDays(first, lastDate));
  const vals = [...entries.map((e) => e.kg), ...avg];
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi - lo < 1) {
    const mid = (hi + lo) / 2;
    lo = mid - 0.5;
    hi = mid + 0.5;
  }
  const pad = (hi - lo) * 0.12;
  lo -= pad;
  hi += pad;
  const x = (d: ISODate) => padL + (diffDays(first, d) / days) * (W - padL - padR);
  const y = (v: number) => padT + ((hi - v) * (H - padT - padB)) / (hi - lo);
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  const year = Number(lastDate.slice(0, 4));
  const picked = sel !== null && sel < entries.length ? sel : null;
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < entries.length; i++) if (Math.abs(x(entries[i].date) - vx) < Math.abs(x(entries[best].date) - vx)) best = i;
    setSel(best);
  };
  const tip = picked !== null ? `${formatShort(entries[picked].date, year)}: ${fmtNum(entries[picked].kg, 2)} kg · media ${fmtNum(avg[picked], 1)}` : "";
  const tipX = picked !== null ? Math.min(Math.max(x(entries[picked].date), padL + 82), W - padR - 82) : 0;
  const last = entries.length - 1;
  // una data a metà, solo se non tocca la prima e l'ultima
  const centre = (padL + W - padR) / 2;
  let mid: number | null = null;
  for (let i = 1; i < last; i++) if (mid === null || Math.abs(x(entries[i].date) - centre) < Math.abs(x(entries[mid].date) - centre)) mid = i;
  if (mid !== null && (x(entries[mid].date) < padL + 70 || x(entries[mid].date) > W - padR - 70)) mid = null;
  return (
    <figure className="m-0 w-full max-w-[560px]">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-pan-y select-none"
        role="img"
        aria-label={`Peso giorno per giorno: media da ${fmtNum(avg[0], 1)} a ${fmtNum(avg[last], 1)} kg`}
        onPointerDown={pick}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse" || e.buttons) pick(e);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setSel(null);
        }}
        data-weight-chart
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--color-sand-deep)" strokeWidth="1" />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--color-muted)">{fmtNum(t, 1)}</text>
          </g>
        ))}
        {entries.map((e) => (
          <circle key={e.date} cx={x(e.date)} cy={y(e.kg)} r={entries.length > 60 ? 1.6 : 2.4} fill="var(--color-muted-dark)" />
        ))}
        <polyline
          points={entries.map((e, i) => `${x(e.date)},${y(avg[i])}`).join(" ")}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="2.2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={x(entries[last].date)} cy={y(avg[last])} r={4.5} fill="var(--color-accent)" />
        {picked === null ? (
          <text x={Math.min(x(entries[last].date), W - padR)} y={y(avg[last]) - 9} textAnchor="end" fontSize="11.5" fontWeight="700" fill="var(--color-ink)">{fmtNum(avg[last], 1)}</text>
        ) : (
          <g pointerEvents="none">
            <line x1={x(entries[picked].date)} x2={x(entries[picked].date)} y1={padT - 4} y2={H - padB} stroke="var(--color-accent)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={x(entries[picked].date)} cy={y(entries[picked].kg)} r={5} fill="none" stroke="var(--color-accent)" strokeWidth="2" />
            <rect x={tipX - 82} y={0} width={164} height={16} rx={8} fill="var(--color-ink)" />
            <text x={tipX} y={11.5} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="var(--color-card)" data-testid="chart-tip">{tip}</text>
          </g>
        )}
        <text x={padL} y={H - 6} textAnchor="start" fontSize="10.5" fill="var(--color-muted)">{formatShort(first, year)}</text>
        {mid !== null ? <text x={x(entries[mid].date)} y={H - 6} textAnchor="middle" fontSize="10.5" fill="var(--color-muted)">{formatShort(entries[mid].date, year)}</text> : null}
        <text x={W - padR} y={H - 6} textAnchor="end" fontSize="10.5" fill="var(--color-muted)">{formatShort(lastDate, year)}</text>
      </svg>
    </figure>
  );
}
