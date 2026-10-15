"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatLong, isISODate, todayISO } from "@/lib/dates";
import { billingStatus, creditChange, dueAmount, formatEuro, isPeriodic, unpaidPeriods, usesCredit, METHODS, nextPaymentProposal, periodEnd, PLAN_KINDS, situationText, type BillingRow, type PlanKind, parseEuro } from "@/lib/billing";
import { notify } from "@/lib/notify";
import { emailsLater, sendEmail } from "@/lib/email";
import type { ActionState } from "@/components/form-bits";
import { creditScope, getClientCredit } from "@/lib/data/billing";

const money = (v: FormDataEntryValue | null) => parseEuro(String(v ?? ""));
const int = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : NaN;
};

function revalidate(clientId: string) {
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
  revalidatePath("/staff/pagamenti");
  revalidatePath("/staff");
}

export async function savePlan(clientId: string, planId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireOwner();
  const supabase = await createClient();
  const kind = String(fd.get("kind") ?? "") as PlanKind;
  if (!PLAN_KINDS.includes(kind)) return { error: "Scegli il tipo di piano." };
  const amount = money(fd.get("amount"));
  if (!Number.isFinite(amount) || amount < 0) return { error: "Importo non valido." };
  const method = String(fd.get("method") ?? "transfer");
  if (!(METHODS as readonly string[]).includes(method)) return { error: "Metodo non valido." };
  const start = String(fd.get("start_date") ?? "");
  if (!isISODate(start)) return { error: "Data di inizio non valida." };
  const pkg = int(fd.get("package_sessions"));
  if (Number.isNaN(pkg)) return { error: "Numero di sessioni del pacchetto non valido." };
  if (kind === "package" && !pkg) return { error: "Indica quante sessioni ha il pacchetto." };
  const row = {
    kind,
    amount,
    method: method as (typeof METHODS)[number],
    start_date: start,
    package_sessions: kind === "package" ? pkg : null,
    notes: String(fd.get("notes") ?? "").trim(),
  };
  // modifica "da una data": nuovo piano, quello di prima resta nello storico
  if (planId && fd.get("mode") !== "from") {
    const { error } = await supabase.from("payment_plans").update(row).eq("id", planId).eq("client_id", clientId);
    if (error) return { error: "Salvataggio non riuscito." };
  } else {
    // Un solo piano attivo per cliente: il precedente resta nello storico
    await supabase.from("payment_plans").update({ active: false }).eq("client_id", clientId).eq("active", true);
    const { error } = await supabase.from("payment_plans").insert({ ...row, client_id: clientId });
    if (error) return { error: "Salvataggio non riuscito." };
  }
  revalidate(clientId);
  redirect(`/staff/clienti/${clientId}/pagamenti?piano=salvato`);
}

/**
 * Correzione a mano del contatore delle sessioni PT: "oggi gliene restano N"
 * oppure "ne deve saldare N". Il conteggio riparte da adesso: da qui in poi si
 * aggiungono le sessioni pagate e si tolgono quelle fatte.
 */
export async function setPtLeft(clientId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireOwner();
  const supabase = await createClient();
  const raw = String(fd.get("count") ?? "").trim();
  const n = Number(raw);
  if (!raw || !Number.isInteger(n) || n < 0 || n > 500) return { error: "Scrivi un numero di sessioni, per esempio 3." };
  const mode = String(fd.get("mode") ?? "left");
  const left = mode === "due" ? -n : n;
  const rawPrice = String(fd.get("price") ?? "").trim();
  const price = rawPrice ? money(rawPrice) : null;
  if (price !== null && (!Number.isFinite(price) || price < 0)) return { error: "Prezzo non valido: scrivi per esempio 45, oppure lascialo vuoto." };
  const { error } = await supabase
    .from("clients")
    .update({ pt_baseline_at: new Date().toISOString(), pt_baseline_left: left, ...(fd.has("price") ? { pt_session_price: price } : {}) })
    .eq("id", clientId);
  if (error) return { error: "Salvataggio non riuscito." };
  revalidate(clientId);
  const what = n === 1 ? "1 sessione" : `${n} sessioni`;
  return { ok: true, message: left < 0 ? `Fatto: ${what} da saldare. Da ora le sessioni fatte e quelle pagate si contano da sole.` : n === 0 ? "Fatto: siete in pari. Da ora le sessioni si contano da sole." : `Fatto: ${what} pagate ancora da fare. Da ora si scalano da sole.` };
}

