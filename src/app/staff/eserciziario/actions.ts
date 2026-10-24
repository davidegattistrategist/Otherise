"use server";

import { readFile } from "node:fs/promises";
import { friendlyError } from "@/lib/friendly-error";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { invalidateExercises } from "@/lib/data/cached";
import { redirect } from "next/navigation";
import { requireOwner, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseExerciseCsv, type ExerciseRow } from "@/lib/import/exercises";
import type { ActionState } from "@/components/form-bits";
import { clearFormDraft } from "@/lib/drafts-server";
import { changedOnly } from "@/lib/changed-only";

async function importRows(rows: ExerciseRow[]): Promise<ActionState> {
  const supabase = await createClient();
  const { data: existing } = await supabase.from("exercises").select("id, name, video_url, description");
  const byName = new Map((existing ?? []).map((e) => [e.name.trim().toLowerCase(), e]));
  const toInsert: ExerciseRow[] = [];
  let updated = 0;
  for (const r of rows) {
    const cur = byName.get(r.name.toLowerCase());
    if (!cur) {
      toInsert.push(r);
      continue;
    }
    const patch: { video_url?: string; description?: string } = {};
    if (!cur.video_url && r.video_url) patch.video_url = r.video_url;
    if (!cur.description && r.description) patch.description = r.description;
    if (Object.keys(patch).length) {
      await supabase.from("exercises").update(patch).eq("id", cur.id);
      updated++;
    }
  }
  if (toInsert.length) {
    const { error } = await supabase.from("exercises").insert(toInsert);
    if (error) return { error: `Import non riuscito. ${friendlyError(error)}` };
  }
  invalidateExercises();
  revalidatePath("/staff/eserciziario");
  return { ok: true, message: `${toInsert.length} esercizi aggiunti${updated ? `, ${updated} completati con video o descrizione` : ""}.` };
}

export async function importExercisesCsv(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireStaff();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Scegli il file .csv." };
  const { rows, duplicates } = parseExerciseCsv(await file.text());
  if (!rows.length) return { error: "Nel file non ci sono esercizi (colonne attese: Esercizio, Video, Note)." };
  const res = await importRows(rows);
  if (res?.ok && duplicates.length) res.message += ` Doppioni uniti: ${duplicates.join(", ")}.`;
  return res;
}

/** Importa l'eserciziario Otherise incluso nel progetto (cartella dati/). */
export async function importBundledExercises(_: ActionState): Promise<ActionState> {
  await requireStaff();
  const text = await readFile(path.join(process.cwd(), "dati", "eserciziario.csv"), "utf8");
  const { rows } = parseExerciseCsv(text);
  return importRows(rows);
}

export async function saveExercise(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const name = String(fd.get("name") ?? "").trim().replace(/\s+/g, " ");
  const video = String(fd.get("video_url") ?? "").trim();
  if (!name) return { error: "Il nome è obbligatorio." };
  if (video && !/^https?:\/\//i.test(video)) return { error: "Il link del video deve iniziare con https://" };
  const row = {
    name,
    video_url: video || null,
    description: String(fd.get("description") ?? "").trim(),
    category: String(fd.get("category") ?? "").trim(),
    archived: fd.get("archived") === "on",
  };
  const supabase = await createClient();
  const patch = id ? changedOnly(fd, row) : row;
  const { data, error } = id
    ? Object.keys(patch).length
      ? await supabase.from("exercises").update(patch).eq("id", id).select("id").single()
      : { data: { id }, error: null }
    : await supabase.from("exercises").insert(row).select("id").single();
  if (error) return { error: error.message.includes("exercises_name_unique") ? "Esiste già un esercizio con questo nome." : "Salvataggio non riuscito." };
  await clearFormDraft(supabase, me.id, fd);
  invalidateExercises();
  revalidatePath("/staff/eserciziario");
  if (!id) redirect(`/staff/eserciziario/${data!.id}?nuovo=1`);
  return { ok: true, message: "Esercizio salvato. Le modifiche valgono anche nei programmi già pubblicati." };
}

export async function deleteExercise(id: string) {
  await requireOwner();
  const supabase = await createClient();
  await supabase.from("exercises").delete().eq("id", id);
  invalidateExercises();
  revalidatePath("/staff/eserciziario");
  redirect("/staff/eserciziario");
}
