"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseProfileForm } from "@/lib/ai-profile";
import { saveAiProfile } from "@/lib/data/ai-profile";
import type { ActionState } from "@/components/form-bits";
import { changedFields, changedOnly } from "@/lib/changed-only";

/** Salva le indicazioni per l'AI scritte dal trainer (toglie la nota automatica). */
export async function saveAiProfileAction(clientId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireStaff();
  const supabase = await createClient();
  const full = parseProfileForm(fd);
  // salvataggio live: solo quello cambiato qui (squat_share dipende da due campi, la
  // limitazione da due); auto_note si toglie solo se hai scritto le indicazioni
  const changed = changedFields(fd);
  const patch = changedOnly(fd, full as Record<string, unknown>, { squat_share: "squat_share" }) as Partial<typeof full>;
  if (changed?.has("squat_auto")) patch.squat_share = full.squat_share;
  if (changed?.has("limitation") || changed?.has("limitation_until")) {
    patch.limitation = full.limitation;
    patch.limitation_until = full.limitation_until;
  }
  if (!changed || changed.size) {
    const { error } = await saveAiProfile(supabase, clientId, { ...patch, ...(!changed || changed.has("notes") ? { auto_note: "" } : {}) });
    if (error) return { error: "Salvataggio non riuscito. Riprova." };
  }
  revalidatePath(`/staff/clienti/${clientId}/programma`);
  return { ok: true, message: "Indicazioni salvate: l'AI le usa dalla prossima bozza." };
}
