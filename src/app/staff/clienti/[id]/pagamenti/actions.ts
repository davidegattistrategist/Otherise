"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatLong, isISODate, todayISO } from "@/lib/dates";
import { billingStatus, creditChange, formatEuro, isPeriodic, METHODS, nextPaymentProposal, PLAN_KINDS, situationText, type BillingRow, type PlanKind } from "@/lib/billing";
import { notify } from "@/lib/notify";
import { deliverPendingEmails, sendEmail } from "@/lib/email";
import type { ActionState } from "@/components/form-bits";
import { getClientCredit } from "@/lib/data/billing";

const money = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};
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

export async function recordPayment(clientId: string, planId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireOwner();
  const supabase = await createClient();
  const { data: plan } = await supabase.from("payment_plans").select("kind, amount").eq("id", planId).eq("client_id", clientId).maybeSingle();
  if (!plan) return { error: "Piano non trovato." };
  const kind = plan.kind as PlanKind;
  const paidOn = String(fd.get("paid_on") ?? "");
  if (!isISODate(paidOn)) return { error: "Data del pagamento non valida." };
  const amount = money(fd.get("amount"));
  // con il credito un periodo può costare 0 €
  if (!Number.isFinite(amount) || amount < 0 || (amount === 0 && !isPeriodic(kind))) return { error: "Importo non valido." };
  const method = String(fd.get("method") ?? "transfer");
  if (!(METHODS as readonly string[]).includes(method)) return { error: "Metodo non valido." };
  // coaching: la differenza dal prezzo diventa credito (o resta da recuperare), se scelto
  const credit = isPeriodic(kind) ? await getClientCredit(supabase, clientId) : 0;
  const change = isPeriodic(kind) ? creditChange({ planAmount: Number(plan.amount), credit, paid: amount, keep: fd.get("keep_difference") !== "off" }) : 0;
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  let sessions: number | null = null;
  if (isPeriodic(kind)) {
    periodStart = String(fd.get("period_start") ?? "");
    periodEnd = String(fd.get("period_end") ?? "");
    if (!isISODate(periodStart) || !isISODate(periodEnd)) return { error: "Indica il periodo coperto dal pagamento." };
    if (periodEnd < periodStart) return { error: "Il periodo finisce prima di iniziare." };
  } else {
    const s = int(fd.get("sessions"));
    if (Number.isNaN(s) || !s) return { error: "Indica quante sessioni copre il pagamento." };
    sessions = s;
  }
  const { error } = await supabase.from("payments").insert({
    client_id: clientId,
    plan_id: planId,
    paid_on: paidOn,
    amount,
    method: method as (typeof METHODS)[number],
    period_start: periodStart,
    period_end: periodEnd,
    sessions,
    notes: String(fd.get("notes") ?? "").trim(),
    credit_change: change,
    created_by: me.id,
  });
  if (error) return { error: "Salvataggio non riuscito." };
  revalidate(clientId);
  const after = Math.round((credit + change) * 100) / 100;
  return { ok: true, message: `Pagamento di ${formatEuro(amount)} registrato.${change !== 0 ? ` ${after > 0 ? `Credito per il prossimo rinnovo: ${formatEuro(after)}.` : after < 0 ? `Da recuperare al prossimo rinnovo: ${formatEuro(-after)}.` : "Credito usato tutto."}` : ""}` };
}

/**
 * Pagamento fuori dal piano (es. sessioni PT in più): senza piano e senza
 * periodo, quindi conta negli incassi ma non cambia la scadenza né il pacchetto.
 */
