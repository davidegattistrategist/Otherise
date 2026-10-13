import Link from "next/link";
import type { Metadata } from "next";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getForecast } from "@/lib/data/forecast";
import { monthLabel } from "@/lib/data/billing";
import { formatEuro } from "@/lib/billing";
import { formatShort } from "@/lib/dates";
import type { ForecastEvent } from "@/lib/forecast";
import { BigNumber, Card, Eyebrow, PageTitle, cx } from "@/components/ui";

export const metadata: Metadata = { title: "Previsione incassi" };

const HORIZONS = [3, 6, 12] as const;
const COLORS = { recurring: "#1b1a17", packages: "#e2622a", single: "#b8a98f" };
const monthName = (ym: string) => new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-15T00:00:00Z`));
const k = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })}k` : String(Math.round(v)));

export default async function ForecastPage({ searchParams }: { searchParams: Promise<{ mesi?: string; mese?: string }> }) {
  await requireOwner();
  const sp = await searchParams;
  const months = HORIZONS.includes(Number(sp.mesi) as 3 | 6 | 12) ? Number(sp.mesi) : 6;
  const supabase = await createClient();
  const f = await getForecast(supabase, months);
  const max = Math.max(1, ...f.months.map((m) => m.total));
  const avg = f.total / months;
  const pct = Math.round(f.renewal.rate * 100);
  // il mese aperto (tocca una barra o una riga): chi deve pagare in quel mese
  const selected = f.months.find((m) => m.key === sp.mese) ?? f.months[0];
  const monthEvents = f.events.filter((e) => e.date.slice(0, 7) === selected.key);
  const overdue = selected.key === f.months[0].key ? f.events.filter((e) => e.date.slice(0, 7) < selected.key) : [];
  const monthHref = (key: string) => `/staff/pagamenti/previsione?mesi=${months}&mese=${key}#dettaglio`;

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        eyebrow={<Link href="/staff/pagamenti" className="hover:underline">← Pagamenti</Link>}
        title="Previsione incassi"
        actions={
          <div className="flex gap-1.5" role="group" aria-label="Orizzonte">
            {HORIZONS.map((h) => (
              <Link key={h} href={`/staff/pagamenti/previsione?mesi=${h}${sp.mese ? `&mese=${sp.mese}` : ""}`} aria-current={h === months ? "page" : undefined} className={cx("flex min-h-10 items-center rounded-full px-4 text-sm font-semibold", h === months ? "bg-ink text-card" : "bg-card")}>
                {h} mesi
              </Link>
            ))}
          </div>
        }
      >
        <p className="max-w-3xl text-[15px] leading-relaxed text-muted">
          Quanto dovrebbe entrare nei prossimi mesi {f.clients === 1 ? "dall'unico cliente attivo" : `dai ${f.clients} clienti attivi`} con un piano: i coaching si rinnovano alla scadenza, i pacchetti quando finiscono le sessioni al ritmo con cui le fa ogni cliente. Clienti in pausa e archiviati sono esclusi.
        </p>
      </PageTitle>

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))] sm:gap-4">
        <Card dark>
          <Eyebrow dark>Prossimi 30 giorni</Eyebrow>
          <BigNumber className="mt-3 text-card" value={formatEuro(f.next30)} />
          {f.overdue30 ? <p className="mt-1 text-xs text-muted-dark">di cui {formatEuro(f.overdue30)} già da saldare</p> : null}
        </Card>
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
          <div>
            <Eyebrow>Mese per mese</Eyebrow>
            <p className="mt-1 text-sm text-muted">Tocca un mese per vedere chi deve pagare.</p>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: COLORS.recurring }} /> Coaching</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: COLORS.packages }} /> Pacchetti</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: COLORS.single }} /> A sessione</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-accent-deep" /> Prudente</span>
          </div>
        </div>
        <div role="img" aria-label={`Previsione: ${f.months.map((m) => `${monthLabel(m.key)} ${formatEuro(m.total)}`).join(", ")}`} className="flex items-end gap-2 sm:gap-3" style={{ height: 230 }}>
          {f.months.map((m) => {
            const h = (v: number) => Math.round((v / max) * 180);
            const on = m.key === selected.key;
            return (
              <Link key={m.key} href={monthHref(m.key)} scroll={false} aria-current={on ? "true" : undefined} className={cx("flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg pb-1 hover:bg-sand", on && "bg-sand")} title={`${monthLabel(m.key)}: ${formatEuro(m.total)} (prudente ${formatEuro(m.prudent)})`}>
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
                <span className={cx("truncate text-[11px]", on ? "font-bold text-ink" : "text-muted")}>{monthLabel(m.key)}</span>
              </Link>
            );
          })}
        </div>
      </Card>

      <Card id="dettaglio" className="flex scroll-mt-6 flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Eyebrow>Chi deve pagare a {monthName(selected.key)}</Eyebrow>
          <span className="font-semibold tabular">{formatEuro(selected.total)}</span>
        </div>
        {overdue.length ? (
          <div className="rounded-2xl bg-accent-soft px-4 py-3">
            <div className="text-sm font-semibold">Già da saldare</div>
            <EventList events={overdue} />
          </div>
        ) : null}
        {monthEvents.length ? <EventList events={monthEvents} /> : <p className="text-[15px] text-muted">Nessun incasso previsto in questo mese.</p>}
        <p className="mt-2 text-sm text-muted">È una stima: un cliente che smette o cambia piano cambia i numeri. I pagamenti veri li registri sempre tu.</p>
      </Card>
      <Card className="flex flex-col gap-2">
        <Eyebrow>Tabella</Eyebrow>
        <div className="scroll-x -mx-1 overflow-x-auto">
          <table className="w-full text-left text-[15px] sm:min-w-[560px]">
            <thead>
              <tr className="text-xs tracking-wider text-muted uppercase">
                <th className="px-2 py-2 font-semibold">Mese</th>
                <th className="hidden px-2 py-2 text-right font-semibold sm:table-cell">Coaching</th>
                <th className="hidden px-2 py-2 text-right font-semibold sm:table-cell">Pacchetti</th>
                <th className="hidden px-2 py-2 text-right font-semibold sm:table-cell">A sessione</th>
                <th className="px-2 py-2 text-right font-semibold">Totale</th>
                <th className="px-2 py-2 text-right font-semibold">Prudente</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {f.months.map((m) => (
                <tr key={m.key} className={cx("border-t border-sand-deep", m.key === selected.key && "bg-sand")}>
                  <td className="px-2 py-2 capitalize"><Link href={monthHref(m.key)} scroll={false} className="font-semibold underline-offset-4 hover:underline">{monthLabel(m.key)} {m.key.slice(0, 4)}</Link></td>
                  <td className="hidden px-2 py-2 text-right sm:table-cell">{formatEuro(m.recurring)}</td>
                  <td className="hidden px-2 py-2 text-right sm:table-cell">{formatEuro(m.packages)}</td>
                  <td className="hidden px-2 py-2 text-right sm:table-cell">{formatEuro(m.single)}</td>
                  <td className="px-2 py-2 text-right font-semibold">{formatEuro(m.total)}</td>
                  <td className="px-2 py-2 text-right text-muted">{formatEuro(m.prudent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
