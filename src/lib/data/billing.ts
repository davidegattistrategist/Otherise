import "server-only";
import type { ServerSupabase } from "../supabase/server";
import { bySurname, listName } from "../names";
import { billingStatus, ptCounterView, formatEuro, type BillingRow, MONTHLY_FACTOR, nextPaymentProposal, PLAN_LABELS, situationText, type BillingStatus, type PlanKind } from "../billing";
import { addDays, addMonths, formatLong, formatShort, todayISO, type ISODate } from "../dates";
import { DEFAULT_PAYMENT_MESSAGE, fillTemplate } from "../whatsapp";

export type BillingLine = {
  clientId: string;
  name: string;
  firstName: string;
  paused: boolean;
  planKind: PlanKind | null;
  planLabel: string;
  amount: number;
  status: BillingStatus;
  /** Testo per il pulsante "Segna pagato": cosa verrà registrato */
  proposal: string | null;
  /** Link alla chat dell'app con il promemoria già scritto (solo se in scadenza o scaduto) */
  reminder: string | null;
  sessionsUsed: number;
  sessionsBought: number;
};

/** Stato dei pagamenti di tutti i clienti non archiviati (solo titolare). */
export async function getBillingLines(supabase: ServerSupabase): Promise<{ lines: BillingLine[]; reminderDays: number }> {
  const today = todayISO();
  const [{ data: clients }, { data: billing }, { data: plans }, { data: settings }] = await Promise.all([
    supabase.from("clients").select("id, first_name, last_name, status").neq("status", "archived").eq("free", false).order("last_name").order("first_name"),
    supabase.rpc("billing_overview"),
    supabase.from("payment_plans").select("id, client_id, kind, amount, method, start_date, package_sessions").eq("active", true),
    supabase.from("app_settings").select("reminder_days, payment_message").maybeSingle(),
  ]);
  const reminderDays = settings?.reminder_days ?? 7;
  const byClient = new Map((billing ?? []).map((b) => [b.client_id, b]));
  const planBy = new Map((plans ?? []).map((p) => [p.client_id, p]));
  const lines = [...(clients ?? [])].sort(bySurname).map((c): BillingLine => {
    const b = byClient.get(c.id);
    const plan = planBy.get(c.id);
    const kind = (b?.kind ?? null) as PlanKind | null;
    const paused = c.status === "paused";
    // in pausa: non è tra i pagamenti da incassare (quando rinnova si registra e si riattiva)
    const status: BillingStatus = paused
      ? { state: "none", label: "In pausa", clientLabel: "", dueDate: null, daysLeft: null, sessionsLeft: null }
      : billingStatus(b && kind ? { ...b, kind } : null, today, reminderDays);
    let proposal: string | null = null;
    if (plan) {
      const p = nextPaymentProposal({ ...plan, kind: plan.kind as PlanKind }, b?.paid_until ?? null);
      proposal = `${formatEuro(p.amount)}${p.period_start && p.period_end ? ` · ${formatShort(p.period_start)} – ${formatShort(p.period_end)}` : p.sessions ? ` · ${p.sessions} ${p.sessions === 1 ? "sessione" : "sessioni"}` : ""}`;
    }
    const reminder = kind && (status.state === "due_soon" || status.state === "overdue") ? reminderChatLink(c.id) : null;
    return {
      clientId: c.id,
      name: listName(c),
      firstName: c.first_name,
      paused,
      planKind: kind,
      planLabel: kind ? `${PLAN_LABELS[kind]} · ${formatEuro(b?.amount ?? 0)}` : "—",
      amount: Number(b?.amount ?? 0),
      status,
      proposal,
      reminder,
      sessionsUsed: b?.sessions_used ?? 0,
      sessionsBought: b?.sessions_bought ?? 0,
    };
  });
  return { lines, reminderDays };
}

/** Chat dell'app con il promemoria di pagamento già scritto nel campo di testo. */
export const reminderChatLink = (clientId: string) => `/staff/messaggi/${clientId}?promemoria=pagamento`;

/**
 * Testo del promemoria di pagamento (modello in Impostazioni), da preparare
 * nella chat: il trainer lo controlla e preme invio. null se non c'è un piano
 * o se chi guarda non vede i pagamenti (solo il titolare).
 */
