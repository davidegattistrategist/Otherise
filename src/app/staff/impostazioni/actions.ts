"use server";

import { revalidatePath } from "next/cache";
import { invalidateSettings } from "@/lib/data/cached";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/components/form-bits";
import { changedFields, changedOnly } from "@/lib/changed-only";

export async function saveSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOwner();
  const supabase = await createClient();
  const business = String(fd.get("business_name") ?? "").trim();
  const reminder = Number(fd.get("reminder_days"));
  const budget = Number(String(fd.get("ai_monthly_budget_eur") ?? "").replace(",", "."));
  const paymentMessage = String(fd.get("payment_message") ?? "").trim().slice(0, 1000);
  if (!business) return { error: "Scrivi il nome dell'attività." };
  if (!Number.isInteger(reminder) || reminder < 1 || reminder > 30) return { error: "I giorni di preavviso vanno da 1 a 30." };
  if (!Number.isFinite(budget) || budget < 0 || budget > 1000) return { error: "Tetto di spesa AI non valido." };
  const patch = changedOnly(fd, { business_name: business, reminder_days: reminder, ai_monthly_budget_eur: budget, payment_message: paymentMessage });
  if (Object.keys(patch).length) {
    const { error } = await supabase.from("app_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) return { error: "Salvataggio non riuscito." };
  }
  invalidateSettings();
  revalidatePath("/", "layout");
  return { ok: true, message: "Impostazioni salvate." };
}

export async function saveMethod(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOwner();
  const supabase = await createClient();
  const method = String(fd.get("coaching_method") ?? "");
  if (method.length > 40000) return { error: "Il testo è troppo lungo (massimo 40.000 caratteri)." };
  const { error } = await supabase.from("app_settings").update({ coaching_method: method, updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) return { error: "Salvataggio non riuscito." };
  revalidatePath("/staff/impostazioni");
  return { ok: true, message: "Metodo salvato: l'assistente AI lo userà da subito." };
}

export async function savePrivacy(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOwner();
  const supabase = await createClient();
  const v = (k: string) => String(fd.get(k) ?? "").trim().slice(0, 300);
  const email = v("privacy_email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "L'email per la privacy non sembra valida." };
  const patch = changedOnly(fd, { legal_name: v("legal_name"), legal_address: v("legal_address"), legal_tax_id: v("legal_tax_id"), privacy_email: email, privacy_pec: v("privacy_pec") });
  const { error } = Object.keys(patch).length ? await supabase.from("app_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", 1) : { error: null };
  if (error) return { error: "Salvataggio non riuscito." };
  revalidatePath("/privacy");
  return { ok: true, message: "Dati per l'informativa salvati." };
}

export async function saveReplyLessons(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOwner();
  const supabase = await createClient();
  const lessons = String(fd.get("ai_reply_lessons") ?? "")
    .split("\n")
    .map((l) => l.trim().replace(/^[-•]\s*/, ""))
    .filter(Boolean)
    .slice(0, 30)
    .map((l) => `- ${l.slice(0, 240)}`)
    .join("\n");
  // salvataggio live: si scrive solo se le hai cambiate QUI (l'AI le aggiorna da sola in background)
  const changed = changedFields(fd);
  if (changed && !changed.has("ai_reply_lessons")) return { ok: true };
  const { error } = await supabase.from("app_settings").update({ ai_reply_lessons: lessons, ai_reply_lessons_updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) return { error: "Salvataggio non riuscito." };
  revalidatePath("/staff/impostazioni");
  return { ok: true, message: "Salvato: vale dalla prossima bozza di risposta." };
}

export async function saveLessons(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOwner();
  const supabase = await createClient();
  const lessons = String(fd.get("ai_lessons") ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.startsWith("- ") ? l : `- ${l.replace(/^[-•]\s*/, "")}`))
    .slice(0, 40)
    .join("\n");
  if (lessons.length > 12000) return { error: "Troppo lungo: tieni le lezioni brevi." };
  const changed = changedFields(fd);
  if (changed && !changed.has("ai_lessons")) return { ok: true };
  const { error } = await supabase.from("app_settings").update({ ai_lessons: lessons, ai_lessons_updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) return { error: "Salvataggio non riuscito." };
  revalidatePath("/staff/impostazioni");
  return { ok: true, message: "Lezioni salvate: valgono dalla prossima bozza." };
}

export async function saveEmailPrefs(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOwner();
  const supabase = await createClient();
  const patch = changedOnly(fd, { staff_emails: fd.get("staff_emails") === "on", client_emails: fd.get("client_emails") === "on" });
  const { error } = Object.keys(patch).length ? await supabase.from("app_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", 1) : { error: null };
  if (error) return { error: "Salvataggio non riuscito. Se è appena arrivato un aggiornamento, esegui su Supabase il file SQL nuovo (20261012200000_email_avvisi.sql)." };
  revalidatePath("/staff/impostazioni");
  return { ok: true, message: "Preferenze salvate." };
}
