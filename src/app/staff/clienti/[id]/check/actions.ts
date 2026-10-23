"use server";

import { deletedAt, draftTombstone } from "@/lib/draft-merge";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ageOn, isISODate, todayISO } from "@/lib/dates";
import { CIRCUMFERENCES, SKINFOLD_SITES, formulaById, type SkinfoldReadings } from "@/lib/body/skinfolds";
import { recomputeClientChecks } from "@/lib/data/checks";
import { estimateOneRepMax } from "@/lib/strength/e1rm";
import type { CheckState } from "./check-form";
import type { Json } from "@/lib/supabase/database.types";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { CHECK_PHOTOS_BUCKET } from "@/lib/check-photos";
import { MAX_PHOTOS_PER_UPLOAD } from "@/lib/check-photos-shared";
import { getCheckMode } from "@/lib/check-mode";
import type { ServerSupabase } from "@/lib/supabase/server";

/** Check nuovo in modalità check: l'id è già deciso e le foto si caricano prima di salvarlo. */
async function isPendingCheck(supabase: ServerSupabase, userId: string, clientId: string, checkId: string) {
  const mode = await getCheckMode(supabase, userId);
  return Boolean(mode && mode.clientId === clientId && !mode.checkId && mode.newId === checkId);
}

const photoId = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 16);

