"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseProfileForm } from "@/lib/ai-profile";
import { saveAiProfile } from "@/lib/data/ai-profile";
import type { ActionState } from "@/components/form-bits";

/** Salva le indicazioni per l'AI scritte dal trainer (toglie la nota automatica). */
export async function saveAiProfileAction(clientId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireStaff();
  const supabase = await createClient();
  const { error } = await saveAiProfile(supabase, clientId, { ...parseProfileForm(fd), auto_note: "" });
  if (error) return { error: "Salvataggio non riuscito. Riprova." };
  revalidatePath(`/staff/clienti/${clientId}/programma`);
  return { ok: true, message: "Indicazioni salvate: l'AI le usa dalla prossima bozza." };
}
