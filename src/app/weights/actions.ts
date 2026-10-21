"use server";

/**
 * Peso giorno per giorno: lo scrive il cliente (per sé) o lo staff (per un
 * cliente che segue). I permessi veri sono nel database (weight_logs).
 */
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, isISODate, todayISO } from "@/lib/dates";
import { parseKg } from "@/lib/body/weights";

export type WeightResult = { ok: true } | { ok: false; error: string };

async function target(clientId: string | null | undefined): Promise<{ clientId: string; userId: string } | { error: string }> {
  const me = await requireUser();
  if (me.role === "client") {
    if (!me.clientId || me.clientStatus === "archived") return { error: "Il tuo percorso è chiuso: il peso non si può più segnare." };
    return { clientId: me.clientId, userId: me.id };
  }
  if ((me.role === "owner" || me.role === "coach") && clientId) return { clientId, userId: me.id };
  return { error: "Non puoi segnare il peso di questo cliente." };
}

function refresh(clientId: string) {
  revalidatePath("/cliente/progressi");
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
}

export async function saveWeight(input: { clientId?: string | null; date: string; kg: string }): Promise<WeightResult> {
  const t = await target(input.clientId);
  if ("error" in t) return { ok: false, error: t.error };
  const kg = parseKg(input.kg);
  if (kg === null) return { ok: false, error: "Scrivi il peso in chili, per esempio 64,5." };
  const today = todayISO();
  if (!isISODate(input.date) || input.date > today) return { ok: false, error: "Scegli una data di oggi o di un giorno passato." };
  if (input.date < addDays(today, -365 * 10)) return { ok: false, error: "La data è troppo indietro: controllala." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("weight_logs")
    .upsert({ client_id: t.clientId, log_date: input.date, kg, created_by: t.userId }, { onConflict: "client_id,log_date" });
  if (error) return { ok: false, error: "Non sono riuscito a salvare il peso. Riprova tra poco." };
  refresh(t.clientId);
  return { ok: true };
}

export async function deleteWeight(input: { clientId?: string | null; date: string }): Promise<WeightResult> {
  const t = await target(input.clientId);
  if ("error" in t) return { ok: false, error: t.error };
  if (!isISODate(input.date)) return { ok: false, error: "Data non valida." };
  const supabase = await createClient();
  const { error } = await supabase.from("weight_logs").delete().eq("client_id", t.clientId).eq("log_date", input.date);
  if (error) return { ok: false, error: "Non sono riuscito a togliere il peso. Riprova tra poco." };
  refresh(t.clientId);
  return { ok: true };
}
