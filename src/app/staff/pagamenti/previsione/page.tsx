import Link from "next/link";
import type { Metadata } from "next";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getForecast } from "@/lib/data/forecast";
import { monthLabel } from "@/lib/data/billing";
import { formatEuro } from "@/lib/billing";
import { addDays, formatShort, todayISO } from "@/lib/dates";
import type { ForecastEvent } from "@/lib/forecast";
import { BigNumber, Card, Eyebrow, PageTitle, cx } from "@/components/ui";

export const metadata: Metadata = { title: "Previsione incassi" };

const HORIZONS = [3, 6, 12] as const;
const COLORS = { recurring: "#1b1a17", packages: "#e2622a", single: "#b8a98f" };
const k = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })}k` : String(Math.round(v)));

export default async function ForecastPage({ searchParams }: { searchParams: Promise<{ mesi?: string }> }) {
  await requireOwner();
  const sp = await searchParams;
  const months = HORIZONS.includes(Number(sp.mesi) as 3 | 6 | 12) ? Number(sp.mesi) : 6;
  const supabase = await createClient();
  const f = await getForecast(supabase, months);
  const max = Math.max(1, ...f.months.map((m) => m.total));
  const avg = f.total / months;
  const pct = Math.round(f.renewal.rate * 100);
  // in vista i prossimi 60 giorni, il resto si apre a richiesta
  const limit = addDays(todayISO(), 60);
  const soon = f.events.filter((e) => e.date <= limit);
  const later = f.events.filter((e) => e.date > limit);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        eyebrow={<Link href="/staff/pagamenti" className="hover:underline">← Pagamenti</Link>}
        title="Previsione incassi"
        actions={
          <div className="flex gap-1.5" role="group" aria-label="Orizzonte">
            {HORIZONS.map((h) => (
              <Link key={h} href={`/staff/pagamenti/previsione?mesi=${h}`} aria-current={h === months ? "page" : undefined} className={cx("flex min-h-10 items-center rounded-full px-4 text-sm font-semibold", h === months ? "bg-ink text-card" : "bg-card")}>
                {h} mesi
              </Link>
            ))}
          </div>
        }
      >
        <p className="max-w-3xl text-[15px] leading-relaxed text-muted">
          Quanto dovrebbe entrare nei prossimi mesi {f.clients === 1 ? "dall'unico cliente attivo" : `dai ${f.clients} clienti attivi`} con un piano: gli abbonamenti si rinnovano alla scadenza, i pacchetti quando finiscono le sessioni al ritmo con cui le fa ogni cliente. Clienti in pausa e archiviati sono esclusi.
        </p>
      </PageTitle>

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))] sm:gap-4">
        <Card dark><Eyebrow dark>Prossimi 30 giorni</Eyebrow><BigNumber className="mt-3 text-card" value={formatEuro(f.next30)} /></Card>
        <Card><Eyebrow>In {months} mesi</Eyebrow><BigNumber className="mt-3" value={formatEuro(f.total)} /></Card>
        <Card><Eyebrow>Media al mese</Eyebrow><BigNumber className="mt-3" value={formatEuro(Math.round(avg))} /></Card>
        <Card>
          <Eyebrow>Scenario prudente</Eyebrow>
          <BigNumber className="mt-3" value={formatEuro(f.prudent)} />
          <p className="mt-1 text-xs text-muted">{f.renewal.measured ? `rinnova il ${pct}% dei clienti (ultimi 12 mesi)` : `stima: rinnova l'${pct}% (ancora pochi dati)`}</p>
        </Card>
      </div>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <Eyebrow>Mese per mese</Eyebrow>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: COLORS.recurring }} /> Abbonamenti</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: COLORS.packages }} /> Pacchetti</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: COLORS.single }} /> A sessione</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-accent-deep" /> Prudente</span>
          </div>
        </div>
        <div role="img" aria-label={`Previsione: ${f.months.map((m) => `${monthLabel(m.key)} ${formatEuro(m.total)}`).join(", ")}`} className="flex items-end gap-2 sm:gap-3" style={{ height: 230 }}>
          {f.months.map((m) => {
            const h = (v: number) => Math.round((v / max) * 180);
            return (
              <div key={m.key} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${monthLabel(m.key)}: ${formatEuro(m.total)} (prudente ${formatEuro(m.prudent)})`}>
                <span className={cx("text-[11px] leading-none text-ink-soft tabular", months > 6 && "hidden sm:inline")}>{m.total ? k(m.total) : ""}</span>
                <div className="relative flex w-full max-w-14 flex-col-reverse overflow-hidden rounded-t-md" style={{ height: Math.max(h(m.total), 3) }}>
                  <div style={{ height: h(m.recurring), background: COLORS.recurring }} />
                  <div style={{ height: h(m.packages), background: COLORS.packages }} />
                  <div style={{ height: h(m.single), background: COLORS.single }} />
                  {!m.total ? <div className="h-[3px] bg-sand-deep" /> : null}
                </div>
                <div className="relative h-0 w-full max-w-14">
                  {m.prudent ? <div className="absolute right-0 left-0 h-0.5 bg-accent-deep" style={{ bottom: h(m.prudent) - 1 }} /> : null}
                </div>
                <span className="truncate text-[11px] text-muted">{monthLabel(m.key)}</span>
              </div>
            );
          })}
        </div>
        <div className="scroll-x -mx-1 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[15px]">
            <thead>
              <tr className="text-xs tracking-wider text-muted uppercase">
                <th className="px-2 py-2 font-semibold">Mese</th>
                <th className="px-2 py-2 text-right font-semibold">Abbonamenti</th>
                <th className="px-2 py-2 text-right font-semibold">Pacchetti</th>
                <th className="px-2 py-2 text-right font-semibold">A sessione</th>
                <th className="px-2 py-2 text-right font-semibold">Totale</th>
                <th className="px-2 py-2 text-right font-semibold">Prudente</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {f.months.map((m) => (
                <tr key={m.key} className="border-t border-sand-deep">
                  <td className="px-2 py-2 capitalize">{monthLabel(m.key)} {m.key.slice(0, 4)}</td>
                  <td className="px-2 py-2 text-right">{formatEuro(m.recurring)}</td>
                  <td className="px-2 py-2 text-right">{formatEuro(m.packages)}</td>
                  <td className="px-2 py-2 text-right">{formatEuro(m.single)}</td>
                  <td className="px-2 py-2 text-right font-semibold">{formatEuro(m.total)}</td>
                  <td className="px-2 py-2 text-right text-muted">{formatEuro(m.prudent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="flex flex-col gap-2">
        <Eyebrow>Prossimi incassi attesi</Eyebrow>
        {f.events.length ? (
          <>
            {soon.length ? <EventList events={soon} /> : <p className="text-[15px] text-muted">Nessun incasso previsto nei prossimi 60 giorni.</p>}
            {later.length ? (
              <details className="group">
                <summary className="cursor-pointer list-none border-t border-sand-deep py-3 text-sm font-semibold underline">
                  <span className="group-open:hidden">{later.length === 1 ? "Mostra anche l'incasso successivo" : `Mostra anche i ${later.length} incassi successivi`}</span>
                  <span className="hidden group-open:inline">Nascondi gli incassi successivi</span>
                </summary>
                <EventList events={later} />
              </details>
            ) : null}
          </>
        ) : (
          <p className="text-[15px] text-muted">Nessun incasso previsto: imposta il piano di pagamento dei clienti attivi.</p>
        )}
        <p className="mt-2 text-sm text-muted">È una stima: un cliente che smette o cambia piano cambia i numeri. I pagamenti veri li registri sempre tu.</p>
      </Card>
    </div>
  );
}

function EventList({ events }: { events: Array<ForecastEvent & { name: string }> }) {
  return (
    <ul className="flex flex-col">
      {events.map((e, i) => (
        <li key={`${e.clientId}${e.date}${i}`} className="flex items-baseline justify-between gap-3 border-t border-sand-deep py-2.5 first:border-t-0">
          <span className="min-w-0">
            <Link href={`/staff/clienti/${e.clientId}/pagamenti`} className="font-semibold hover:underline">{e.name}</Link>
            <span className="block text-sm text-muted">{formatShort(e.date)} · {e.label}</span>
          </span>
          <span className="shrink-0 font-semibold tabular">{formatEuro(e.amount)}</span>
        </li>
      ))}
    </ul>
  );
}
