"use server";

/**
 * "Nuovo pagamento" dalla pagina Pagamenti: un solo modulo per ogni caso.
 * - renew: rinnovo del piano attivo (periodo o sessioni del pacchetto)
 * - plan: nuovo abbonamento (mensile, trimestrale…): crea il piano e registra il primo periodo
 * - lessons: lezioni PT (pacchetto o singole): sessioni pagate a parte, o il pacchetto se è il suo piano
 * - other: pagamento libero (valutazione posturale, consulenza…)
 * Si può anche creare al volo un cliente nuovo (basta il nome).
 */
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatLong, isISODate } from "@/lib/dates";
import { formatEuro, isPeriodic, METHODS, PLAN_KINDS, type PlanKind } from "@/lib/billing";
import type { ActionState } from "@/components/form-bits";

export type NewPaymentState = (NonNullable<ActionState> & { clientId?: string; clientName?: string }) | null;

const money = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};
const count = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").trim());
  return Number.isInteger(n) && n > 0 ? n : NaN;
};

export async function registerPayment(_: NewPaymentState, fd: FormData): Promise<NewPaymentState> {
  const me = await requireOwner();
  const supabase = await createClient();
  const type = String(fd.get("type") ?? "");
  if (!["renew", "plan", "lessons", "other"].includes(type)) return { error: "Scegli cosa sta pagando." };
  const paidOn = String(fd.get("paid_on") ?? "");
  if (!isISODate(paidOn)) return { error: "Data del pagamento non valida." };
  const amount = money(fd.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Scrivi l'importo, per esempio 300." };
  const method = String(fd.get("method") ?? "transfer") as (typeof METHODS)[number];
  if (!METHODS.includes(method)) return { error: "Metodo non valido." };
  const notes = String(fd.get("notes") ?? "").trim().slice(0, 500);

  // cliente: esistente oppure nuovo al volo (basta il nome)
  let clientId = String(fd.get("client_id") ?? "");
  let clientName = "";
  if (clientId === "new") {
    const first = String(fd.get("new_first_name") ?? "").trim();
    const last = String(fd.get("new_last_name") ?? "").trim();
    if (!first) return { error: "Scrivi il nome del cliente nuovo." };
    if (type === "renew") return { error: "Un cliente nuovo non ha ancora un piano da rinnovare." };
    const { data, error } = await supabase.from("clients").insert({ first_name: first, last_name: last, sex: null, phase_weeks: null }).select("id").single();
    if (error || !data) return { error: "Non sono riuscito a creare il cliente. Riprova." };
    clientId = data.id;
    clientName = `${first} ${last}`.trim();
  } else {
    const { data: c } = await supabase.from("clients").select("first_name, last_name").eq("id", clientId).maybeSingle();
    if (!c) return { error: "Scegli il cliente." };
    clientName = `${c.first_name} ${c.last_name}`.trim();
  }

  const { data: plan } = await supabase.from("payment_plans").select("id, kind").eq("client_id", clientId).eq("active", true).maybeSingle();
  const base = { client_id: clientId, paid_on: paidOn, amount, method, notes, created_by: me.id };
  let message = "";

  const period = () => {
    const start = String(fd.get("period_start") ?? "");
    const end = String(fd.get("period_end") ?? "");
    if (!isISODate(start) || !isISODate(end)) return { error: "Indica da quando a quando vale il pagamento." } as const;
    if (end < start) return { error: "Il periodo finisce prima di iniziare." } as const;
    return { start, end } as const;
  };

  if (type === "renew") {
    if (!plan) return { error: "Il cliente non ha un piano da rinnovare: scegli \"Nuovo abbonamento\"." };
    const kind = plan.kind as PlanKind;
    if (isPeriodic(kind)) {
      const p = period();
      if ("error" in p) return { error: p.error };
      const { error } = await supabase.from("payments").insert({ ...base, plan_id: plan.id, period_start: p.start, period_end: p.end, sessions: null });
      if (error) return { error: "Salvataggio non riuscito." };
      message = `${formatEuro(amount)} registrati: ${clientName} è a posto fino al ${formatLong(p.end)}.`;
    } else {
      const s = kind === "single" ? 1 : count(fd.get("sessions"));
      if (Number.isNaN(s)) return { error: "Indica quante sessioni copre il pagamento." };
      const { error } = await supabase.from("payments").insert({ ...base, plan_id: plan.id, period_start: null, period_end: null, sessions: s });
      if (error) return { error: "Salvataggio non riuscito." };
      message = `${formatEuro(amount)} registrati: ${s} ${s === 1 ? "sessione" : "sessioni"} per ${clientName}.`;
    }
  } else if (type === "plan") {
    const kind = String(fd.get("kind") ?? "") as PlanKind;
    if (!PLAN_KINDS.includes(kind) || !isPeriodic(kind)) return { error: "Scegli la durata dell'abbonamento." };
    const p = period();
    if ("error" in p) return { error: p.error };
    // un solo piano attivo: quello di prima resta nello storico
    await supabase.from("payment_plans").update({ active: false }).eq("client_id", clientId).eq("active", true);
    const { data: created, error: planError } = await supabase
      .from("payment_plans")
      .insert({ client_id: clientId, kind, amount, method, start_date: p.start, package_sessions: null, notes: "" })
      .select("id")
      .single();
    if (planError || !created) return { error: "Non sono riuscito a creare l'abbonamento. Riprova." };
    const { error } = await supabase.from("payments").insert({ ...base, plan_id: created.id, period_start: p.start, period_end: p.end, sessions: null });
    if (error) return { error: "Abbonamento creato, ma il pagamento non è stato salvato: registralo dalla scheda del cliente." };
    message = `Abbonamento creato e ${formatEuro(amount)} registrati: ${clientName} è a posto fino al ${formatLong(p.end)}.`;
  } else if (type === "lessons") {
    const s = count(fd.get("sessions"));
    if (Number.isNaN(s)) return { error: "Indica quante lezioni sta pagando." };
    // se il suo piano è un pacchetto di sessioni, le lezioni vanno lì; altrimenti sono "a parte"
    const onPlan = plan && plan.kind === "package";
    const { error } = await supabase.from("payments").insert({
      ...base,
      plan_id: onPlan ? plan.id : null,
      period_start: null,
      period_end: null,
      sessions: s,
      notes: notes || (s === 1 ? "Lezione PT" : `Pacchetto ${s} lezioni PT`),
    });
    if (error) return { error: "Salvataggio non riuscito." };
    message = `${formatEuro(amount)} registrati: ${s} ${s === 1 ? "lezione" : "lezioni"} PT per ${clientName}. Le lezioni si scalano quando segni le sessioni PT.`;
  } else {
    if (!notes) return { error: "Scrivi per cosa è il pagamento, per esempio \"Valutazione posturale\"." };
    const { error } = await supabase.from("payments").insert({ ...base, plan_id: null, period_start: null, period_end: null, sessions: null });
    if (error) return { error: "Salvataggio non riuscito." };
    message = `${formatEuro(amount)} registrati per ${clientName}: ${notes}.`;
  }

  // chi era in pausa e rinnova torna attivo (se l'hai lasciato spuntato)
  if (fd.get("reactivate") === "on") {
    await supabase.from("clients").update({ status: "active" }).eq("id", clientId).eq("status", "paused");
  }

  revalidatePath("/staff/pagamenti");
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
  revalidatePath("/staff", "layout");
  return { ok: true, message, clientId, clientName };
}
