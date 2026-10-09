"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isISODate, todayISO } from "@/lib/dates";
import type { ActionState } from "@/components/form-bits";

export async function savePtSession(clientId: string, sessionId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const supabase = await createClient();
  const date = String(fd.get("session_date") ?? "") || todayISO();
  if (!isISODate(date)) return { error: "Data non valida." };
  const row = {
    session_date: date,
    notes: String(fd.get("notes") ?? "").trim(),
    counts_toward_package: fd.get("counts_toward_package") === "on",
  };
  const { error } = sessionId
    ? await supabase.from("pt_sessions").update(row).eq("id", sessionId).eq("client_id", clientId)
    : await supabase.from("pt_sessions").insert({ ...row, client_id: clientId, created_by: me.id });
  if (error) return { error: "Salvataggio non riuscito." };
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
  return { ok: true, message: sessionId ? "Sessione aggiornata." : "Sessione salvata." };
}

export async function deletePtSession(clientId: string, sessionId: string) {
  await requireStaff();
  const supabase = await createClient();
  await supabase.from("pt_sessions").delete().eq("id", sessionId).eq("client_id", clientId);
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
}
