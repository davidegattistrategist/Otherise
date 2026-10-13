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

/**
 * Sessione PT registrata insieme all'allenamento del programma (logbook dello
 * staff): una sola per allenamento (`source`), si aggiorna se lo risalvi.
 * Se non era una sessione PT, quella legata all'allenamento si toglie.
 */
export async function savePtFromWorkout(
  clientId: string,
  input: { source: string; date: string; notes: string; countsTowardPackage: boolean; isPt: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireStaff();
  const supabase = await createClient();
  if (!/^[0-9a-f-]{36}:\d{1,2}:[\w-]{1,40}$/.test(input.source)) return { ok: false, error: "Allenamento non valido." };
  if (!input.isPt) {
    await supabase.from("pt_sessions").delete().eq("client_id", clientId).eq("source", input.source);
  } else {
    const date = isISODate(input.date) ? input.date : todayISO();
    const { error } = await supabase.from("pt_sessions").upsert(
      { client_id: clientId, source: input.source, session_date: date, notes: input.notes.trim().slice(0, 4000), counts_toward_package: input.countsTowardPackage, created_by: me.id },
      { onConflict: "client_id,source" },
    );
    if (error) return { ok: false, error: "Sessione PT non salvata: riprova." };
  }
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
  return { ok: true };
}
