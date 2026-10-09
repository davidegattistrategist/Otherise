import Link from "next/link";
import type { Metadata } from "next";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addMonths, formatShort, todayISO } from "@/lib/dates";
import { billingStatus, formatEuro, METHOD_LABELS, PLAN_LABELS, type BillingStatus, type PaymentMethod, type PlanKind } from "@/lib/billing";
import { BigNumber, Card, Dot, Eyebrow, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Pagamenti" };

/** Quanto vale un piano in un mese (per la stima delle entrate ricorrenti) */
const MONTHLY_FACTOR: Partial<Record<PlanKind, number>> = { monthly: 1, six_weeks: 30.44 / 42, quarterly: 1 / 3, semiannual: 1 / 6, annual: 1 / 12 };
const ORDER: Record<BillingStatus["state"], number> = { overdue: 0, due_soon: 1, none: 2, ok: 3 };

export default async function PaymentsOverviewPage() {
  await requireOwner();
  const supabase = await createClient();
  const today = todayISO();
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const [{ data: clients }, { data: billing }, { data: payments }, { data: settings }] = await Promise.all([
    supabase.from("clients").select("id, first_name, last_name, status").neq("status", "archived").order("first_name"),
    supabase.rpc("billing_overview"),
    supabase.from("payments").select("id, client_id, paid_on, amount, method, period_start, period_end, sessions").gte("paid_on", addMonths(yearStart, -12)).order("paid_on", { ascending: false }),
    supabase.from("app_settings").select("reminder_days").maybeSingle(),
  ]);
  const byClient = new Map((billing ?? []).map((b) => [b.client_id, b]));
  const nameOf = new Map((clients ?? []).map((c) => [c.id, `${c.first_name} ${c.last_name}`.trim()]));
  const rows = (clients ?? []).map((c) => {
    const b = byClient.get(c.id);
    const status = billingStatus(b ? { ...b, kind: b.kind as PlanKind } : null, today, settings?.reminder_days ?? 7);
    return { client: c, plan: b, status };
  }).sort((a, z) => ORDER[a.status.state] - ORDER[z.status.state] || (a.status.daysLeft ?? 999) - (z.status.daysLeft ?? 999));

  const pay = payments ?? [];
  const month = today.slice(0, 7);
  const thisMonth = pay.filter((p) => p.paid_on.slice(0, 7) === month).reduce((s, p) => s + Number(p.amount), 0);
  const thisYear = pay.filter((p) => p.paid_on >= yearStart).reduce((s, p) => s + Number(p.amount), 0);
  const recurring = rows.reduce((s, r) => s + (r.plan && r.client.status === "active" ? Number(r.plan.amount) * (MONTHLY_FACTOR[r.plan.kind as PlanKind] ?? 0) : 0), 0);
  const attention = rows.filter((r) => r.status.state === "overdue" || r.status.state === "due_soon").length;

  return (
    <div className="flex flex-col gap-6">
      <PageTitle eyebrow="Solo titolare" title="Pagamenti">
        <p className="text-[15px] text-muted">I pagamenti avvengono fuori dall&apos;app. Qui registri cosa è saldato e vedi subito chi deve rinnovare.</p>
      </PageTitle>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <Card dark><Eyebrow dark>Da guardare</Eyebrow><BigNumber className="mt-3" value={attention} unit={attention === 1 ? "cliente" : "clienti"} /></Card>
        <Card><Eyebrow>Incassato questo mese</Eyebrow><BigNumber className="mt-3" value={formatEuro(thisMonth)} /></Card>
        <Card><Eyebrow>Nel {today.slice(0, 4)}</Eyebrow><BigNumber className="mt-3" value={formatEuro(thisYear)} /></Card>
        <Card><Eyebrow>Ricorrente stimato</Eyebrow><BigNumber className="mt-3" value={formatEuro(Math.round(recurring))} unit="/ mese" /><p className="mt-1 text-xs text-muted">Abbonamenti attivi, senza pacchetti</p></Card>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-left text-[15px]">
          <thead>
            <tr className="text-xs tracking-wider text-muted uppercase">
              <th className="px-5 py-3 font-semibold">Cliente</th>
              <th className="px-3 py-3 font-semibold">Piano</th>
              <th className="px-3 py-3 font-semibold">Stato</th>
              <th className="px-5 py-3 text-right font-semibold">Saldato fino</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ client, plan, status }) => (
              <tr key={client.id} className="border-t border-sand-deep hover:bg-white/60">
                <td className="px-5 py-3"><Link href={`/staff/clienti/${client.id}/pagamenti`} className="font-semibold hover:underline">{nameOf.get(client.id)}</Link>{client.status === "paused" ? <span className="ml-2 text-xs text-muted">in pausa</span> : null}</td>
                <td className="px-3 py-3 text-muted">{plan ? `${PLAN_LABELS[plan.kind as PlanKind]} · ${formatEuro(plan.amount)}` : "—"}</td>
                <td className="px-3 py-3">
                  <span className="inline-flex items-center gap-2">
                    <Dot tone={status.state === "overdue" ? "accent" : status.state === "due_soon" ? "deep" : status.state === "none" ? "muted" : "ink"} />
                    {status.label}
                  </span>
                </td>
                <td className="px-5 py-3 text-right text-muted tabular">{status.dueDate ? formatShort(status.dueDate, 0) : status.sessionsLeft !== null && plan ? `${plan.sessions_used}/${plan.sessions_bought} sessioni` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <Eyebrow className="mb-3">Ultimi pagamenti registrati</Eyebrow>
        {pay.length ? (
          <ul className="flex flex-col">
            {pay.slice(0, 15).map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-sand-deep py-2.5 first:border-t-0">
                <span><span className="font-semibold">{nameOf.get(p.client_id) ?? "Cliente archiviato"}</span> <span className="text-sm text-muted">· {formatShort(p.paid_on, 0)} · {METHOD_LABELS[p.method as PaymentMethod]}</span></span>
                <span className="font-semibold tabular">{formatEuro(p.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[15px] text-muted">Nessun pagamento registrato. Apri un cliente → Pagamenti per impostare il piano.</p>
        )}
      </Card>
    </div>
  );
}
