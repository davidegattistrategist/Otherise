"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/components/form-bits";

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
  const { error } = await supabase
    .from("app_settings")
    .update({ business_name: business, reminder_days: reminder, ai_monthly_budget_eur: budget, payment_message: paymentMessage, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) return { error: "Salvataggio non riuscito." };
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
