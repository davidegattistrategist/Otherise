"use server";

import { draftTombstone } from "@/lib/draft-merge";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "node:crypto";
import { getCheckMode, setCheckMode } from "@/lib/check-mode";
import { createAdminClient } from "@/lib/supabase/admin";
import { CHECK_PHOTOS_BUCKET } from "@/lib/check-photos";
import type { PendingPhoto } from "@/lib/check-photos-shared";

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
    newId: id ? undefined : same && current.newId ? current.newId : randomUUID(),
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
  // si apre il check appena salvato, con le foto in cima
  redirect(savedId ? `/staff/clienti/${clientId}/check/${savedId}?salvato=1` : `/staff/clienti/${clientId}`);
}

/** "Annulla il check": via la modalità e quello che avevi scritto. */
export async function cancelCheckMode(clientId: string) {
  const me = await requireStaff();
  const supabase = await createClient();
  const mode = await getCheckMode(supabase, me.id);
  const key = `check:${clientId}:${mode?.checkId ?? "nuovo"}`;
  // le foto caricate in questo check e non ancora registrate: via anche i file
  const { data: draft } = await supabase.from("drafts").select("data").eq("user_id", me.id).eq("key", key).maybeSingle();
  // nella bozza le foto sono per percorso (oggetto); le versioni vecchie le avevano in un elenco
  const raw = (draft?.data as { photos?: PendingPhoto[] | Record<string, PendingPhoto> } | null)?.photos ?? [];
  const pending = (Array.isArray(raw) ? raw : Object.values(raw)).filter((p) => p && typeof p.path === "string" && p.path.startsWith(`${clientId}/`) && typeof p.thumbPath === "string" && p.thumbPath.startsWith(`${clientId}/`));
  if (pending.length) {
    const { data: registered } = await supabase.from("check_photos").select("path").in("path", pending.map((p) => p.path));
    const keep = new Set((registered ?? []).map((r) => r.path));
    const remove = pending.filter((p) => !keep.has(p.path)).flatMap((p) => [p.path, p.thumbPath]);
    if (remove.length) await createAdminClient().storage.from(CHECK_PHOTOS_BUCKET).remove(remove);
  }
  await supabase.from("drafts").upsert({ user_id: me.id, key, data: draftTombstone(Date.now()), updated_at: new Date().toISOString() });
  await setCheckMode(supabase, me.id, null);
  redirect(`/staff/clienti/${clientId}`);
}