export async function paymentReminderText(supabase: ServerSupabase, clientId: string): Promise<string | null> {
  const [{ data: client }, { data: billing }, { data: settings }] = await Promise.all([
    supabase.from("clients").select("first_name").eq("id", clientId).maybeSingle(),
    supabase.rpc("client_billing", { cid: clientId }),
    supabase.from("app_settings").select("reminder_days, payment_message").maybeSingle(),
  ]);
  const row = (billing as BillingRow[] | null)?.[0];
  if (!client || !row) return null;
  const kind = row.kind as PlanKind;
  const status = billingStatus({ ...row, kind }, todayISO(), settings?.reminder_days ?? 7);
  return fillTemplate(settings?.payment_message?.trim() || DEFAULT_PAYMENT_MESSAGE, {
    nome: client.first_name,
    situazione: situationText(status, kind, formatLong),
    importo: formatEuro(row.amount),
    scadenza: status.dueDate ? formatLong(status.dueDate) : "",
  });
}

/** Incassi per mese (ultimi `months` mesi, dal più vecchio) e rinnovi attesi nei prossimi 30 giorni. */
export async function getRevenue(supabase: ServerSupabase, lines: BillingLine[], months = 12) {
  const today = todayISO();
  const firstMonth = addMonths(`${today.slice(0, 7)}-01`, -(months - 1));
  const { data: payments } = await supabase.from("payments").select("paid_on, amount, clients!inner(free)").eq("clients.free", false).gte("paid_on", firstMonth);
  const buckets: Array<{ month: string; total: number }> = [];
  for (let i = 0; i < months; i++) buckets.push({ month: addMonths(firstMonth, i).slice(0, 7), total: 0 });
  for (const p of payments ?? []) {
    const b = buckets.find((x) => x.month === p.paid_on.slice(0, 7));
    if (b) b.total += Number(p.amount);
  }
  const horizon = addDays(today, 30);
  const upcoming = lines.filter(
    (l) => !l.paused && ((l.status.dueDate && l.status.dueDate <= horizon) || (l.status.sessionsLeft !== null && l.status.sessionsLeft <= 2)),
  );
  const expected = upcoming.reduce((t, l) => t + l.amount, 0);
  const recurring = lines.reduce((t, l) => t + (!l.paused && l.planKind ? l.amount * (MONTHLY_FACTOR[l.planKind] ?? 0) : 0), 0);
  return { buckets, expected, upcomingCount: upcoming.length, recurring };
}

export const monthLabel = (ym: string) =>
  new Intl.DateTimeFormat("it-IT", { month: "short", timeZone: "UTC" }).format(new Date(`${ym}-15T00:00:00Z`)) as string;

export type { ISODate };

/**
 * Contatore delle sessioni PT del cliente (rimaste = pagate − fatte). Solo il
 * titolare vede i pagamenti: per il collaboratore torna null. Null anche quando
 * non c'è niente da contare (piano a periodo con le sessioni comprese).
 */
export async function getPtCounter(supabase: ServerSupabase, clientId: string) {
  const [{ data: row }, { data: client }] = await Promise.all([
    supabase.rpc("pt_counters").eq("client_id", clientId).maybeSingle(),
    supabase.from("clients").select("pt_session_price").eq("id", clientId).maybeSingle(),
  ]);
  const price = client?.pt_session_price !== null && client?.pt_session_price !== undefined ? Number(client.pt_session_price) : null;
  return { counter: ptCounterView(row ?? null, price), price };
}

/** Clienti con sessioni PT fatte e non ancora saldate (pagina Pagamenti). */
export async function getSessionsToSettle(supabase: ServerSupabase) {
  const [{ data: rows }, { data: clients }] = await Promise.all([
    supabase.rpc("pt_counters"),
    supabase.from("clients").select("id, first_name, last_name, pt_session_price").neq("status", "archived").eq("free", false),
  ]);
  const byId = new Map((clients ?? []).map((c) => [c.id, c]));
  const out: Array<{ clientId: string; name: string; due: number; dueAmount: number | null }> = [];
  for (const r of rows ?? []) {
    const c = byId.get(r.client_id);
    if (!c) continue;
    const k = ptCounterView(r, c.pt_session_price !== null ? Number(c.pt_session_price) : null);
    if (k && k.due > 0) out.push({ clientId: c.id, name: listName(c), due: k.due, dueAmount: k.dueAmount });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "it", { sensitivity: "base" }));
}

/** Testo già pronto per la chat: "siamo a N sessioni da saldare". */
export function sessionsDueText(firstName: string, due: number, price: number | null) {
  const what = due === 1 ? "1 sessione" : `${due} sessioni`;
  const money = price !== null && price > 0 ? ` (${what} × ${formatEuro(price)} = ${formatEuro(due * price)})` : "";
  return `Ciao ${firstName}! Ti scrivo per le sessioni PT: siamo a ${what} da saldare${money}. Quando ti è comodo sistemiamo. Grazie!`;
}
