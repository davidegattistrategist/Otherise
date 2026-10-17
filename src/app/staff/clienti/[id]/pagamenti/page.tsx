import { QuickPay } from "@/components/quick-pay";
import { EditPaymentButton } from "@/components/edit-payment-dialog";
import Link from "next/link";
import type { Metadata } from "next";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatShort, todayISO } from "@/lib/dates";
import { billingStatus, withUnpaidRows, dueAmount, formatEuro, isPeriodic, nextPaymentProposal, usesCredit, METHOD_LABELS, PLAN_LABELS, suggestNextPeriod, type BillingRow, type PaymentMethod, type PlanKind } from "@/lib/billing";
import { getClientCredit, getPtCounter, getUnpaidRows, reminderChatLink } from "@/lib/data/billing";
import { IconArrowRight, IconChat, IconDown, IconPlus } from "@/components/icons";
import { Card, Dot, EmptyState, Eyebrow, LinkButton, Notice } from "@/components/ui";
import { ConfirmButton } from "@/components/form-bits";
import { CreditFixForm, NextPeriodForm, PlanForm, PtLeftForm, PtPriceForm, ReminderButton } from "./forms";
import { closePackage, reopenPackage, savePlan, sendPaymentReminder, setClientFree, setCredit, setNextPeriodStart, setPtLeft, setPtPrice, clearPtCorrection } from "./actions";
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
    supabase.from("payments").select("id, plan_id, paid_on, amount, method, period_start, period_end, sessions, notes, credit_change, unpaid").eq("client_id", id).order("paid_on", { ascending: false }),
    supabase.rpc("client_billing", { cid: id }),
    supabase.from("app_settings").select("reminder_days, payment_message").maybeSingle(),
    supabase.from("clients").select("free, status, first_name, last_name").eq("id", id).maybeSingle(),
  ]);
  if (client?.free) {
    return (
      <Card className="flex max-w-2xl flex-col gap-3">
        <Eyebrow>Cliente gratis</Eyebrow>
        <p className="text-[15px] leading-relaxed">Non compare in pagamenti, scadenze, incassi, previsioni ed export, e non riceve promemoria di rinnovo. {(payments ?? []).length ? "I pagamenti registrati prima restano salvati ma non contano." : ""}</p>
        <form action={setClientFree.bind(null, id, false, "pagamenti")}>
          <ConfirmButton variant="secondary" message="Togliere il cliente dai gratis? Tornerà nei pagamenti e nelle previsioni.">Non è più gratis</ConfirmButton>
        </form>
      </Card>
    );
  }
  const plan = (plans ?? []).find((p) => p.active) ?? null;
  const [{ counter: pt, price: ptPrice }, coachingCredit, lessonsCredit, unpaidBy] = await Promise.all([getPtCounter(supabase, id), getClientCredit(supabase, id), getClientCredit(supabase, id, "lessons"), getUnpaidRows(supabase, id)]);
  // lezioni PT a parte: le voci si mostrano solo se le fa (o ci sono già numeri)
  const ptRelevant = !plan || !isPeriodic(plan.kind as PlanKind) || Boolean(pt) || ptPrice !== null || Math.abs(lessonsCredit) >= 0.005;
  // il credito del piano: lezioni per i pacchetti, coaching per i periodi
  const credit = plan?.kind === "package" ? lessonsCredit : coachingCredit;
  const unpaidRows = unpaidBy.get(id) ?? [];
  const row = (billing as BillingRow[] | null)?.[0] ?? null;
  // in pausa o a fine percorso non è tra i pagamenti da incassare
  const paused = client?.status === "paused" || client?.status === "archived";
  const status: ReturnType<typeof billingStatus> = paused
    ? { ...billingStatus(row ? { ...row, kind: row.kind as PlanKind } : null, today, settings?.reminder_days ?? 7), state: "none", label: client?.status === "paused" ? "In pausa" : "Percorso terminato" }
    : withUnpaidRows(billingStatus(row ? { ...row, kind: row.kind as PlanKind } : null, today, settings?.reminder_days ?? 7), unpaidRows, today);
  const kind = plan?.kind as PlanKind | undefined;
  const suggestion = plan && kind ? suggestNextPeriod(kind, plan.start_date, row?.paid_until ?? null) : null;
  // coaching o pacchetto di lezioni: quanto deve per il prossimo periodo/pacchetto, tolto il credito (o aggiunto quello da recuperare)
  const due = plan && kind && usesCredit(kind) ? dueAmount(Number(plan.amount), credit) : null;
  // pagamento atteso, da registrare con "Pagato" in un tocco
  const next = plan && kind ? nextPaymentProposal({ ...plan, kind }, row?.paid_until ?? null, credit) : null;
  const nextText = next ? `${formatEuro(next.amount)}${next.period_start && next.period_end ? ` · ${formatShort(next.period_start, 0)} – ${formatShort(next.period_end, 0)}` : next.sessions ? ` · ${next.sessions} ${next.sessions === 1 ? "sessione" : "sessioni"}` : ""}` : "";
  const fullName = client ? `${client.first_name} ${client.last_name}`.trim() : "Cliente";
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
            {kind && usesCredit(kind) && Math.abs(credit) >= 0.005 ? (
              <p className="text-[15px] text-card">
                {credit > 0 ? `Credito di ${formatEuro(credit)}` : `${formatEuro(-credit)} da recuperare`}: il prossimo rinnovo è di <strong>{formatEuro(due ?? 0)}</strong> invece di {formatEuro(plan.amount)}.
              </p>
            ) : null}
            {paused ? <p className="text-sm text-muted-dark">Non è tra i pagamenti da incassare. Se rinnova, registra il pagamento e {client?.status === "paused" ? "riattivalo" : "riprendi il percorso"} da Dati (card Percorso).</p> : null}
            {plan.notes ? <p className="text-sm text-muted-dark">{plan.notes}</p> : null}
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
          <Card className="flex flex-col gap-3" id="registra">
            <Eyebrow>Registra un pagamento</Eyebrow>
            {next && !paused ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-sand px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm text-muted">{isPeriodic(kind) ? "Prossimo periodo" : kind === "package" ? "Prossimo pacchetto" : "Prossimo pagamento"}</div>
                  <div className="text-[17px] font-semibold tabular">{nextText}</div>
                </div>
                <QuickPay clientId={id} name={fullName} proposal={nextText} reminder={null} />
              </div>
            ) : null}
            <p className="text-sm text-muted">Ha pagato una cifra diversa, lezioni PT, un nuovo coaching o altro? Con <strong className="text-ink">Nuovo pagamento</strong> ti guida l&apos;app e tiene conto del credito.</p>
            <div><LinkButton href={`/staff/pagamenti/nuovo?cliente=${id}`} size="sm"><IconPlus size={16} /> Nuovo pagamento</LinkButton></div>
          </Card>
        ) : null}

        {plan && kind && !editingPlan ? (
          <Card className="flex flex-col gap-1 p-0" id="sistema">
            <div className="px-5 pt-5 pb-2 sm:px-6"><Eyebrow>Sistema i conti</Eyebrow></div>
            <ul className="flex flex-col">
              <li className="border-t border-sand-deep">
                <a href={`/staff/clienti/${id}/pagamenti?piano=modifica`} className="flex min-h-14 items-center justify-between gap-3 px-5 py-3 sm:px-6">
                  <span><span className="block font-semibold">Modifica il piano</span><span className="block text-sm text-muted">{PLAN_LABELS[kind]} · {formatEuro(plan.amount)}</span></span>
                  <IconArrowRight size={18} className="shrink-0 text-muted" />
                </a>
              </li>
              {isPeriodic(kind) && suggestion && !paused ? (
                <FixItem id="periodo" title="Sposta il periodo da pagare" value={`${formatShort(suggestion.start, 0)} → ${formatShort(suggestion.end, 0)} (es. dopo uno stop)`}>
                  <NextPeriodForm action={setNextPeriodStart.bind(null, id)} kind={kind} start={suggestion.start} />
                </FixItem>
              ) : null}
              {isPeriodic(kind) ? (
                <FixItem title="Credito del coaching" value={Math.abs(coachingCredit) < 0.005 ? "In pari" : coachingCredit > 0 ? `Credito di ${formatEuro(coachingCredit)}` : `${formatEuro(-coachingCredit)} da recuperare`}>
                  <p className="text-sm text-muted">Il prezzo del {PLAN_LABELS[kind].toLowerCase()} è {formatEuro(plan.amount)}. Se una volta ha pagato di più o di meno, scrivi com&apos;è la situazione oggi: il prossimo rinnovo si aggiusta da solo.</p>
                  <CreditFixForm action={setCredit.bind(null, id, "coaching")} credit={coachingCredit} />
                </FixItem>
              ) : null}
              {ptRelevant ? (
                <>
                  <FixItem title="Credito sulle lezioni PT" value={Math.abs(lessonsCredit) < 0.005 ? "In pari" : lessonsCredit > 0 ? `Credito di ${formatEuro(lessonsCredit)}` : `${formatEuro(-lessonsCredit)} da recuperare`}>
                    <p className="text-sm text-muted">Se una volta ha pagato le lezioni più (o meno) del dovuto{ptPrice ? ` (${formatEuro(ptPrice)} a lezione)` : ""}, scrivi com&apos;è la situazione oggi: le prossime lezioni si aggiustano da sole. È separato dal credito del coaching.</p>
                    <CreditFixForm action={setCredit.bind(null, id, "lessons")} credit={lessonsCredit} />
                  </FixItem>
                  <FixItem title="Sessioni PT: correggi il conteggio" value={pt ? (pt.due > 0 ? `${pt.due} da saldare` : `${pt.left} rimaste`) : "Nessun conteggio"}>
                    <p className="text-sm text-muted">Se il numero non è giusto (per esempio sessioni fatte prima di usare l&apos;app), scrivi come stanno le cose oggi: da qui in poi si conta da solo.</p>
                    <PtLeftForm action={setPtLeft.bind(null, id)} left={pt ? pt.left : null} price={ptPrice} first={!pt} />
                    {pt?.corrected ? (
                      <form action={clearPtCorrection.bind(null, id)}>
                        <ConfirmButton variant="ghost" className="!min-h-0 !p-0 text-sm text-muted underline" message="Togliere la correzione? Il contatore torna a contare tutte le sessioni e tutti i pagamenti dall'inizio.">Togli la correzione</ConfirmButton>
                      </form>
                    ) : null}
                  </FixItem>
                  <FixItem title="Prezzo a lezione PT" value={ptPrice !== null ? formatEuro(ptPrice) : "Non impostato"}>
                    <PtPriceForm action={setPtPrice.bind(null, id)} price={ptPrice} />
                  </FixItem>
                </>
              ) : (
                <FixItem title="Lezioni PT a parte" value="Non ne fa (comprese nel piano)">
                  <p className="text-sm text-muted">Servono solo se fa anche lezioni PT da pagare a parte: prezzo a lezione e sessioni già fatte senza pagarle.</p>
                  <PtPriceForm action={setPtPrice.bind(null, id)} price={ptPrice} />
                  <PtLeftForm action={setPtLeft.bind(null, id)} left={null} price={ptPrice} first />
                </FixItem>
              )}
              {kind === "package" && status.sessionsLeft !== null && status.sessionsLeft > 0 ? (
                <FixItem title="Chiudi il pacchetto" value={`${status.sessionsLeft} ${status.sessionsLeft === 1 ? "sessione rimasta" : "sessioni rimaste"}`}>
                  <p className="text-sm text-muted">Se secondo i vostri accordi il pacchetto è finito anche con sessioni non usate. Si può annullare.</p>
                  <form action={closePackage.bind(null, id, plan.id)}>
                    <ConfirmButton variant="secondary" message={`Segnare il pacchetto come terminato?\nLe ${status.sessionsLeft} sessioni rimaste non saranno più disponibili.`}>Segna il pacchetto come terminato</ConfirmButton>
                  </form>
                </FixItem>
              ) : null}
            </ul>
          </Card>
        ) : null}

        {editingPlan || newPlan ? (
          <Card className="flex flex-col gap-4">
            <div>
              <Eyebrow>{editingPlan ? "Modifica il piano" : "Imposta il piano di pagamento"}</Eyebrow>
              <p className="mt-1.5 text-sm text-muted">
                {editingPlan ? "Cambia quello che serve, poi scegli da quando vale. Se cambi solo il metodo o le note è una correzione: i periodi restano uguali." : "Il pagamento avviene fuori dall'app: qui tieni traccia di cosa è saldato e l'app ti avvisa quando scade."}
              </p>
            </div>
            <PlanForm action={savePlan.bind(null, id, editingPlan ? plan.id : null)} values={editingPlan ? plan : undefined} today={today} submitLabel={editingPlan ? "Salva il piano" : "Attiva il piano"} editing={Boolean(editingPlan)} nextStart={editingPlan && kind && isPeriodic(kind) && row?.paid_until ? addDays(row.paid_until, 1) : null} />
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
                {pt.price !== null ? ` · ${formatEuro(pt.price)} a sessione` : ""}. Si aggiorna da solo con le sessioni che segni e le lezioni pagate.
              </p>
              {Math.abs(lessonsCredit) >= 0.005 ? (
                <p className="text-[15px]">
                  {lessonsCredit > 0 ? <>Credito sulle lezioni: <strong>{formatEuro(lessonsCredit)}</strong>, le prossime lezioni costano meno.</> : <>Da recuperare sulle lezioni: <strong>{formatEuro(-lessonsCredit)}</strong>, si aggiungono alle prossime.</>}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {pt.due > 0 ? (
                  <>
                    <LinkButton href={`/staff/pagamenti/nuovo?cliente=${id}&tipo=lezioni&sessioni=${pt.due}`} size="sm">Registra il saldo</LinkButton>
                    <LinkButton href={`/staff/messaggi/${id}?promemoria=sessioni`} variant="secondary" size="sm"><IconChat size={16} /> Scrivi in chat quante sono</LinkButton>
                  </>
                ) : (
                  <LinkButton href={`/staff/pagamenti/nuovo?cliente=${id}&tipo=lezioni`} variant="secondary" size="sm">Registra lezioni pagate</LinkButton>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">
                {plan && kind && isPeriodic(kind) ? "Le sessioni PT sono comprese nel suo piano, quindi non si contano." : "Ancora niente da contare."} Se fa lezioni da pagare a parte, registrale con Nuovo pagamento → Lezioni PT; se ne ha già fatte senza pagarle, scrivilo in Sistema i conti.
              </p>
              <div><LinkButton href={`/staff/pagamenti/nuovo?cliente=${id}&tipo=lezioni`} variant="secondary" size="sm">Registra lezioni pagate</LinkButton></div>
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
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <Eyebrow>Storico pagamenti</Eyebrow>
            <span className="flex flex-wrap items-baseline gap-x-3">
              <span className="text-sm whitespace-nowrap text-muted">{formatEuro(totalYear)} nel {today.slice(0, 4)}</span>
              <Link href={`/staff/pagamenti/nuovo?cliente=${id}`} className="text-sm font-semibold whitespace-nowrap underline">Nuovo pagamento</Link>
            </span>
          </div>
          {payments?.length ? (
            <ul className="flex flex-col">
              {payments.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-3 border-t border-sand-deep py-3 first:border-t-0">
                  <div className="min-w-0">
                    {p.unpaid ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-0.5 text-sm font-semibold text-accent-deep"><Dot tone="accent" /> Da saldare</span>
                        <QuickPay clientId={id} name={client ? `${client.first_name} ${client.last_name}`.trim() : "Cliente"} proposal={`${formatEuro(due ?? plan?.amount ?? 0)} · ${formatShort(p.period_start, 0)} – ${formatShort(p.period_end, 0)}`} reminder={null} compact unpaidId={p.id} />
                      </div>
                    ) : (
                    <div className="font-semibold tabular">{formatEuro(p.amount)} <span className="font-normal text-muted">· {METHOD_LABELS[p.method as PaymentMethod]}</span>{!p.plan_id ? <span className="ml-2 rounded-full bg-sand px-2 py-0.5 text-xs font-semibold text-ink-soft">Extra</span> : null}</div>
                    )}
                    <div className="text-sm text-muted">
                      {p.unpaid ? "Periodo" : formatShort(p.paid_on, 0)}
                      {p.period_start && p.period_end ? `${p.unpaid ? "" : " ·"} ${p.unpaid ? "" : "copre "}${formatShort(p.period_start, 0)} – ${formatShort(p.period_end, 0)}` : ""}
                      {p.sessions ? ` · ${p.sessions} ${p.sessions === 1 ? "sessione" : "sessioni"}` : ""}
                    </div>
                    {Number(p.credit_change) > 0 ? <div className="text-sm text-ink-soft">+{formatEuro(p.credit_change)} sul credito (il rinnovo dopo costa meno)</div> : Number(p.credit_change) < 0 ? <div className="text-sm text-ink-soft">−{formatEuro(-Number(p.credit_change))} sul credito</div> : null}
                    {p.notes && !(p.unpaid && p.notes === "Da saldare") ? <div className="text-sm text-ink-soft">{p.notes}</div> : null}
                  </div>
                  <EditPaymentButton clientId={id} paymentId={p.id} name={fullName} values={{ paid_on: p.paid_on, amount: Number(p.amount), method: p.method, period_start: p.period_start, period_end: p.period_end, sessions: p.sessions, notes: p.notes ?? "", extra: !p.plan_id }} className="shrink-0" />
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

/** Una voce di "Sistema i conti": titolo e valore di oggi, si apre con un tocco. */
function FixItem({ id, title, value, children }: { id?: string; title: string; value: string; children: React.ReactNode }) {
  return (
    <li className="border-t border-sand-deep">
      <details id={id} className="group scroll-mt-6">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 sm:px-6 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0"><span className="block font-semibold">{title}</span><span className="block text-sm text-muted">{value}</span></span>
          <IconDown size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-3 px-5 pb-5 sm:px-6">{children}</div>
      </details>
    </li>
  );
}
