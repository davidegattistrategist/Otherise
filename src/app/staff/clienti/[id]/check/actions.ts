"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ageOn, isISODate, todayISO } from "@/lib/dates";
import { CIRCUMFERENCES, SKINFOLD_SITES, formulaById, type SkinfoldReadings } from "@/lib/body/skinfolds";
import { recomputeClientChecks } from "@/lib/data/checks";
import { estimateOneRepMax } from "@/lib/strength/e1rm";
import type { ActionState } from "@/components/form-bits";
import type { Json } from "@/lib/supabase/database.types";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { CHECK_PHOTOS_BUCKET } from "@/lib/check-photos";
import { MAX_PHOTOS_PER_UPLOAD } from "@/lib/check-photos-shared";

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

export async function saveCheck(clientId: string, checkId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
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
  for (let i = 0; i < 6; i++) {
    const exercise = String(fd.get(`test_${i}_exercise`) ?? "").trim();
    if (!exercise) continue;
    const load = num(fd.get(`test_${i}_load`));
    const reps = num(fd.get(`test_${i}_reps`));
    const rpe = num(fd.get(`test_${i}_rpe`));
    tests.push({ exercise, load, reps, rpe, e1rm: load && reps && rpe ? estimateOneRepMax(load, reps, rpe) : null });
  }

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
    tests_text: String(fd.get("tests_text") ?? "").trim(),
    notes_next_phase: String(fd.get("notes_next_phase") ?? "").trim(),
    visible_to_client: fd.get("visible_to_client") === "on",
    created_by: me.id,
  };
  const { data: saved, error } = checkId
    ? await supabase.from("checks").update(row).eq("id", checkId).eq("client_id", clientId).select("id").maybeSingle()
    : await supabase.from("checks").insert(row).select("id").single();
  if (error || !saved) return { error: "Salvataggio non riuscito." };
  // % di grasso e masse con la formula di riferimento del cliente (può
  // cambiare per tutti i check se questo aggiunge o toglie una plica)
  await recomputeClientChecks(supabase, clientId);
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
  // dopo il salvataggio si propongono subito le foto di questo check
  redirect(`/staff/clienti/${clientId}/check?salvato=${saved.id}`);
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

export async function preparePhotoUploads(clientId: string, checkId: string, count: number): Promise<{ tickets: PhotoTicket[] } | { error: string }> {
  await requireStaff();
  if (!Number.isInteger(count) || count < 1) return { error: "Scegli almeno una foto." };
  if (count > MAX_PHOTOS_PER_UPLOAD) return { error: `Al massimo ${MAX_PHOTOS_PER_UPLOAD} foto per volta.` };
  const supabase = await createClient();
  // il check deve esistere ed essere di un cliente che puoi seguire (permessi del database)
  const { data: check } = await supabase.from("checks").select("id").eq("id", checkId).eq("client_id", clientId).maybeSingle();
  if (!check) return { error: "Check non trovato." };
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
