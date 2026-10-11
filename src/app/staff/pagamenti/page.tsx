import Link from "next/link";
import type { Metadata } from "next";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatShort, todayISO } from "@/lib/dates";
import { formatEuro, METHOD_LABELS, type BillingStatus, type PaymentMethod } from "@/lib/billing";
import { getBillingLines, getRevenue, monthLabel } from "@/lib/data/billing";
import { BarChart } from "@/components/bar-chart";
import { QuickPay } from "@/components/quick-pay";
import { BigNumber, Card, Dot, Eyebrow, PageTitle, buttonClass } from "@/components/ui";
import { IconDownload } from "@/components/icons";

export const metadata: Metadata = { title: "Pagamenti" };

const ORDER: Record<BillingStatus["state"], number> = { overdue: 0, due_soon: 1, none: 2, ok: 3 };

export default async function PaymentsOverviewPage() {
  await requireOwner();
  const supabase = await createClient();
  const today = todayISO();
  const year = today.slice(0, 4);
  const { lines } = await getBillingLines(supabase);
  const [revenue, { data: recent }] = await Promise.all([
    getRevenue(supabase, lines),
    supabase.from("payments").select("id, client_id, paid_on, amount, method, clients!inner(first_name, last_name, free)").eq("clients.free", false).order("paid_on", { ascending: false }).order("created_at", { ascending: false }).limit(12),
  ]);
  const rows = [...lines].sort((a, z) => ORDER[a.status.state] - ORDER[z.status.state] || (a.status.daysLeft ?? 999) - (z.status.daysLeft ?? 999));
  const attention = rows.filter((r) => r.status.state === "overdue" || r.status.state === "due_soon");
  const thisMonth = revenue.buckets[revenue.buckets.length - 1]?.total ?? 0;
  const thisYear = revenue.buckets.filter((b) => b.month.startsWith(year)).reduce((t, b) => t + b.total, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        eyebrow="Solo titolare"
        title="Pagamenti"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/staff/pagamenti/previsione" className={buttonClass("primary", "sm")}>Previsione dei prossimi mesi</Link>
            <a href={`/api/pagamenti/export?anno=${year}`} className={buttonClass("secondary", "sm")}>
              <IconDownload size={16} /> Esporta {year} per il commercialista
            </a>
          </div>
        }
      >
        <p className="max-w-2xl text-[15px] text-muted">I pagamenti avvengono fuori dall&apos;app. Qui segni cosa è saldato con un tocco e l&apos;app ti avvisa prima di ogni scadenza.</p>
      </PageTitle>

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))] sm:gap-4">
        <Card dark><Eyebrow dark>Da guardare</Eyebrow><BigNumber className="mt-3 text-card" value={attention.length} unit={attention.length === 1 ? "cliente" : "clienti"} /></Card>
        <Card><Eyebrow>Incassato questo mese</Eyebrow><BigNumber className="mt-3" value={formatEuro(thisMonth)} /></Card>
        <Card><Eyebrow>Nel {year}</Eyebrow><BigNumber className="mt-3" value={formatEuro(thisYear)} /></Card>
        <Card><Eyebrow>In arrivo · 30 giorni</Eyebrow><BigNumber className="mt-3" value={formatEuro(revenue.expected)} /><p className="mt-1 text-xs text-muted">{revenue.upcomingCount} {revenue.upcomingCount === 1 ? "rinnovo atteso" : "rinnovi attesi"}</p></Card>
      </div>

      {attention.length ? (
        <Card className="flex flex-col gap-1">
          <div className="mb-2 flex items-center gap-2"><Dot tone="accent" /><Eyebrow>Da sistemare</Eyebrow></div>
          <ul className="flex flex-col">
            {attention.map((l) => (
              <li key={l.clientId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-sand-deep py-3 first:border-t-0">
                <div className="min-w-0">
                  <Link href={`/staff/clienti/${l.clientId}/pagamenti`} className="font-semibold hover:underline">{l.name}</Link>
                  <div className="text-sm text-muted">{l.status.label}{l.proposal ? ` · prossimo: ${l.proposal}` : ""}</div>
                </div>
                <QuickPay clientId={l.clientId} name={l.name} proposal={l.proposal} reminder={l.reminder} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Eyebrow>Incassi per mese</Eyebrow>
            <span className="text-sm text-muted">ricorrente stimato {formatEuro(Math.round(revenue.recurring))} / mese</span>
          </div>
          <BarChart label="Incassi per mese" bars={revenue.buckets.map((b) => ({ label: monthLabel(b.month), value: b.total }))} format={(v) => (v >= 1000 ? `${(v / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })}k` : String(Math.round(v)))} />
        </Card>
        <Card className="flex flex-col gap-2">
          <Eyebrow>Ultimi pagamenti</Eyebrow>
          {recent?.length ? (
            <ul className="flex flex-col">
              {recent.map((p) => {
                const c = p.clients as unknown as { first_name: string; last_name: string } | null;
                return (
                  <li key={p.id} className="flex items-baseline justify-between gap-2 border-t border-sand-deep py-2.5 first:border-t-0">
                    <span className="min-w-0 truncate"><span className="font-semibold">{c ? `${c.first_name} ${c.last_name}` : "Cliente eliminato"}</span> <span className="text-sm text-muted">· {formatShort(p.paid_on)} · {METHOD_LABELS[p.method as PaymentMethod]}</span></span>
                    <span className="shrink-0 font-semibold tabular">{formatEuro(p.amount)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[15px] text-muted">Nessun pagamento registrato. Apri un cliente → Pagamenti per impostare il piano.</p>
          )}
        </Card>
      </div>

      {/* telefono: una scheda per cliente con tutto in vista */}
      <Card className="flex flex-col p-0 md:hidden">
        <ul>
          {rows.map((l) => (
            <li key={l.clientId} className="flex flex-col gap-2 border-t border-sand-deep px-4 py-3.5 first:border-t-0">
              <div className="flex items-baseline justify-between gap-3">
                <Link href={`/staff/clienti/${l.clientId}/pagamenti`} className="min-w-0 truncate font-semibold hover:underline">{l.name}</Link>
                <span className="shrink-0 text-sm text-muted">{l.planLabel}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex min-w-0 items-center gap-2 text-sm">
                  <Dot tone={l.status.state === "overdue" ? "accent" : l.status.state === "due_soon" ? "deep" : l.status.state === "none" ? "muted" : "ink"} />
                  <span className="truncate">
                    {l.status.label}
                    {l.status.dueDate ? ` · ${formatShort(l.status.dueDate)}` : l.status.sessionsLeft !== null ? ` · ${l.sessionsUsed}/${l.sessionsBought} sessioni` : ""}
                    {l.paused ? " · in pausa" : ""}
                  </span>
                </span>
                {l.proposal ? <QuickPay clientId={l.clientId} name={l.name} proposal={l.proposal} reminder={null} compact label={l.status.state === "ok" ? "Registra" : "Pagato"} /> : <Link href={`/staff/clienti/${l.clientId}/pagamenti`} className="shrink-0 text-sm font-semibold underline">Imposta piano</Link>}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="relative hidden overflow-x-auto p-0 md:block">
        <table className="w-full min-w-[720px] text-left text-[15px]">
          <thead>
            <tr className="text-xs tracking-wider text-muted uppercase">
              <th className="px-5 py-3 font-semibold">Cliente</th>
              <th className="px-3 py-3 font-semibold">Piano</th>
              <th className="px-3 py-3 font-semibold">Stato</th>
              <th className="px-3 py-3 text-right font-semibold">Saldato fino</th>
              <th className="px-5 py-3"><span className="sr-only">Azioni</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.clientId} className="border-t border-sand-deep hover:bg-white/60">
                <td className="px-5 py-3"><Link href={`/staff/clienti/${l.clientId}/pagamenti`} className="font-semibold hover:underline">{l.name}</Link>{l.paused ? <span className="ml-2 text-xs text-muted">in pausa</span> : null}</td>
                <td className="px-3 py-3 text-muted">{l.planLabel}</td>
                <td className="px-3 py-3">
                  <span className="inline-flex items-center gap-2">
                    <Dot tone={l.status.state === "overdue" ? "accent" : l.status.state === "due_soon" ? "deep" : l.status.state === "none" ? "muted" : "ink"} />
                    {l.status.label}
                  </span>
                </td>
                <td className="px-3 py-3 text-right text-muted tabular">{l.status.dueDate ? formatShort(l.status.dueDate) : l.status.sessionsLeft !== null ? `${l.sessionsUsed}/${l.sessionsBought} sessioni` : "—"}</td>
                <td className="px-5 py-3 text-right">{l.proposal ? <QuickPay clientId={l.clientId} name={l.name} proposal={l.proposal} reminder={null} compact label={l.status.state === "ok" ? "Registra" : "Pagato"} /> : <Link href={`/staff/clienti/${l.clientId}/pagamenti`} className="text-sm font-semibold underline">Imposta piano</Link>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