/** Prezzo di una sessione PT (serve per l'importo da saldare). */
export async function setPtPrice(clientId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireOwner();
  const supabase = await createClient();
  const rawPrice = String(fd.get("price") ?? "").trim();
  const price = rawPrice ? money(rawPrice) : null;
  if (price !== null && (!Number.isFinite(price) || price < 0)) return { error: "Prezzo non valido: scrivi per esempio 45, oppure lascialo vuoto." };
  const { error } = await supabase.from("clients").update({ pt_session_price: price }).eq("id", clientId);
  if (error) return { error: "Salvataggio non riuscito." };
  revalidate(clientId);
  return { ok: true, message: price === null ? "Prezzo tolto." : `Prezzo salvato: ${formatEuro(price)} a sessione.` };
}

/** Toglie la correzione a mano: il contatore torna a contare tutto dall'inizio. */
export async function clearPtCorrection(clientId: string) {
  await requireOwner();
  const supabase = await createClient();
  await supabase.from("clients").update({ pt_baseline_at: null, pt_baseline_left: null, extra_sessions_adjust: 0 }).eq("id", clientId);
  revalidate(clientId);
}

/** Corregge un pagamento già registrato (es. il trimestre parte il 1° settembre e non il 1° agosto). */
export async function updatePayment(clientId: string, paymentId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireOwner();
  const supabase = await createClient();
  const { data: old } = await supabase.from("payments").select("plan_id, period_start, period_end, sessions, amount, credit_change, unpaid, payment_plans(kind, amount, package_sessions)").eq("id", paymentId).eq("client_id", clientId).maybeSingle();
  if (!old) return { error: "Pagamento non trovato." };
  const paidOn = String(fd.get("paid_on") ?? "");
  if (!isISODate(paidOn)) return { error: "Data del pagamento non valida." };
  const amount = money(fd.get("amount"));
  const periodicPayment = Boolean(old.period_start && old.period_end);
  const oldPlan = old.payment_plans as unknown as { kind: string; amount: number; package_sessions: number | null } | null;
  const fullPackage = oldPlan?.kind === "package" && old.sessions === oldPlan.package_sessions;
  if (!Number.isFinite(amount) || amount < 0 || (amount === 0 && !periodicPayment && !fullPackage)) return { error: "Importo non valido." };
  const method = String(fd.get("method") ?? "transfer");
  if (!(METHODS as readonly string[]).includes(method)) return { error: "Metodo non valido." };
  const update: { paid_on: string; amount: number; method: (typeof METHODS)[number]; notes: string; period_start?: string; period_end?: string; sessions?: number | null; credit_change?: number; unpaid?: boolean } = {
    paid_on: paidOn,
    amount,
    method: method as (typeof METHODS)[number],
    notes: String(fd.get("notes") ?? "").trim().slice(0, 500),
  };
  // coaching o pacchetto intero: se cambia l'importo, la differenza passa al credito (es. ha pagato 500 e non 300)
  if (old.unpaid) {
    // periodo "da saldare": con un importo diventa pagato (la differenza dal prezzo passa al credito)
    if (amount > 0) {
      update.unpaid = false;
      update.credit_change = Math.round((amount - Number(oldPlan?.amount ?? amount)) * 100) / 100;
      if (update.notes === "Da saldare") update.notes = "";
    }
  } else if ((periodicPayment || fullPackage || Number(old.credit_change) !== 0) && amount !== Number(old.amount)) update.credit_change = Math.round((Number(old.credit_change) + amount - Number(old.amount)) * 100) / 100;
  if (old.period_start && old.period_end) {
    const start = String(fd.get("period_start") ?? "");
    const end = String(fd.get("period_end") ?? "");
    if (!isISODate(start) || !isISODate(end)) return { error: "Indica il periodo coperto dal pagamento." };
    if (end < start) return { error: "Il periodo finisce prima di iniziare." };
    update.period_start = start;
    update.period_end = end;
  } else if (fd.has("sessions")) {
    const raw = String(fd.get("sessions") ?? "").trim();
    const n = raw && raw !== "0" ? int(raw) : null;
    if (n !== null && Number.isNaN(n)) return { error: "Numero di sessioni non valido." };
    if (old.plan_id && !n) return { error: "Indica quante sessioni copre il pagamento." };
    update.sessions = n;
  }
  const { error } = await supabase.from("payments").update(update).eq("id", paymentId).eq("client_id", clientId);
  if (error) return { error: "Salvataggio non riuscito." };
  revalidate(clientId);
  return { ok: true, message: "Pagamento corretto." };
}

