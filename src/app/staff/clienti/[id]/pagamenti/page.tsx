import type { Metadata } from "next";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatShort, todayISO } from "@/lib/dates";
import { billingStatus, formatEuro, isPeriodic, METHOD_LABELS, PLAN_LABELS, suggestNextPeriod, type BillingRow, type PaymentMethod, type PlanKind } from "@/lib/billing";
import { Card, Dot, EmptyState, Eyebrow, Notice } from "@/components/ui";
import { ConfirmButton } from "@/components/form-bits";
import { PaymentForm, PlanForm, ReminderButton } from "./forms";
import { deletePayment, recordPayment, savePlan, sendPaymentReminder } from "./actions";

export const metadata: Metadata = { title: "Pagamenti" };

export default async function ClientPaymentsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ piano?: string }> }) {
  const { id } = await params;
  const { piano } = await searchParams;
  await requireOwner();
  const supabase = await createClient();
  const today = todayISO();
  const [{ data: plans }, { data: payments }, { data: billing }, { data: settings }] = await Promise.all([
    supabase.from("payment_plans").select("id, kind, amount, method, start_date, package_sessions, active, notes, created_at").eq("client_id", id).order("created_at", { ascending: false }),
    supabase.from("payments").select("id, plan_id, paid_on, amount, method, period_start, period_end, sessions, notes").eq("client_id", id).order("paid_on", { ascending: false }),
    supabase.rpc("client_billing", { cid: id }),
    supabase.from("app_settings").select("reminder_days").maybeSingle(),
  ]);
  const plan = (plans ?? []).find((p) => p.active) ?? null;
  const row = (billing as BillingRow[] | null)?.[0] ?? null;
  const status = billingStatus(row ? { ...row, kind: row.kind as PlanKind } : null, today, settings?.reminder_days ?? 7);
  const kind = plan?.kind as PlanKind | undefined;
  const suggestion = plan && kind ? suggestNextPeriod(kind, plan.start_date, row?.paid_until ?? null) : null;
  const totalYear = (payments ?? []).filter((p) => p.paid_on.slice(0, 4) === today.slice(0, 4)).reduce((s, p) => s + Number(p.amount), 0);
  const editingPlan = piano === "modifica" && plan;
  const newPlan = piano === "nuovo" || !plan;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="flex flex-col gap-4">
        {piano === "salvato" ? <Notice tone="success">Piano salvato.</Notice> : null}
        {plan && kind ? (
          <Card dark className="flex flex-col gap-3">
            <Eyebrow dark>Stato</Eyebrow>
            <div className="flex items-center gap-2.5 text-[26px] leading-tight font-semibold">
              <Dot tone={status.state === "overdue" ? "accent" : status.state === "due_soon" ? "deep" : "muted"} className="h-2.5 w-2.5" />
              {status.label}
            </div>
            <p className="text-[15px] text-muted-dark">
              {PLAN_LABELS[kind]} · {formatEuro(plan.amount)} · {METHOD_LABELS[plan.method as PaymentMethod]}
              {status.dueDate ? ` · saldato fino al ${formatShort(status.dueDate, 0)}` : ""}
              {kind === "package" && row ? ` · ${row.sessions_used} fatte su ${row.sessions_bought} pagate` : ""}
            </p>
            {plan.notes ? <p className="text-sm text-muted-dark">{plan.notes}</p> : null}
            <div className="flex flex-wrap gap-4 pt-1 text-sm font-semibold">
              <a href={`/staff/clienti/${id}/pagamenti?piano=modifica`} className="underline">Modifica il piano</a>
              <a href={`/staff/clienti/${id}/pagamenti?piano=nuovo`} className="underline">Cambia piano</a>
            </div>
          </Card>
        ) : null}

        {plan && kind && !editingPlan && piano !== "nuovo" ? (
          <Card className="flex flex-col gap-4">
            <div>
              <Eyebrow>Registra un pagamento</Eyebrow>
              <p className="mt-1.5 text-sm text-muted">{isPeriodic(kind) ? "Il periodo riparte dal giorno dopo l'ultimo saldato: controlla e salva." : "Indica quante sessioni sono state pagate."}</p>
            </div>
            <PaymentForm
              action={recordPayment.bind(null, id, plan.id)}
              kind={kind}
              defaults={{
                paid_on: today,
                amount: plan.amount,
                method: plan.method,
                period_start: suggestion?.start ?? null,
                period_end: suggestion?.end ?? null,
                sessions: kind === "package" ? plan.package_sessions : 1,
              }}
            />
          </Card>
        ) : null}

        {editingPlan || newPlan ? (
          <Card className="flex flex-col gap-4">
            <div>
              <Eyebrow>{editingPlan ? "Modifica il piano" : plan ? "Nuovo piano" : "Imposta il piano di pagamento"}</Eyebrow>
              <p className="mt-1.5 text-sm text-muted">
                {editingPlan ? "Le modifiche valgono anche per i pagamenti già registrati su questo piano." : plan ? "Il piano attuale resta nello storico; da qui in poi vale quello nuovo." : "Il pagamento avviene fuori dall'app: qui tieni traccia di cosa è saldato e l'app ti avvisa quando scade."}
              </p>
            </div>
            <PlanForm action={savePlan.bind(null, id, editingPlan ? plan.id : null)} values={editingPlan ? plan : undefined} today={today} submitLabel={editingPlan ? "Salva il piano" : "Attiva il piano"} />
            {plan ? <a href={`/staff/clienti/${id}/pagamenti`} className="text-sm font-semibold underline">Annulla</a> : null}
          </Card>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        {plan ? (
          <Card className="flex flex-col gap-3">
            <Eyebrow>Promemoria</Eyebrow>
            <p className="text-sm text-muted">L&apos;app avvisa già in automatico il cliente {settings?.reminder_days ?? 7} giorni prima della scadenza. Da qui puoi mandarne uno subito.</p>
            <ReminderButton action={sendPaymentReminder.bind(null, id)} />
          </Card>
        ) : null}
        <Card className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <Eyebrow>Storico pagamenti</Eyebrow>
            <span className="text-sm text-muted">{formatEuro(totalYear)} nel {today.slice(0, 4)}</span>
          </div>
          {payments?.length ? (
            <ul className="flex flex-col">
              {payments.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-3 border-t border-sand-deep py-3 first:border-t-0">
                  <div className="min-w-0">
                    <div className="font-semibold tabular">{formatEuro(p.amount)} <span className="font-normal text-muted">· {METHOD_LABELS[p.method as PaymentMethod]}</span></div>
                    <div className="text-sm text-muted">
                      {formatShort(p.paid_on, 0)}
                      {p.period_start && p.period_end ? ` · copre ${formatShort(p.period_start, 0)} – ${formatShort(p.period_end, 0)}` : ""}
                      {p.sessions ? ` · ${p.sessions} ${p.sessions === 1 ? "sessione" : "sessioni"}` : ""}
                    </div>
                    {p.notes ? <div className="text-sm text-ink-soft">{p.notes}</div> : null}
                  </div>
                  <form action={deletePayment.bind(null, id, p.id)}>
                    <ConfirmButton variant="ghost" message="Eliminare questo pagamento?">Elimina</ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nessun pagamento registrato" />
          )}
        </Card>
        {(plans ?? []).filter((p) => !p.active).length ? (
          <Card className="flex flex-col gap-2">
            <Eyebrow>Piani precedenti</Eyebrow>
            {(plans ?? []).filter((p) => !p.active).map((p) => (
              <div key={p.id} className="text-sm text-muted">{PLAN_LABELS[p.kind as PlanKind]} · {formatEuro(p.amount)} · dal {formatShort(p.start_date, 0)}</div>
            ))}
          </Card>
        ) : null}
      </div>
    </div>
  );
}
