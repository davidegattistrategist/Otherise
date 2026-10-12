import Link from "next/link";
import type { Metadata } from "next";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatShort, todayISO } from "@/lib/dates";
import { billingStatus, formatEuro, isPeriodic, METHOD_LABELS, PLAN_LABELS, suggestNextPeriod, type BillingRow, type PaymentMethod, type PlanKind } from "@/lib/billing";
import { getPtCounter, reminderChatLink } from "@/lib/data/billing";
import { IconChat, IconDown } from "@/components/icons";
import { Card, Dot, EmptyState, Eyebrow, LinkButton, Notice } from "@/components/ui";
import { ConfirmButton } from "@/components/form-bits";
import { EditPaymentForm, ExtraPaymentForm, PaymentForm, PlanForm, PtLeftForm, PtPriceForm, ReminderButton } from "./forms";
import { closePackage, deletePayment, recordExtraPayment, recordPayment, reopenPackage, savePlan, sendPaymentReminder, setClientFree, setPtLeft, setPtPrice, clearPtCorrection, updatePayment } from "./actions";
import { ClearParams } from "@/components/clear-param";

export const metadata: Metadata = { title: "Pagamenti" };

export default async function ClientPaymentsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ piano?: string }> }) {
  const { id } = await params;
  const { piano } = await searchParams;
  await requireOwner();
  const supabase = await createClient();
  const today = todayISO();
  const [{ data: plans }, { data: payments }, { data: billing }, { data: settings }, { data: client }] = await Promise.all([
    supabase.from("payment_plans").select("id, kind, amount, method, start_date, package_sessions, active, notes, created_at, sessions_written_off, package_closed_on, package_closed_sessions").eq("client_id", id).order("created_at", { ascending: false }),
    supabase.from("payments").select("id, plan_id, paid_on, amount, method, period_start, period_end, sessions, notes").eq("client_id", id).order("paid_on", { ascending: false }),
    supabase.rpc("client_billing", { cid: id }),
    supabase.from("app_settings").select("reminder_days, payment_message").maybeSingle(),
    supabase.from("clients").select("free, status").eq("id", id).maybeSingle(),
  ]);
  if (client?.free) {
    return (
      <Card className="flex max-w-2xl flex-col gap-3">
        <Eyebrow>Cliente gratis</Eyebrow>
        <p className="text-[15px] leading-relaxed">Non compare in pagamenti, scadenze, incassi, previsioni ed export, e non riceve promemoria di rinnovo. {(payments ?? []).length ? "I pagamenti registrati prima restano salvati ma non contano." : ""}</p>
        <form action={setClientFree.bind(null, id, false)}>
          <ConfirmButton variant="secondary" message="Togliere il cliente dai gratis? Tornerà nei pagamenti e nelle previsioni.">Non è più gratis</ConfirmButton>
        </form>
      </Card>
    );
  }
  const plan = (plans ?? []).find((p) => p.active) ?? null;
  const { counter: pt, price: ptPrice } = await getPtCounter(supabase, id);
  const row = (billing as BillingRow[] | null)?.[0] ?? null;
  // in pausa o a fine percorso non è tra i pagamenti da incassare
  const paused = client?.status === "paused" || client?.status === "archived";
  const status: ReturnType<typeof billingStatus> = paused
    ? { ...billingStatus(row ? { ...row, kind: row.kind as PlanKind } : null, today, settings?.reminder_days ?? 7), state: "none", label: client?.status === "paused" ? "In pausa" : "Percorso terminato" }
    : billingStatus(row ? { ...row, kind: row.kind as PlanKind } : null, today, settings?.reminder_days ?? 7);
  const kind = plan?.kind as PlanKind | undefined;
  const suggestion = plan && kind ? suggestNextPeriod(kind, plan.start_date, row?.paid_until ?? null) : null;
  const totalYear = (payments ?? []).filter((p) => p.paid_on.slice(0, 4) === today.slice(0, 4)).reduce((s, p) => s + Number(p.amount), 0);
  const editingPlan = piano === "modifica" && plan;
  const newPlan = !plan;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="flex flex-col gap-4">
        {piano === "salvato" || piano === "chiuso" ? <ClearParams names={["piano"]} /> : null}
        {piano === "salvato" ? <Notice tone="success">Piano salvato.</Notice> : null}
        {piano === "chiuso" ? <Notice tone="success">Pacchetto segnato come terminato. Quando rinnova, registra il nuovo pagamento.</Notice> : null}
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
              {kind === "package" && pt ? ` · ${pt.left >= 0 ? `${pt.left} ${pt.left === 1 ? "sessione rimasta" : "sessioni rimaste"}` : `${-pt.left} da saldare`}` : ""}
              {kind === "package" && plan.sessions_written_off ? ` · ${plan.sessions_written_off} non usate (pacchetto chiuso)` : ""}
            </p>
            {paused ? <p className="text-sm text-muted-dark">Non è tra i pagamenti da incassare. Se rinnova, registra il pagamento e {client?.status === "paused" ? "riattivalo" : "riprendi il percorso"} dalla Scheda.</p> : null}
            {plan.notes ? <p className="text-sm text-muted-dark">{plan.notes}</p> : null}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-sm font-semibold">
              <a href={`/staff/clienti/${id}/pagamenti?piano=modifica`} className="underline">Modifica il piano</a>
              {kind === "package" && status.sessionsLeft !== null && status.sessionsLeft > 0 ? (
                <form action={closePackage.bind(null, id, plan.id)}>
                  <ConfirmButton variant="ghost" className="!min-h-0 !p-0 !text-card underline" message={`Segnare il pacchetto come terminato?\nLe ${status.sessionsLeft} sessioni rimaste non saranno più disponibili.`}>Segna il pacchetto come terminato</ConfirmButton>
                </form>
              ) : null}
            </div>
            {kind === "package" && plan.package_closed_on ? (
              <div className="flex flex-wrap items-center gap-x-3 text-sm text-muted-dark">
                Chiuso a mano il {formatShort(plan.package_closed_on, 0)} ({plan.package_closed_sessions} {plan.package_closed_sessions === 1 ? "sessione non usata" : "sessioni non usate"}).
                <form action={reopenPackage.bind(null, id, plan.id)}>
                  <button type="submit" className="font-semibold text-card underline">Annulla</button>
                </form>
              </div>
            ) : null}
          </Card>
        ) : null}

        {plan && kind && !editingPlan ? (
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

        {plan && !editingPlan ? (
          <details className="group rounded-[24px] bg-card">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
              <span>
                <span className="block text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Pagamento extra</span>
                <span className="mt-1 block text-sm text-muted">Fuori dal piano, per esempio sessioni PT in più: conta negli incassi ma non cambia la scadenza.</span>
              </span>
              <IconDown size={18} className="shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-5 pb-5">
              <ExtraPaymentForm action={recordExtraPayment.bind(null, id)} today={today} method="cash" />
            </div>
          </details>
        ) : null}

        {editingPlan || newPlan ? (
          <Card className="flex flex-col gap-4">
            <div>
              <Eyebrow>{editingPlan ? "Modifica il piano" : "Imposta il piano di pagamento"}</Eyebrow>
              <p className="mt-1.5 text-sm text-muted">
                {editingPlan ? "Cambia quello che serve, poi scegli se vale da una certa data (il piano di prima resta nello storico) o se stai correggendo un errore." : "Il pagamento avviene fuori dall'app: qui tieni traccia di cosa è saldato e l'app ti avvisa quando scade."}
              </p>
            </div>
            <PlanForm action={savePlan.bind(null, id, editingPlan ? plan.id : null)} values={editingPlan ? plan : undefined} today={today} submitLabel={editingPlan ? "Salva il piano" : "Attiva il piano"} editing={Boolean(editingPlan)} />
            {plan ? <a href={`/staff/clienti/${id}/pagamenti`} className="text-sm font-semibold underline">Annulla</a> : null}
          </Card>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3" id="sessioni-pt">
          <Eyebrow>Sessioni PT</Eyebrow>
          {pt ? (
            <>
              {pt.due > 0 ? (
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[34px] leading-none font-semibold text-accent tabular">{pt.due}</span>
                  <span className="text-[15px] text-muted">{pt.due === 1 ? "sessione da saldare" : "sessioni da saldare"}{pt.dueAmount !== null ? ` · ${formatEuro(pt.dueAmount)}` : ""}</span>
                </div>
              ) : pt.left > 0 ? (
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[34px] leading-none font-semibold tabular">{pt.left}</span>
                  <span className="text-[15px] text-muted">{pt.left === 1 ? "sessione rimasta (pagata, da fare)" : "sessioni rimaste (pagate, da fare)"}</span>
                </div>
              ) : (
                <div className="text-[22px] font-semibold">In pari: nessuna sessione rimasta</div>
              )}
              <p className="text-sm text-muted">
                {pt.corrected ? `Dalla tua correzione del ${formatShort(pt.since, 0)}` : `Dal ${formatShort(pt.since, 0)}`}: {pt.bought} {pt.bought === 1 ? "pagata" : "pagate"} · {pt.used} {pt.used === 1 ? "fatta" : "fatte"}
                {pt.price !== null ? ` · ${formatEuro(pt.price)} a sessione` : ""}. Si aggiorna da solo: le sessioni che segni in{" "}
                <a href={`/staff/clienti/${id}/sessioni`} className="font-semibold text-ink underline">Sessioni PT</a> si tolgono, i pacchetti e le lezioni pagate si aggiungono (e coprono prima quelle fatte da saldare).
              </p>
              {pt.due > 0 ? (
                <div className="flex flex-col gap-3 rounded-2xl bg-sand p-4">
                  <div className="flex flex-wrap gap-2">
                    <LinkButton href={`/staff/messaggi/${id}?promemoria=sessioni`} variant="secondary" size="sm"><IconChat size={16} /> Scrivi in chat quante sono</LinkButton>
                  </div>
                  <details className="group">
                    <summary className="cursor-pointer list-none text-sm font-semibold underline [&::-webkit-details-marker]:hidden">Registra il saldo</summary>
                    <div className="pt-3">
                      <ExtraPaymentForm action={recordExtraPayment.bind(null, id)} today={today} method="cash" defaults={{ amount: pt.dueAmount, sessions: pt.due, notes: "Saldo sessioni PT" }} submitLabel="Registra il saldo" />
                    </div>
                  </details>
                </div>
              ) : null}
              <div><LinkButton href={`/staff/pagamenti/nuovo?cliente=${id}&tipo=lezioni`} variant="secondary" size="sm">Registra un pacchetto o lezioni pagate</LinkButton></div>
              <details className="group border-t border-sand-deep pt-3">
                <summary className="cursor-pointer list-none text-sm font-semibold underline [&::-webkit-details-marker]:hidden">Correggi il conteggio</summary>
                <div className="flex flex-col gap-3 pt-3">
                  <p className="text-sm text-muted">Se il numero non è giusto (per esempio sessioni fatte prima di usare l&apos;app), scrivi come stanno le cose oggi: da qui in poi si conta da solo.</p>
                  <PtLeftForm action={setPtLeft.bind(null, id)} left={pt.left} price={ptPrice} />
                  {pt.corrected ? (
                    <form action={clearPtCorrection.bind(null, id)}>
                      <ConfirmButton variant="ghost" className="!min-h-0 !p-0 text-sm text-muted underline" message="Togliere la correzione? Il contatore torna a contare tutte le sessioni e tutti i pagamenti dall'inizio.">Togli la correzione</ConfirmButton>
                    </form>
                  ) : null}
                </div>
              </details>
              <details className="group">
                <summary className="cursor-pointer list-none text-sm font-semibold underline [&::-webkit-details-marker]:hidden">Prezzo a sessione</summary>
                <div className="pt-3"><PtPriceForm action={setPtPrice.bind(null, id)} price={ptPrice} /></div>
              </details>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">
                {plan && kind && isPeriodic(kind) ? "Le sessioni PT sono comprese nel suo piano, quindi non si contano." : "Ancora niente da contare."} Se fa sessioni da pagare a parte, registra il pacchetto o le lezioni pagate; se ne ha già fatte senza pagarle, scrivi qui quante ne deve saldare. Da lì il contatore va da solo: rimaste = pagate − fatte.
              </p>
              <PtLeftForm action={setPtLeft.bind(null, id)} left={null} price={ptPrice} first />
              <div><LinkButton href={`/staff/pagamenti/nuovo?cliente=${id}&tipo=lezioni`} variant="secondary" size="sm">Registra un pacchetto o lezioni pagate</LinkButton></div>
            </>
          )}
        </Card>
        {plan && !paused ? (
          <Card className="flex flex-col gap-3">
            <Eyebrow>Promemoria</Eyebrow>
            <p className="text-sm text-muted">L&apos;app avvisa già in automatico te e il cliente {settings?.reminder_days ?? 7} giorni prima della scadenza. Da qui puoi mandare un promemoria subito: in chat (il messaggio è già scritto, lo controlli e premi invio) o come notifica.</p>
            <div className="flex flex-wrap items-start gap-2">
              <LinkButton href={reminderChatLink(id)} variant="secondary" size="sm"><IconChat size={16} /> Scrivi in chat</LinkButton>
              <ReminderButton action={sendPaymentReminder.bind(null, id)} />
            </div>
          </Card>
        ) : null}
        <Card className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <Eyebrow>Storico pagamenti</Eyebrow>
            <span className="flex items-baseline gap-3">
              <span className="text-sm text-muted">{formatEuro(totalYear)} nel {today.slice(0, 4)}</span>
              <Link href={`/staff/pagamenti/nuovo?cliente=${id}`} className="text-sm font-semibold underline">Nuovo pagamento</Link>
            </span>
          </div>
          {payments?.length ? (
            <ul className="flex flex-col">
              {payments.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-3 border-t border-sand-deep py-3 first:border-t-0">
                  <div className="min-w-0">
                    <div className="font-semibold tabular">{formatEuro(p.amount)} <span className="font-normal text-muted">· {METHOD_LABELS[p.method as PaymentMethod]}</span>{!p.plan_id ? <span className="ml-2 rounded-full bg-sand px-2 py-0.5 text-xs font-semibold text-ink-soft">Extra</span> : null}</div>
                    <div className="text-sm text-muted">
                      {formatShort(p.paid_on, 0)}
                      {p.period_start && p.period_end ? ` · copre ${formatShort(p.period_start, 0)} – ${formatShort(p.period_end, 0)}` : ""}
                      {p.sessions ? ` · ${p.sessions} ${p.sessions === 1 ? "sessione" : "sessioni"}` : ""}
                    </div>
                    {p.notes ? <div className="text-sm text-ink-soft">{p.notes}</div> : null}
                    <details className="mt-1">
                      <summary className="inline-flex min-h-9 cursor-pointer items-center text-sm font-semibold text-ink-soft underline">Modifica</summary>
                      <div className="mt-2 rounded-2xl bg-sand p-3">
                        <EditPaymentForm action={updatePayment.bind(null, id, p.id)} values={{ paid_on: p.paid_on, amount: p.amount, method: p.method, period_start: p.period_start, period_end: p.period_end, sessions: p.sessions, notes: p.notes ?? "", extra: !p.plan_id }} />
                      </div>
                    </details>
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
        <Card className="flex flex-col gap-2">
          <Eyebrow>Cliente gratis</Eyebrow>
          <p className="text-sm text-muted">Per un cliente di prova o per te stesso: non comparirà in pagamenti, scadenze, incassi e previsioni.</p>
          <form action={setClientFree.bind(null, id, true)}>
            <ConfirmButton variant="secondary" message="Mettere questo cliente gratis? Non comparirà più in pagamenti, scadenze, incassi e previsioni.">Metti gratis</ConfirmButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
