import Link from "next/link";
import { listName } from "@/lib/names";
import type { Metadata } from "next";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addMonths, formatShort, todayISO } from "@/lib/dates";
import { formatEuro, METHOD_LABELS, PLAN_LABELS, type BillingStatus, type PaymentMethod } from "@/lib/billing";
import { getBillingLines, getRevenue, getSessionsToSettle, monthLabel } from "@/lib/data/billing";
import { BarChart } from "@/components/bar-chart";
import { QuickPay } from "@/components/quick-pay";
import { BigNumber, Card, Dot, Eyebrow, PageTitle, buttonClass } from "@/components/ui";
import { IconDownload, IconPlus } from "@/components/icons";

export const metadata: Metadata = { title: "Pagamenti" };

const ORDER: Record<BillingStatus["state"], number> = { overdue: 0, due_soon: 1, none: 2, ok: 3 };

export default async function PaymentsOverviewPage({ searchParams }: { searchParams: Promise<{ incassi?: string }> }) {
  await requireOwner();
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayISO();
  const year = today.slice(0, 4);
  const { lines } = await getBillingLines(supabase);
  // mese aperto nel grafico degli incassi (di base quello in corso)
  const month = /^\d{4}-\d{2}$/.test(sp.incassi ?? "") ? sp.incassi! : today.slice(0, 7);
  const nextMonth = addMonths(`${month}-01`, 1);
  const [revenue, { data: recent }, toSettle, { data: history }] = await Promise.all([
    getRevenue(supabase, lines),
    supabase.from("payments").select("id, client_id, paid_on, amount, method, clients!inner(first_name, last_name, free)").eq("clients.free", false).gte("paid_on", `${month}-01`).lt("paid_on", nextMonth).order("paid_on", { ascending: false }).order("created_at", { ascending: false }),
    getSessionsToSettle(supabase),
    supabase
      .from("payments")
      .select("id, client_id, paid_on, amount, method, period_start, period_end, sessions, notes, plan_id, clients!inner(first_name, last_name, free), payment_plans(kind)")
      .eq("clients.free", false)
      .order("paid_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);
  // tutti i pagamenti, dal più recente, divisi per mese
  const historyMonths: Array<{ month: string; total: number; items: NonNullable<typeof history> }> = [];
  for (const p of history ?? []) {
    const m = p.paid_on.slice(0, 7);
    let g = historyMonths[historyMonths.length - 1];
    if (!g || g.month !== m) historyMonths.push((g = { month: m, total: 0, items: [] }));
    g.total += Number(p.amount);
    g.items.push(p);
  }
  const monthTotal = (recent ?? []).reduce((t, p) => t + Number(p.amount), 0);
  const monthIndex = revenue.buckets.findIndex((b) => b.month === month);
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
            <Link href="/staff/pagamenti/nuovo" className={buttonClass("primary", "sm")}><IconPlus size={16} /> Nuovo pagamento</Link>
            <Link href="/staff/pagamenti/previsione" className={buttonClass("secondary", "sm")}>Previsione dei prossimi mesi</Link>
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

      {toSettle.length ? (
        <Card className="flex flex-col gap-1">
          <div className="mb-2 flex items-center gap-2"><Dot tone="accent" /><Eyebrow>Sessioni PT da saldare</Eyebrow></div>
          <ul className="flex flex-col">
            {toSettle.map((t) => (
              <li key={t.clientId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-sand-deep py-3 first:border-t-0">
                <Link href={`/staff/clienti/${t.clientId}/pagamenti`} className="font-semibold hover:underline">{t.name}</Link>
                <span className="text-sm text-muted tabular">{t.due === 1 ? "1 sessione" : `${t.due} sessioni`}{t.dueAmount !== null ? ` · ${formatEuro(t.dueAmount)}` : ""}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Eyebrow>Incassi per mese</Eyebrow>
            <span className="text-sm text-muted">ricorrente stimato {formatEuro(Math.round(revenue.recurring))} / mese</span>
          </div>
          <p className="-mt-2 text-sm text-muted">Tocca un mese per vedere chi ha pagato.</p>
          <BarChart label="Incassi per mese" selected={monthIndex >= 0 ? monthIndex : undefined} bars={revenue.buckets.map((b) => ({ label: monthLabel(b.month), value: b.total, href: `/staff/pagamenti?incassi=${b.month}#incassi-mese` }))} format={(v) => (v >= 1000 ? `${(v / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })}k` : String(Math.round(v)))} />
        </Card>
        <Card id="incassi-mese" className="flex scroll-mt-6 flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Eyebrow>Incassati a {new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-15T00:00:00Z`))}</Eyebrow>
            <span className="font-semibold tabular">{formatEuro(monthTotal)}</span>
          </div>
          {recent?.length ? (
            <ul className="flex flex-col">
              {recent.map((p) => {
                const c = p.clients as unknown as { first_name: string; last_name: string } | null;
                return (
                  <li key={p.id} className="flex items-baseline justify-between gap-2 border-t border-sand-deep py-2.5 first:border-t-0">
                    <span className="min-w-0 truncate"><span className="font-semibold">{c ? listName(c) : "Cliente eliminato"}</span> <span className="text-sm text-muted">· {formatShort(p.paid_on)} · {METHOD_LABELS[p.method as PaymentMethod]}</span></span>
                    <span className="shrink-0 font-semibold tabular">{formatEuro(p.amount)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[15px] text-muted">Nessun pagamento registrato in questo mese.</p>
          )}
        </Card>
      </div>

      <details className="group rounded-[var(--radius-card)] bg-card" id="tutti-i-pagamenti">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 sm:px-6">
          <span>
            <span className="block font-semibold">Tutti i pagamenti</span>
            <span className="text-sm text-muted">{(history ?? []).length} registrati, dal più recente</span>
          </span>
          <span className="text-sm font-semibold underline group-open:hidden">Mostra</span>
          <span className="hidden text-sm font-semibold underline group-open:inline">Nascondi</span>
        </summary>
        <div className="flex flex-col gap-5 px-5 pb-5 sm:px-6">
          {historyMonths.map((g) => (
            <section key={g.month} className="flex flex-col">
              <div className="flex items-baseline justify-between gap-2 border-b border-sand-deep pb-1.5">
                <h3 className="text-[13px] font-bold tracking-wider text-muted uppercase">{new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${g.month}-15T00:00:00Z`))}</h3>
                <span className="text-sm font-semibold tabular">{formatEuro(g.total)}</span>
              </div>
              <ul className="flex flex-col">
                {g.items.map((p) => {
                  const c = p.clients as unknown as { first_name: string; last_name: string } | null;
                  const kind = (p.payment_plans as unknown as { kind: string } | null)?.kind as keyof typeof PLAN_LABELS | undefined;
                  const what = p.period_start && p.period_end
                    ? `${kind ? PLAN_LABELS[kind] : "Periodo"} ${formatShort(p.period_start)} – ${formatShort(p.period_end)}`
                    : p.sessions
                      ? `${p.sessions} ${p.sessions === 1 ? "lezione" : "lezioni"}${p.plan_id ? "" : " a parte"}`
                      : p.notes || "Pagamento";
                  return (
                    <li key={p.id} className="flex items-baseline justify-between gap-3 border-t border-sand-deep py-2.5 first:border-t-0">
                      <span className="min-w-0">
                        <Link href={`/staff/clienti/${p.client_id}/pagamenti`} className="font-semibold hover:underline">{c ? listName(c) : "Cliente eliminato"}</Link>
                        <span className="block text-sm text-muted">{formatShort(p.paid_on)} · {what} · {METHOD_LABELS[p.method as PaymentMethod]}</span>
                      </span>
                      <span className="shrink-0 font-semibold tabular">{formatEuro(p.amount)}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {!historyMonths.length ? <p className="text-[15px] text-muted">Ancora nessun pagamento registrato.</p> : null}
        </div>
      </details>

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
                  </span>
                </span>
                {l.proposal ? <QuickPay clientId={l.clientId} name={l.name} proposal={l.proposal} reminder={null} compact label={l.status.state === "ok" || l.paused ? "Registra" : "Pagato"} /> : <Link href={`/staff/clienti/${l.clientId}/pagamenti`} className="shrink-0 text-sm font-semibold underline">Imposta piano</Link>}
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
                <td className="px-5 py-3"><Link href={`/staff/clienti/${l.clientId}/pagamenti`} className="font-semibold hover:underline">{l.name}</Link></td>
                <td className="px-3 py-3 text-muted">{l.planLabel}</td>
                <td className="px-3 py-3">
                  <span className="inline-flex items-center gap-2">
                    <Dot tone={l.status.state === "overdue" ? "accent" : l.status.state === "due_soon" ? "deep" : l.status.state === "none" ? "muted" : "ink"} />
                    {l.status.label}
                  </span>
                </td>
                <td className="px-3 py-3 text-right text-muted tabular">{l.status.dueDate ? formatShort(l.status.dueDate) : l.status.sessionsLeft !== null ? `${l.sessionsUsed}/${l.sessionsBought} sessioni` : "—"}</td>
                <td className="px-5 py-3 text-right">{l.proposal ? <QuickPay clientId={l.clientId} name={l.name} proposal={l.proposal} reminder={null} compact label={l.status.state === "ok" || l.paused ? "Registra" : "Pagato"} /> : <Link href={`/staff/clienti/${l.clientId}/pagamenti`} className="text-sm font-semibold underline">Imposta piano</Link>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