const num = (v: FormDataEntryValue | null): number | null => {
  if (v === null) return null;
  const s = String(v).trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Sesso del cliente, se alla creazione era rimasto da decidere (serve per le pliche). */
export async function setClientSex(clientId: string, sex: "M" | "F") {
  await requireStaff();
  const supabase = await createClient();
  await supabase.from("clients").update({ sex }).eq("id", clientId);
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
}

export async function saveCheck(clientId: string, checkId: string | null, _: CheckState, fd: FormData): Promise<CheckState> {
  const me = await requireStaff();
  const supabase = await createClient();
  const { data: client } = await supabase.from("clients").select("sex, birth_date").eq("id", clientId).maybeSingle();
  if (!client) return { error: "Cliente non trovato." };
  if (!client.sex) return { error: "Prima indica se è uomo o donna (serve per le pliche)." };

  const date = String(fd.get("check_date") ?? "");
  if (date && !isISODate(date)) return { error: "Data del check non valida." };
  const weight = num(fd.get("weight_kg"));
  if (weight !== null && (weight < 25 || weight > 300)) return { error: "Il peso sembra sbagliato." };

  const skinfolds: SkinfoldReadings = {};
  for (const s of SKINFOLD_SITES) {
    const vals = [0, 1, 2].map((i) => num(fd.get(`sf_${s.key}_${i}`)));
    if (vals.some((v) => v !== null && (v <= 0 || v > 80))) return { error: `Valore della plica ${s.label.toLowerCase()} fuori scala (mm).` };
    if (vals.some((v) => v !== null)) skinfolds[s.key] = vals;
  }
  const circumferences: Record<string, number> = {};
  for (const c of CIRCUMFERENCES) {
    const v = num(fd.get(`circ_${c.key}`));
    if (v !== null) circumferences[c.key] = v;
  }
  const tests: Array<{ exercise: string; load: number | null; reps: number | null; rpe: number | null; e1rm: number | null }> = [];
  for (let i = 0; i < 10; i++) {
    const exercise = String(fd.get(`test_${i}_exercise`) ?? "").trim();
    if (!exercise) continue;
    const load = num(fd.get(`test_${i}_load`));
    const reps = num(fd.get(`test_${i}_reps`));
    const rpe = num(fd.get(`test_${i}_rpe`));
    // senza RPE vale 10 (serie al limite), come dice il modulo
    tests.push({ exercise, load, reps, rpe: load && reps ? rpe ?? 10 : rpe, e1rm: load && reps ? estimateOneRepMax(load, reps, rpe ?? 10) : null });
  }

  // la bozza del modulo sul server (in modalità check è l'ultima versione scritta su
  // qualsiasi dispositivo): un testo che lì c'è non va mai perso perché da questo
  // dispositivo è partito vuoto (es. telefono ripreso in mano e salvato subito)
  const draftKey = String(fd.get("draft_key") ?? "");
  const ownDraft = draftKey.startsWith(`check:${clientId}:`);
  const [{ data: draftRow }, mode] = await Promise.all([
    ownDraft ? supabase.from("drafts").select("data").eq("user_id", me.id).eq("key", draftKey).maybeSingle() : Promise.resolve({ data: null }),
    getCheckMode(supabase, me.id),
  ]);
  const draft = draftRow && deletedAt(draftRow.data) === null ? (draftRow.data as { notes_next_phase?: unknown; tests_text?: unknown }) : null;
  // solo in modalità check su questo stesso check (lì la bozza è la versione comune ai dispositivi)
  const liveDraft = Boolean(mode && mode.clientId === clientId && (mode.checkId ?? null) === (checkId ?? null));
  const fromDraft = (field: "notes_next_phase" | "tests_text") => {
    const sent = String(fd.get(field) ?? "").trim();
    const kept = liveDraft && typeof draft?.[field] === "string" ? (draft[field] as string).trim() : "";
    return sent || kept;
  };

  const age = ageOn(client.birth_date, date || todayISO());
  const row = {
    client_id: clientId,
    check_date: date || null,
    weight_kg: weight,
    age_years: age,
    sex: client.sex,
    skinfolds: skinfolds as unknown as NonNullable<Json>,
    circumferences: circumferences as unknown as NonNullable<Json>,
    strength_tests: tests as unknown as NonNullable<Json>,
    tests_text: fromDraft("tests_text"),
    notes_next_phase: fromDraft("notes_next_phase"),
    visible_to_client: fd.get("visible_to_client") === "on",
  };
  // modalità check: il check nuovo prende l'id già deciso (le foto sono già nella sua cartella)
  const newId = String(fd.get("new_id") ?? "");
  const presetId = !checkId && /^[0-9a-f-]{36}$/i.test(newId) && (await isPendingCheck(supabase, me.id, clientId, newId)) ? newId : null;
  // il check nuovo della modalità check è già stato salvato (secondo tocco, o un
  // salvataggio riuscito di cui il telefono non ha avuto risposta): si aggiorna quello
  const { data: already } = presetId ? await supabase.from("checks").select("id").eq("id", presetId).eq("client_id", clientId).maybeSingle() : { data: null };
  const updateId = checkId ?? already?.id ?? null;
  let { data: saved, error } = updateId
    ? await supabase.from("checks").update(row).eq("id", updateId).eq("client_id", clientId).select("id").maybeSingle()
    : // l'autore è chi lo crea (chi lo corregge dopo non ne diventa l'autore)
      await supabase.from("checks").insert({ ...row, created_by: me.id, id: presetId ?? undefined }).select("id").single();
  if (error?.code === "23505" && presetId) {
    // salvato nel frattempo da un'altra richiesta: si aggiorna
    ({ data: saved, error } = await supabase.from("checks").update(row).eq("id", presetId).eq("client_id", clientId).select("id").maybeSingle());
  }
  if (error || !saved) return { error: "Non sono riuscito a salvare il check. Controlla la connessione e tocca di nuovo: quello che hai scritto resta qui." };
  // foto caricate durante la modalità check: ora si registrano nel check
  const pendingRaw = String(fd.get("pending_photos") ?? "");
  if (pendingRaw) {
    let list: unknown = null;
    try {
      list = JSON.parse(pendingRaw);
    } catch {
      list = null;
    }
    const parsed = photosSchema.safeParse(list);
    const prefix = `${clientId}/${saved.id}/`;
    if (parsed.success) {
      const { data: already } = await supabase.from("check_photos").select("path, sort_order").eq("check_id", saved.id);
      const known = new Set((already ?? []).map((p) => p.path));
      const start = Math.max(-1, ...(already ?? []).map((p) => p.sort_order)) + 1;
      const fresh = parsed.data.filter((p) => p.path.startsWith(prefix) && p.thumbPath.startsWith(prefix) && !p.path.includes("..") && !known.has(p.path));
      if (fresh.length) {
        await supabase.from("check_photos").insert(
          fresh.map((p, i) => ({ check_id: saved.id, client_id: clientId, path: p.path, thumb_path: p.thumbPath, width: p.width, height: p.height, size_bytes: p.size, sort_order: start + i })),
        );
        revalidatePath("/cliente/progressi");
      }
    }
  }
  // % di grasso e masse con la formula di riferimento del cliente (può
  // cambiare per tutti i check se questo aggiunge o toglie una plica)
  await recomputeClientChecks(supabase, clientId);
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
  // la bozza del modulo non serve più (anche sull'altro dispositivo). Prima se ne
  // tiene una copia legata al check salvato: se un giorno manca qualcosa, si recupera
  // (le bozze vecchie si cancellano da sole dopo 60 giorni)
  if (ownDraft) {
    if (draft) await supabase.from("drafts").upsert({ user_id: me.id, key: `check-salvato:${clientId}:${saved.id}`, data: draft as unknown as Json, updated_at: new Date().toISOString() });
    await supabase.from("drafts").upsert({ user_id: me.id, key: draftKey, data: draftTombstone(Date.now()), updated_at: new Date().toISOString() });
  }
  // il browser cancella la bozza e poi: carica le foto scelte nel modulo,
  // oppure va alla pagina dei check che propone subito le foto di questo check
  return { ok: true, message: "Check salvato.", checkId: saved.id, redirectTo: `/staff/clienti/${clientId}/check/${saved.id}?salvato=1` };
}

export async function deleteCheck(clientId: string, checkId: string) {
  await requireStaff();
  const supabase = await createClient();
  // le foto spariscono con il check (anche i file)
  const { data: photos } = await supabase.from("check_photos").select("path, thumb_path").eq("check_id", checkId).eq("client_id", clientId);
  if (photos?.length) await createAdminClient().storage.from(CHECK_PHOTOS_BUCKET).remove(photos.flatMap((p) => [p.path, p.thumb_path]));
  await supabase.from("checks").delete().eq("id", checkId).eq("client_id", clientId);
  await recomputeClientChecks(supabase, clientId);
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
  redirect(`/staff/clienti/${clientId}/check`);
}

/**
 * Formula delle pliche di riferimento del cliente ("" = automatica). Ricalcola
 * la % di tutti i check. Usata anche dal pulsante "Passa alla formula …".
 */
export async function setSkinfoldFormula(clientId: string, fd: FormData) {
  await requireStaff();
  const supabase = await createClient();
  const raw = String(fd.get("formula") ?? "");
  const f = raw ? formulaById(raw) : null;
  const { data: client } = await supabase.from("clients").select("sex").eq("id", clientId).maybeSingle();
  if (!client || (raw && (!f || f.sex !== client.sex))) redirect(`/staff/clienti/${clientId}/check`);
  await supabase.from("clients").update({ skinfold_formula: f?.id ?? null }).eq("id", clientId);
  await recomputeClientChecks(supabase, clientId);
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
  redirect(`/staff/clienti/${clientId}/check?formula-salvata=1`);
}

// ---------------------------------------------------------------------
// Foto del check: il browser riduce le foto (senza i dati che le appesantiscono),
// chiede i link di caricamento, le carica direttamente nello storage e poi le
// registra nel check.
// ---------------------------------------------------------------------

export type PhotoTicket = { path: string; thumbPath: string; url: string; thumbUrl: string };

/** Il check esiste (e puoi seguire il cliente) oppure è il check nuovo della tua modalità check. */
async function canUseCheckFolder(supabase: ServerSupabase, userId: string, clientId: string, checkId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(checkId)) return false;
  const { data: check } = await supabase.from("checks").select("id").eq("id", checkId).eq("client_id", clientId).maybeSingle();
  if (check) return true;
  const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).maybeSingle();
  return Boolean(client) && (await isPendingCheck(supabase, userId, clientId, checkId));
}

