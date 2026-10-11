"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PRIVACY_VERSION } from "@/lib/privacy";

/** Consenso raccolto su carta (es. al primo incontro, prima che il cliente entri nell'app). */
export async function recordPaperConsent(clientId: string) {
  await requireStaff();
  const supabase = await createClient();
  const now = new Date().toISOString();
  await supabase
    .from("clients")
    .update({ privacy_accepted_at: now, privacy_version: PRIVACY_VERSION, health_consent_at: now, consent_source: "paper" })
    .eq("id", clientId);
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
}

/** Permesso per Instagram dato (o tolto) su carta o a voce: lo segna lo staff. */
export async function setInstagramFromStaff(clientId: string, consent: boolean) {
  await requireStaff();
  const supabase = await createClient();
  await supabase.from("clients").update({ instagram_consent_at: consent ? new Date().toISOString() : null }).eq("id", clientId);
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
}