/**
 * Correzione a mano del credito: "oggi ha un credito di X €" oppure "deve
 * ancora X €" (si aggiunge al prossimo rinnovo). 0 = in pari.
 */
/**
 * Sposta il periodo di coaching da pagare (es. dopo uno stop): il periodo
 * nuovo parte dalla data scelta. L'ultimo periodo pagato finisce il giorno
 * prima (lo stop resta coperto), oppure, se non c'è ancora nessun pagamento,
 * l'inizio del piano.
 */
export async function setNextPeriodStart(clientId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireOwner();
  const supabase = await createClient();
  const start = String(fd.get("start") ?? "");
  if (!isISODate(start)) return { error: "Scegli la data da cui parte il periodo." };
  const { data: plan } = await supabase.from("payment_plans").select("id, kind").eq("client_id", clientId).eq("active", true).maybeSingle();
  if (!plan || !isPeriodic(plan.kind as PlanKind)) return { error: "Serve un piano di coaching attivo." };
  const { data: last } = await supabase.from("payments").select("id, period_start, period_end").eq("plan_id", plan.id).not("period_end", "is", null).order("period_end", { ascending: false }).limit(1).maybeSingle();
  if (last) {
    if (last.period_start && start <= last.period_start) return { error: `Scegli una data dopo il ${formatLong(last.period_start)}, l'inizio dell'ultimo periodo pagato.` };
    const { error } = await supabase.from("payments").update({ period_end: addDays(start, -1) }).eq("id", last.id);
    if (error) return { error: "Salvataggio non riuscito." };
  } else {
    const { error } = await supabase.from("payment_plans").update({ start_date: start }).eq("id", plan.id);
    if (error) return { error: "Salvataggio non riuscito." };
  }
  revalidate(clientId);
  const end = periodEnd(plan.kind as PlanKind, start);
  return { ok: true, message: `Fatto: il periodo da pagare va dal ${formatLong(start)}${end ? ` al ${formatLong(end)}` : ""}.` };
}

export async function setCredit(clientId: string, scope: "coaching" | "lessons", _: ActionState, fd: FormData): Promise<ActionState> {
  await requireOwner();
  const supabase = await createClient();
  const raw = String(fd.get("credit") ?? "").trim();
  const value = raw ? money(raw) : 0;
  if (!Number.isFinite(value) || value < 0 || value > 100000) return { error: "Scrivi un importo, per esempio 200 (oppure 0 se siete in pari)." };
  const target = fd.get("mode") === "due" ? -value : value;
  const [{ data: client }, { data: pays }] = await Promise.all([
    supabase.from("clients").select("id").eq("id", clientId).maybeSingle(),
    supabase.from("payments").select("credit_change, sessions, period_start").eq("client_id", clientId).neq("credit_change", 0),
  ]);
  if (!client) return { error: "Cliente non trovato." };
  // coaching: pagamenti con un periodo; lezioni: pagamenti con le sessioni
  const fromPayments = (pays ?? []).filter((p) => (scope === "lessons") === (!p.period_start && p.sessions !== null)).reduce((t, p) => t + Number(p.credit_change), 0);
  const adjust = Math.round((target - fromPayments) * 100) / 100;
  const { error } = await supabase.from("clients").update(scope === "lessons" ? { pt_credit_adjust: adjust } : { credit_adjust: adjust }).eq("id", clientId);
  if (error) return { error: "Salvataggio non riuscito." };
  revalidate(clientId);
  const next = scope === "lessons" ? "le prossime lezioni PT" : "il prossimo rinnovo";
  return { ok: true, message: target > 0 ? `Fatto: credito di ${formatEuro(target)}, ${next} ${scope === "lessons" ? "costano" : "costa"} meno.` : target < 0 ? `Fatto: ${formatEuro(-target)} da recuperare, si aggiungono a ${next}.` : "Fatto: siete in pari." };
}

