"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCheckMode, setCheckMode } from "@/lib/check-mode";

/**
 * "Inizia il check" (o "Riprendi"): entra in modalità check su questo cliente,
 * anche sugli altri dispositivi. checkId undefined = riprendi quello in corso
 * su questo cliente (o un check nuovo).
 */
export async function startCheckMode(clientId: string, checkId?: string | null) {
  const me = await requireStaff();
  const supabase = await createClient();
  const { data: c } = await supabase.from("clients").select("first_name, last_name").eq("id", clientId).maybeSingle();
  if (!c) redirect("/staff/clienti");
  const current = await getCheckMode(supabase, me.id);
  const id = checkId === undefined ? (current?.clientId === clientId ? current.checkId : null) : checkId;
  // stesso cliente e stesso check: si riprende quello in corso
  const same = current && current.clientId === clientId && current.checkId === id;
  await setCheckMode(supabase, me.id, {
    clientId,
    checkId: id,
    clientName: `${c.first_name} ${c.last_name}`.trim(),
    startedAt: same ? current.startedAt : new Date().toISOString(),
    paused: false,
  });
  redirect(`/check/${clientId}`);
}

/**
 * "Chiudi per ora": esci dalla modalità senza perdere niente; la riprendi
 * quando vuoi (bottone "Riprendi" in basso). `next`: dove andare (es. il
 * pagamento guidato o l'editor del programma), solo pagine dello staff.
 */
export async function pauseCheckMode(next?: unknown) {
  const me = await requireStaff();
  const supabase = await createClient();
  const mode = await getCheckMode(supabase, me.id);
  if (mode) await setCheckMode(supabase, me.id, { ...mode, paused: true });
  const to = typeof next === "string" && next.startsWith("/staff/") ? next : null;
  redirect(to ?? (mode ? `/staff/clienti/${mode.clientId}` : "/staff"));
}

/** Check salvato: la modalità finisce su tutti i dispositivi. */
export async function endCheckMode(clientId: string, savedId: string | null) {
  const me = await requireStaff();
  const supabase = await createClient();
  await setCheckMode(supabase, me.id, null);
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
  redirect(savedId ? `/staff/clienti/${clientId}/check?salvato=${savedId}` : `/staff/clienti/${clientId}`);
}

/** "Annulla il check": via la modalità e quello che avevi scritto. */
export async function cancelCheckMode(clientId: string) {
  const me = await requireStaff();
  const supabase = await createClient();
  const mode = await getCheckMode(supabase, me.id);
  await supabase.from("drafts").delete().eq("user_id", me.id).eq("key", `check:${clientId}:${mode?.checkId ?? "nuovo"}`);
  await setCheckMode(supabase, me.id, null);
  redirect(`/staff/clienti/${clientId}`);
}