export async function recordExtraPayment(clientId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireOwner();
  const supabase = await createClient();
  const paidOn = String(fd.get("paid_on") ?? "");
  if (!isISODate(paidOn)) return { error: "Data del pagamento non valida." };
  const amount = money(fd.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Scrivi l'importo, per esempio 700." };
  const method = String(fd.get("method") ?? "cash");
  if (!(METHODS as readonly string[]).includes(method)) return { error: "Metodo non valido." };
  const rawSessions = String(fd.get("sessions") ?? "").trim();
  const sessions = rawSessions ? int(rawSessions) : null;
  if (sessions !== null && (Number.isNaN(sessions) || sessions < 1)) return { error: "Il numero di sessioni non è valido: lascialo vuoto se non serve." };
  const notes = String(fd.get("notes") ?? "").trim();
  if (!notes) return { error: "Scrivi per cosa è il pagamento, per esempio \"Sessioni PT extra\"." };
  const { error } = await supabase.from("payments").insert({
    client_id: clientId,
    plan_id: null,
    paid_on: paidOn,
    amount,
    method: method as (typeof METHODS)[number],
    period_start: null,
    period_end: null,
    sessions,
    notes,
    created_by: me.id,
  });
  if (error) return { error: "Salvataggio non riuscito." };
  revalidate(clientId);
  return { ok: true, message: `Pagamento extra di ${formatEuro(amount)} registrato. La scadenza del piano non cambia.` };
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
  const { data: old } = await supabase.from("payments").select("plan_id, period_start, period_end, sessions, amount, credit_change").eq("id", paymentId).eq("client_id", clientId).maybeSingle();
  if (!old) return { error: "Pagamento non trovato." };
  const paidOn = String(fd.get("paid_on") ?? "");
  if (!isISODate(paidOn)) return { error: "Data del pagamento non valida." };
  const amount = money(fd.get("amount"));
  const periodicPayment = Boolean(old.period_start && old.period_end);
  if (!Number.isFinite(amount) || amount < 0 || (amount === 0 && !periodicPayment)) return { error: "Importo non valido." };
  const method = String(fd.get("method") ?? "transfer");
  if (!(METHODS as readonly string[]).includes(method)) return { error: "Metodo non valido." };
  const update: { paid_on: string; amount: number; method: (typeof METHODS)[number]; notes: string; period_start?: string; period_end?: string; sessions?: number | null; credit_change?: number } = {
    paid_on: paidOn,
    amount,
    method: method as (typeof METHODS)[number],
    notes: String(fd.get("notes") ?? "").trim().slice(0, 500),
  };
  // coaching: se cambia l'importo, la differenza passa al credito (es. ha pagato 500 e non 300)
  if (periodicPayment && amount !== Number(old.amount)) update.credit_change = Math.round((Number(old.credit_change) + amount - Number(old.amount)) * 100) / 100;
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
export async function setCredit(clientId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireOwner();
  const supabase = await createClient();
  const raw = String(fd.get("credit") ?? "").trim();
  const value = raw ? money(raw) : 0;
  if (!Number.isFinite(value) || value < 0 || value > 100000) return { error: "Scrivi un importo, per esempio 200 (oppure 0 se siete in pari)." };
  const target = fd.get("mode") === "due" ? -value : value;
  const [{ data: client }, { data: pays }] = await Promise.all([
    supabase.from("clients").select("credit_adjust").eq("id", clientId).maybeSingle(),
    supabase.from("payments").select("credit_change").eq("client_id", clientId).neq("credit_change", 0),
  ]);
  if (!client) return { error: "Cliente non trovato." };
  const fromPayments = (pays ?? []).reduce((t, p) => t + Number(p.credit_change), 0);
  const { error } = await supabase.from("clients").update({ credit_adjust: Math.round((target - fromPayments) * 100) / 100 }).eq("id", clientId);
  if (error) return { error: "Salvataggio non riuscito." };
  revalidate(clientId);
  return { ok: true, message: target > 0 ? `Fatto: credito di ${formatEuro(target)}, il prossimo rinnovo costa meno.` : target < 0 ? `Fatto: ${formatEuro(-target)} da recuperare, si aggiungono al prossimo rinnovo.` : "Fatto: siete in pari." };
}

export async function deletePayment(clientId: string, paymentId: string) {
  await requireOwner();
  const supabase = await createClient();
  await supabase.from("payments").delete().eq("id", paymentId).eq("client_id", clientId);
  revalidate(clientId);
}

/** Registra in un tocco il pagamento atteso (importo e periodo del piano attivo). */
export async function quickPayment(clientId: string): Promise<ActionState> {
  const me = await requireOwner();
  const supabase = await createClient();
  const [{ data: plan }, { data: billing }] = await Promise.all([
    supabase.from("payment_plans").select("id, kind, amount, method, start_date, package_sessions").eq("client_id", clientId).eq("active", true).maybeSingle(),
    supabase.rpc("client_billing", { cid: clientId }),
  ]);
  if (!plan) return { error: "Il cliente non ha un piano attivo." };
  const row = (billing as BillingRow[] | null)?.[0];
  const periodic = isPeriodic(plan.kind as PlanKind);
  const credit = periodic ? await getClientCredit(supabase, clientId) : 0;
  const p = nextPaymentProposal({ ...plan, kind: plan.kind as PlanKind }, row?.paid_until ?? null, credit);
  const { error } = await supabase.from("payments").insert({
    client_id: clientId,
    plan_id: plan.id,
    paid_on: todayISO(),
    amount: p.amount,
    method: plan.method as (typeof METHODS)[number],
    period_start: p.period_start,
    period_end: p.period_end,
    sessions: p.sessions,
    // paga il dovuto: il credito (o il debito) di prima è sistemato
    credit_change: periodic ? creditChange({ planAmount: Number(plan.amount), credit, paid: p.amount, keep: true }) : 0,
    created_by: me.id,
  });
  if (error) return { error: "Registrazione non riuscita." };
  revalidate(clientId);
  return {
    ok: true,
    message: `Registrato ${formatEuro(p.amount)}${p.period_end ? ` · saldato fino al ${formatLong(p.period_end)}` : p.sessions ? ` · ${p.sessions} ${p.sessions === 1 ? "sessione" : "sessioni"}` : ""}.`,
  };
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
    await deliverPendingEmails();
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
export async function setClientFree(clientId: string, free: boolean) {
  await requireOwner();
  const supabase = await createClient();
  await supabase.from("clients").update({ free }).eq("id", clientId);
  revalidatePath("/staff", "layout");
  redirect(`/staff/clienti/${clientId}/pagamenti`);
}