export async function deletePayment(clientId: string, paymentId: string) {
  await requireOwner();
  const supabase = await createClient();
  await supabase.from("payments").delete().eq("id", paymentId).eq("client_id", clientId);
  revalidate(clientId);
}

type SavedPayment = { id: string; paid_on: string; amount: number; method: string; period_start: string | null; period_end: string | null; sessions: number | null };

/**
 * Registra in un tocco il pagamento atteso (importo e periodo del piano attivo).
 * `index`: quale dei periodi di coaching da pagare (0 = il più vecchio). Se paga
 * un periodo più avanti, quelli prima restano nel registro come "da saldare".
 */
export async function quickPayment(clientId: string, index = 0): Promise<ActionState & { payment?: SavedPayment }> {
  const me = await requireOwner();
  const supabase = await createClient();
  const [{ data: plan }, { data: billing }] = await Promise.all([
    supabase.from("payment_plans").select("id, kind, amount, method, start_date, package_sessions").eq("client_id", clientId).eq("active", true).maybeSingle(),
    supabase.rpc("client_billing", { cid: clientId }),
  ]);
  if (!plan) return { error: "Il cliente non ha un piano attivo." };
  const kind = plan.kind as PlanKind;
  const row = (billing as BillingRow[] | null)?.[0];
  const withCredit = usesCredit(kind);
  const credit = withCredit ? await getClientCredit(supabase, clientId, creditScope(kind)) : 0;
  let paidUntil = row?.paid_until ?? null;
  // periodi saltati prima di quello che paga: restano "da saldare"
  // (se paga in anticipo non ci sono periodi scoperti: niente da saltare)
  const skip = isPeriodic(kind) ? Math.max(0, Math.min(Math.floor(index) || 0, unpaidPeriods({ ...plan, kind }, paidUntil, todayISO()).length - 1)) : 0;
  for (let i = 0; i < skip; i++) {
    const p = nextPaymentProposal({ ...plan, kind }, paidUntil, 0);
    const { error } = await supabase.from("payments").insert({
      client_id: clientId, plan_id: plan.id, paid_on: todayISO(), amount: 0, method: plan.method as (typeof METHODS)[number],
      period_start: p.period_start, period_end: p.period_end, sessions: null, credit_change: 0, unpaid: true, notes: "Da saldare", created_by: me.id,
    });
    if (error) return { error: "Registrazione non riuscita." };
    paidUntil = p.period_end;
  }
  const p = nextPaymentProposal({ ...plan, kind }, paidUntil, credit);
  // paga il dovuto: il credito (o il debito) di prima è sistemato
  const change = withCredit ? creditChange({ planAmount: Number(plan.amount), credit, paid: p.amount, keep: true }) : 0;
  const { data: saved, error } = await supabase.from("payments").insert({
    client_id: clientId,
    plan_id: plan.id,
    paid_on: todayISO(),
    amount: p.amount,
    method: plan.method as (typeof METHODS)[number],
    period_start: p.period_start,
    period_end: p.period_end,
    sessions: p.sessions,
    credit_change: change,
    created_by: me.id,
  }).select("id, paid_on, amount, method, period_start, period_end, sessions").single();
  if (error || !saved) return { error: "Registrazione non riuscita." };
  revalidate(clientId);
  return {
    ok: true,
    // per correggerlo subito ("Modifica" accanto al pagamento appena registrato)
    payment: { ...saved, amount: Number(saved.amount) },
    message: `Registrato ${formatEuro(p.amount)}${p.period_start && p.period_end ? ` · ${formatLong(p.period_start)} – ${formatLong(p.period_end)}` : p.sessions ? ` · ${p.sessions} ${p.sessions === 1 ? "sessione" : "sessioni"}` : ""}.${skip ? ` ${skip === 1 ? "Il periodo prima resta" : `I ${skip} periodi prima restano`} da saldare.` : ""}`,
  };
}

