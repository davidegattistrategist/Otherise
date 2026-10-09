"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatLong, isISODate, todayISO } from "@/lib/dates";
import { billingStatus, formatEuro, isPeriodic, METHODS, PLAN_KINDS, type BillingRow, type PlanKind } from "@/lib/billing";
import { notify } from "@/lib/notify";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site";
import type { ActionState } from "@/components/form-bits";

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
  if (planId) {
    const { error } = await supabase.from("payment_plans").update(row).eq("id", planId).eq("client_id", clientId);
    if (error) return { error: "Salvataggio non riuscito." };
  } else {
    // Un solo piano attivo per cliente: il precedente resta nello storico
    await supabase.from("payment_plans").update({ active: false }).eq("client_id", clientId).eq("active", true);
    const { error } = await supabase.from("payment_plans").insert({ ...row, client_id: clientId });
    if (error) return { error: "Salvataggio non riuscito." };
  }
  revalidate(clientId);
  return { ok: true, message: "Piano salvato." };
}

export async function recordPayment(clientId: string, planId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireOwner();
  const supabase = await createClient();
  const { data: plan } = await supabase.from("payment_plans").select("kind").eq("id", planId).eq("client_id", clientId).maybeSingle();
  if (!plan) return { error: "Piano non trovato." };
  const kind = plan.kind as PlanKind;
  const paidOn = String(fd.get("paid_on") ?? "");
  if (!isISODate(paidOn)) return { error: "Data del pagamento non valida." };
  const amount = money(fd.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Importo non valido." };
  const method = String(fd.get("method") ?? "transfer");
  if (!(METHODS as readonly string[]).includes(method)) return { error: "Metodo non valido." };
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
    created_by: me.id,
  });
  if (error) return { error: "Salvataggio non riuscito." };
  revalidate(clientId);
  return { ok: true, message: `Pagamento di ${formatEuro(amount)} registrato.` };
}

export async function deletePayment(clientId: string, paymentId: string) {
  await requireOwner();
  const supabase = await createClient();
  await supabase.from("payments").delete().eq("id", paymentId).eq("client_id", clientId);
  revalidate(clientId);
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
  const what =
    status.sessionsLeft !== null
      ? status.sessionsLeft <= 0 ? "il tuo pacchetto di sessioni è terminato" : `ti restano ${status.sessionsLeft} sessioni nel pacchetto`
      : status.dueDate
        ? status.daysLeft !== null && status.daysLeft < 0 ? `il periodo saldato è terminato il ${formatLong(status.dueDate)}` : `il periodo saldato termina il ${formatLong(status.dueDate)}`
        : "c'è un pagamento da saldare";
  const body = `Ciao ${client.first_name}, ti ricordiamo che ${what}. Quando vuoi, rinnova con le solite modalità. Grazie!`;
  if (!client.user_id && !client.email) return { error: "Il cliente non ha né account né email." };
  if (client.user_id) {
    await notify([{ recipient_id: client.user_id, client_id: clientId, kind: "payment_reminder", title: "Promemoria rinnovo", body, link: "/cliente/profilo", dedupe_key: `payrem:${clientId}:${todayISO()}` }]);
  }
  let emailed = false;
  if (client.email) {
    emailed = await sendEmail(client.email, `${business} · promemoria rinnovo`, `${body}\n\n${client.user_id ? `${await siteUrl()}/cliente/profilo` : ""}`.trim());
  }
  if (client.user_id && emailed) {
    // l'email è già partita: evitiamo che il giro automatico la rimandi
    const { createAdminClient } = await import("@/lib/supabase/admin");
    await createAdminClient().from("notifications").update({ emailed_at: new Date().toISOString() }).eq("recipient_id", client.user_id).eq("dedupe_key", `payrem:${clientId}:${todayISO()}`);
  }
  if (!client.user_id && !emailed) return { error: "Il cliente non ha ancora l'app e l'invio delle email non è configurato: scrivigli su WhatsApp." };
  return { ok: true, message: emailed ? (client.user_id ? "Promemoria inviato nell'app e per email." : "Promemoria inviato per email.") : "Promemoria inviato nell'app (invio email non configurato)." };
}