export async function preparePhotoUploads(clientId: string, checkId: string, count: number): Promise<{ tickets: PhotoTicket[] } | { error: string }> {
  const me = await requireStaff();
  if (!Number.isInteger(count) || count < 1) return { error: "Scegli almeno una foto." };
  if (count > MAX_PHOTOS_PER_UPLOAD) return { error: `Al massimo ${MAX_PHOTOS_PER_UPLOAD} foto per volta.` };
  const supabase = await createClient();
  // il check deve esistere ed essere di un cliente che puoi seguire (permessi del database),
  // oppure essere il check nuovo della modalità check
  if (!(await canUseCheckFolder(supabase, me.id, clientId, checkId))) return { error: "Check non trovato." };
  const storage = createAdminClient().storage.from(CHECK_PHOTOS_BUCKET);
  const tickets: PhotoTicket[] = [];
  for (let i = 0; i < count; i++) {
    const base = `${clientId}/${checkId}/${photoId()}`;
    const [full, thumb] = await Promise.all([storage.createSignedUploadUrl(`${base}.jpg`), storage.createSignedUploadUrl(`${base}-t.jpg`)]);
    if (full.error || !full.data || thumb.error || !thumb.data) return { error: "Caricamento non disponibile in questo momento. Riprova tra poco." };
    tickets.push({ path: `${base}.jpg`, thumbPath: `${base}-t.jpg`, url: full.data.signedUrl, thumbUrl: thumb.data.signedUrl });
  }
  return { tickets };
}

