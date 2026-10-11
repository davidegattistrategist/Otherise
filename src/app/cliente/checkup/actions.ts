"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { requireActiveClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import { CHECKIN_QUESTIONS, checkinWeekFor } from "@/lib/checkin";
import { deliverPendingEmails } from "@/lib/email";
import { generateCheckinDraft } from "@/lib/ai/reply";
import type { ActionState } from "@/components/form-bits";

export async function submitCheckin(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireActiveClient();
  const week = checkinWeekFor(todayISO());
  if (!week) return { error: "Il check-up si compila da venerdì a domenica." };
  const scores: Record<string, number> = {};
  for (const q of CHECKIN_QUESTIONS) {
    const v = Number(fd.get(q.key));
    if (!Number.isInteger(v) || v < 1 || v > 5) return { error: `Rispondi a: “${q.label}”` };
    scores[q.key] = v;
  }
  const row = {
    training: scores.training,
    sleep: scores.sleep,
    stress: scores.stress,
    adherence: scores.adherence,
    issues: String(fd.get("issues") ?? "").trim().slice(0, 2000),
    request: String(fd.get("request") ?? "").trim().slice(0, 2000),
  };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("checkins").select("id").eq("client_id", me.clientId).eq("week_start", week).maybeSingle();
  const { data: saved, error } = existing
    ? await supabase.from("checkins").update(row).eq("id", existing.id).select("id").single()
    : await supabase.from("checkins").insert({ ...row, client_id: me.clientId, week_start: week }).select("id").single();
  if (error || !saved) return { error: "Invio non riuscito, riprova." };
  // C'è una richiesta per il coach: l'assistente gli prepara una bozza di risposta
  if (row.request) after(() => generateCheckinDraft(saved.id).catch(() => undefined));
  // Se qualcosa non va il database ha già creato l'avviso per lo staff: lo mandiamo anche per email
  await deliverPendingEmails();
  revalidatePath("/cliente", "layout");
  redirect("/cliente/checkup?inviato=1");
}