/** Saldo in un tocco delle sessioni PT fatte e non pagate (prezzo a lezione, tolto il credito sulle lezioni). */
export async function settleSessions(clientId: string): Promise<ActionState & { payment?: SavedPayment }> {
  const me = await requireOwner();
  const supabase = await createClient();
  const [{ data: counter }, { data: client }] = await Promise.all([
    supabase.rpc("pt_counters"),
    supabase.from("clients").select("pt_session_price").eq("id", clientId).maybeSingle(),
  ]);
  const k = (counter ?? []).find((r: { client_id: string }) => r.client_id === clientId) as { bought: number; used: number } | undefined;
  const due = k ? Math.max(0, Number(k.used) - Number(k.bought)) : 0;
  if (!due) return { error: "Non ci sono sessioni da saldare." };
  const price = Number(client?.pt_session_price ?? 0);
  if (!price) return { error: "Imposta prima il prezzo a lezione (Sistema i conti), oppure usa Nuovo pagamento." };
  const full = Math.round(due * price * 100) / 100;
  const credit = await getClientCredit(supabase, clientId, "lessons");
  const amount = dueAmount(full, credit);
  const { data: saved, error } = await supabase.from("payments").insert({
    client_id: clientId, plan_id: null, paid_on: todayISO(), amount, method: "cash", period_start: null, period_end: null, sessions: due,
    notes: "Saldo sessioni PT", credit_change: creditChange({ planAmount: full, credit, paid: amount, keep: true }), created_by: me.id,
  }).select("id, paid_on, amount, method, period_start, period_end, sessions").single();
  if (error || !saved) return { error: "Registrazione non riuscita." };
  revalidate(clientId);
  return { ok: true, payment: { ...saved, amount: Number(saved.amount) }, message: `Registrato ${formatEuro(amount)} · ${due} ${due === 1 ? "sessione" : "sessioni"}.` };
}

/** Segna pagato un periodo rimasto "da saldare" (importo del piano, tolto il credito). */
export async function payUnpaid(clientId: string, paymentId: string): Promise<ActionState & { payment?: SavedPayment }> {
  await requireOwner();
  const supabase = await createClient();
  const { data: old } = await supabase.from("payments").select("id, plan_id, unpaid").eq("id", paymentId).eq("client_id", clientId).maybeSingle();
  if (!old?.unpaid) return { error: "Questo periodo risulta già pagato." };
  const { data: plan } = old.plan_id ? await supabase.from("payment_plans").select("kind, amount, method").eq("id", old.plan_id).maybeSingle() : { data: null };
  if (!plan) return { error: "Piano non trovato." };
  const credit = await getClientCredit(supabase, clientId);
  const amount = dueAmount(Number(plan.amount), credit);
  const { data: saved, error } = await supabase
    .from("payments")
    .update({ amount, unpaid: false, paid_on: todayISO(), method: plan.method as (typeof METHODS)[number], notes: "", credit_change: creditChange({ planAmount: Number(plan.amount), credit, paid: amount, keep: true }) })
    .eq("id", paymentId)
    .select("id, paid_on, amount, method, period_start, period_end, sessions")
    .single();
  if (error || !saved) return { error: "Registrazione non riuscita." };
  revalidate(clientId);
  return { ok: true, payment: { ...saved, amount: Number(saved.amount) }, message: `Registrato ${formatEuro(amount)}${saved.period_start && saved.period_end ? ` · ${formatLong(saved.period_start)} – ${formatLong(saved.period_end)}` : ""}.` };
}