const photosSchema = z
  .array(
    z.object({
      path: z.string().max(200),
      thumbPath: z.string().max(200),
      width: z.number().int().positive().max(20000).nullable(),
      height: z.number().int().positive().max(20000).nullable(),
      size: z.number().int().nonnegative(),
    }),
  )
  .min(1)
  .max(MAX_PHOTOS_PER_UPLOAD);

export async function saveCheckPhotos(clientId: string, checkId: string, input: unknown): Promise<{ ok: true } | { error: string }> {
  await requireStaff();
  const parsed = photosSchema.safeParse(input);
  if (!parsed.success) return { error: "Foto non valide." };
  const prefix = `${clientId}/${checkId}/`;
  if (parsed.data.some((p) => !p.path.startsWith(prefix) || !p.thumbPath.startsWith(prefix) || p.path.includes(".."))) return { error: "Foto non valide." };
  const supabase = await createClient();
  const { data: last } = await supabase.from("check_photos").select("sort_order").eq("check_id", checkId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const start = (last?.sort_order ?? -1) + 1;
  const { error } = await supabase.from("check_photos").insert(
    parsed.data.map((p, i) => ({ check_id: checkId, client_id: clientId, path: p.path, thumb_path: p.thumbPath, width: p.width, height: p.height, size_bytes: p.size, sort_order: start + i })),
  );
  if (error) return { error: "Non sono riuscito a salvare le foto. Riprova." };
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
  revalidatePath("/cliente/progressi");
  return { ok: true };
}

export async function deleteCheckPhoto(clientId: string, photoId: string): Promise<{ ok: boolean }> {
  await requireStaff();
  const supabase = await createClient();
  const { data: photo } = await supabase.from("check_photos").select("id, path, thumb_path").eq("id", photoId).eq("client_id", clientId).maybeSingle();
  if (!photo) return { ok: false };
  const { error } = await supabase.from("check_photos").delete().eq("id", photo.id);
  if (error) return { ok: false };
  await createAdminClient().storage.from(CHECK_PHOTOS_BUCKET).remove([photo.path, photo.thumb_path]);
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
  revalidatePath("/cliente/progressi");
  return { ok: true };
}

/** Link per vedere le foto della modalità check non ancora registrate (anche dall'altro dispositivo). */
export async function pendingPhotoLinks(clientId: string, checkId: string, paths: string[]): Promise<Record<string, string>> {
  const me = await requireStaff();
  const prefix = `${clientId}/${checkId}/`;
  const list = (Array.isArray(paths) ? paths : []).filter((p) => typeof p === "string" && p.startsWith(prefix) && !p.includes("..")).slice(0, 80);
  if (!list.length) return {};
  const supabase = await createClient();
  if (!(await canUseCheckFolder(supabase, me.id, clientId, checkId))) return {};
  const { data } = await createAdminClient().storage.from(CHECK_PHOTOS_BUCKET).createSignedUrls(list, 60 * 60 * 6);
  return Object.fromEntries((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])));
}

/** Togli una foto della modalità check non ancora registrata. */
export async function removePendingPhoto(clientId: string, checkId: string, path: string, thumbPath: string): Promise<{ ok: boolean }> {
  const me = await requireStaff();
  const prefix = `${clientId}/${checkId}/`;
  if (![path, thumbPath].every((p) => typeof p === "string" && p.startsWith(prefix) && !p.includes(".."))) return { ok: false };
  const supabase = await createClient();
  if (!(await canUseCheckFolder(supabase, me.id, clientId, checkId))) return { ok: false };
  // una foto già registrata si toglie dal check, non da qui
  const { data: registered } = await supabase.from("check_photos").select("id").eq("path", path).maybeSingle();
  if (registered) return { ok: false };
  await createAdminClient().storage.from(CHECK_PHOTOS_BUCKET).remove([path, thumbPath]);
  return { ok: true };
}