/** Promemoria gentile al cliente: notifica nell'app + email (se configurata). */
export async function sendPaymentReminder(clientId: string, _: ActionState, __: FormData): Promise<ActionState> {
  await requireOwner();
  const supabase = await createClient();
  const [{ data: client }, { data: billing }, { data: settings }] = await Promise.all([
    supabase.from("clients").select("first_name, email, user_id").eq("id", clientId).maybeSingle(),
    supabase.rpc("client_billing", { cid: clientId }),
    supabase.from("app_settings").select("business_name, reminder_days").maybeSingle(),
  ]);
  if (!client) return { error: "Cliente non trovato." };
  const row = (billing as BillingRow[] | null)?.[0];
  if (!row) return { error: "Il cliente non ha un piano di pagamento." };
  const status = billingStatus({ ...row, kind: row.kind as PlanKind }, todayISO(), settings?.reminder_days ?? 7);
  const business = settings?.business_name || "Otherise";
  const what = situationText(status, row.kind as PlanKind, formatLong);
  const body = `Ciao ${client.first_name}, ti ricordiamo che ${what}. Quando vuoi, rinnova con le solite modalità. Grazie!`;
  if (!client.user_id && !client.email) return { error: "Il cliente non ha né account né email." };
  if (client.user_id) {
    await notify([{ recipient_id: client.user_id, client_id: clientId, kind: "payment_reminder", title: "Promemoria rinnovo", body, link: "/cliente/profilo", dedupe_key: `payrem:${clientId}:${todayISO()}` }]);
  }
  if (client.user_id) {
    // email solo se serve (niente notifiche sul telefono, regole in deliverPendingEmails)
    await emailsLater();
    return { ok: true, message: "Promemoria inviato nell'app." };
  }
  // senza app l'email è l'unico modo
  const emailed = client.email ? await sendEmail(client.email, `${business} · promemoria rinnovo`, body) : false;
  if (!emailed) return { error: "Il cliente non ha ancora l'app e l'invio delle email non è configurato: scrivigli tu." };
  return { ok: true, message: "Promemoria inviato per email." };
}

/**
 * Pacchetto chiuso a mano: le sessioni rimaste non valgono più
 * (es. pacchetto scaduto secondo gli accordi presi col cliente).
 */
export async function closePackage(clientId: string, planId: string) {
  await requireOwner();
  const supabase = await createClient();
  const [{ data: plan }, { data: billing }] = await Promise.all([
    supabase.from("payment_plans").select("id, kind, sessions_written_off").eq("id", planId).eq("client_id", clientId).maybeSingle(),
    supabase.rpc("client_billing", { cid: clientId }),
  ]);
  const row = (billing as BillingRow[] | null)?.[0];
  if (!plan || plan.kind !== "package" || !row || row.plan_id !== planId) return;
  const left = row.sessions_bought - row.sessions_used;
  if (left <= 0) return;
  await supabase
    .from("payment_plans")
    .update({ sessions_written_off: plan.sessions_written_off + left, package_closed_on: todayISO(), package_closed_sessions: left })
    .eq("id", planId);
  revalidate(clientId);
  redirect(`/staff/clienti/${clientId}/pagamenti?piano=chiuso`);
}

/** Annulla l'ultima chiusura a mano del pacchetto. */
export async function reopenPackage(clientId: string, planId: string) {
  await requireOwner();
  const supabase = await createClient();
  const { data: plan } = await supabase.from("payment_plans").select("sessions_written_off, package_closed_sessions").eq("id", planId).eq("client_id", clientId).maybeSingle();
  if (!plan) return;
  await supabase
    .from("payment_plans")
    .update({ sessions_written_off: Math.max(0, plan.sessions_written_off - plan.package_closed_sessions), package_closed_on: null, package_closed_sessions: 0 })
    .eq("id", planId);
  revalidate(clientId);
}

/**
 * Cliente gratis (un cliente di prova, o il trainer stesso): esce da pagamenti,
 * scadenze, incassi, previsioni ed export. Lo storico resta salvato.
 */
export async function setClientFree(clientId: string, free: boolean, back: "pagamenti" | "profilo" = "pagamenti") {
  await requireOwner();
  const supabase = await createClient();
  await supabase.from("clients").update({ free }).eq("id", clientId);
  revalidatePath("/staff", "layout");
  redirect(back === "profilo" ? `/staff/clienti/${clientId}/profilo?stato=${free ? "gratis" : "pagante"}` : `/staff/clienti/${clientId}/pagamenti`);
}
