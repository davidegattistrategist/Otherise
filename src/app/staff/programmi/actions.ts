"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isISODate, todayISO, addDays } from "@/lib/dates";
import { cloneWithNewIds, newId, normalizeWeeks, parseContent, programContentSchema, type ProgramContent } from "@/lib/program/types";
import { buildNextPhase, type ItemLastLog } from "@/lib/program/next-phase";
import { parseProgramSheet } from "@/lib/import/sheet";
import { programEndDate } from "@/lib/program/schedule";
import { notify } from "@/lib/notify";
import { deliverPendingEmails } from "@/lib/email";
import type { ActionState } from "@/components/form-bits";
import type { Json } from "@/lib/supabase/database.types";

const asJson = (c: ProgramContent) => c as unknown as NonNullable<Json>;

function editorPath(id: string) {
  return `/staff/programmi/${id}`;
}

/** Data di inizio proposta: il giorno dopo la fine dell'ultimo programma pubblicato, o oggi. */
async function suggestedStart(clientId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("programs")
    .select("start_date, weeks")
    .eq("client_id", clientId)
    .eq("status", "published")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.start_date) {
    const next = addDays(programEndDate(data.start_date, data.weeks), 1);
    return next > todayISO() ? next : todayISO();
  }
  return todayISO();
}

/** Nuovo programma vuoto per un cliente, o nuovo modello se clientId è null. */
export async function createEmptyProgram(clientId: string | null) {
  const me = await requireStaff();
  const supabase = await createClient();
  const { data: owner } = clientId ? await supabase.from("clients").select("phase_weeks").eq("id", clientId).maybeSingle() : { data: null };
  const weeks = owner?.phase_weeks ?? 4;
  const content = normalizeWeeks({ days: [{ id: newId(), title: "Giorno 1", notes: "", blocks: [] }] }, weeks);
  const { data, error } = await supabase
    .from("programs")
    .insert({
      client_id: clientId,
      is_template: clientId === null,
      title: clientId ? "Nuovo programma" : "Nuovo modello",
      weeks,
      start_date: clientId ? await suggestedStart(clientId) : null,
      content: asJson(content),
      created_by: me.id,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("Non è stato possibile creare il programma");
  redirect(editorPath(data.id));
}

/** Nuovo programma per il cliente a partire da un modello (copia: cambiare il modello non tocca il programma). */
export async function createFromTemplate(clientId: string, fd: FormData) {
  const me = await requireStaff();
  const templateId = String(fd.get("template_id") ?? "");
  const supabase = await createClient();
  const { data: tpl } = await supabase.from("programs").select("title, description, weeks, content").eq("id", templateId).eq("is_template", true).maybeSingle();
  if (!tpl) throw new Error("Modello non trovato");
  const { data, error } = await supabase
    .from("programs")
    .insert({
      client_id: clientId,
      title: tpl.title,
      description: tpl.description,
      weeks: tpl.weeks,
      start_date: await suggestedStart(clientId),
      content: asJson(cloneWithNewIds(parseContent(tpl.content))),
      source: "template",
      created_by: me.id,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("Non è stato possibile creare il programma");
  redirect(editorPath(data.id));
}

/** Nuova fase a partire dal programma indicato (stessi esercizi, settimana 1 dal logbook reale). */
export async function createNextPhase(previousId: string, fd?: FormData) {
  const me = await requireStaff();
  const supabase = await createClient();
  const { data: prev } = await supabase.from("programs").select("id, client_id, title, weeks, content, start_date, session_minutes, clients(phase_weeks)").eq("id", previousId).maybeSingle();
  if (!prev?.client_id) throw new Error("Programma non trovato");
  const fallback = (prev.clients as unknown as { phase_weeks: number } | null)?.phase_weeks ?? prev.weeks;
  const weeksRaw = Number(fd?.get("weeks") ?? fallback);
  const weeks = Number.isInteger(weeksRaw) && weeksRaw >= 1 && weeksRaw <= 12 ? weeksRaw : fallback;
  const { data: logs } = await supabase.from("exercise_logs").select("item_id, week, sets, result_text").eq("program_id", prev.id);
  const content = buildNextPhase(parseContent(prev.content), weeks, (logs ?? []) as unknown as ItemLastLog[]);
  const start = prev.start_date ? addDays(programEndDate(prev.start_date, prev.weeks), 1) : todayISO();
  const { data, error } = await supabase
    .from("programs")
    .insert({
      client_id: prev.client_id,
      title: `${prev.title} · nuova fase`,
      weeks,
      start_date: start < todayISO() ? todayISO() : start,
      content: asJson(content),
      previous_program_id: prev.id,
      session_minutes: prev.session_minutes,
      source: "copy",
      created_by: me.id,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("Non è stato possibile creare la nuova fase");
  redirect(editorPath(data.id));
}

const saveSchema = z.object({
  title: z.string().trim().min(1, "Dai un nome al programma").max(120),
  description: z.string().max(4000).default(""),
  weeks: z.number().int().min(1).max(12),
  /** Tempo a disposizione per seduta (minuti), facoltativo */
  session_minutes: z.number().int().min(10).max(240).nullable().optional(),
  start_date: z.string().nullable().refine((v) => v === null || v === "" || isISODate(v), "Data di inizio non valida"),
  content: programContentSchema,
  expected_updated_at: z.string().nullable(),
  /** Note dell'AI sulle righe cambiate (presenti dopo una bozza preparata con l'assistente) */
  ai_notes: z.record(z.string(), z.string()).nullable().optional(),
});

export type SaveResult = { ok: true; updated_at: string; unknownExercises: string[] } | { ok: false; error: string; conflict?: boolean };

export async function saveProgram(id: string, input: unknown): Promise<SaveResult> {
  await requireStaff();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;
  const supabase = await createClient();
  const { data: current } = await supabase.from("programs").select("updated_at, status").eq("id", id).maybeSingle();
  if (!current) return { ok: false, error: "Programma non trovato" };
  if (v.expected_updated_at && current.updated_at !== v.expected_updated_at) {
    return { ok: false, conflict: true, error: "Qualcun altro ha modificato questo programma nel frattempo. Ricarica la pagina per vedere la versione aggiornata (le tue modifiche non salvate andrebbero perse: copiale prima)." };
  }
  if (current.status !== "draft" && !v.start_date) return { ok: false, error: "Un programma pubblicato deve avere la data di inizio" };
  const content = normalizeWeeks(v.content, v.weeks);
  const { data, error } = await supabase
    .from("programs")
    .update({
      title: v.title,
      description: v.description,
      weeks: v.weeks,
      start_date: v.start_date || null,
      ...(v.session_minutes !== undefined ? { session_minutes: v.session_minutes } : {}),
      content: asJson(content),
      ...(v.ai_notes !== undefined ? { ai_notes: v.ai_notes && Object.keys(v.ai_notes).length ? v.ai_notes : null } : {}),
      ...(v.ai_notes && Object.keys(v.ai_notes).length ? { source: "ai" } : {}),
    })
    .eq("id", id)
    .select("updated_at, client_id")
    .single();
  if (error || !data) return { ok: false, error: "Salvataggio non riuscito. Riprova." };
  const unknown = new Set<string>();
  content.days.forEach((d) => d.blocks.forEach((b) => b.items.forEach((it) => !it.exerciseId && it.name.trim() && unknown.add(it.name.trim()))));
  if (data.client_id) revalidatePath(`/staff/clienti/${data.client_id}`, "layout");
  return { ok: true, updated_at: data.updated_at, unknownExercises: [...unknown] };
}

export async function publishProgram(id: string): Promise<ActionState> {
  await requireStaff();
  const supabase = await createClient();
  const { data: p } = await supabase.from("programs").select("id, client_id, title, start_date, is_template, clients(user_id)").eq("id", id).maybeSingle();
  if (!p || p.is_template || !p.client_id) return { error: "Solo i programmi dei clienti si pubblicano." };
  if (!p.start_date) return { error: "Scegli la data di inizio prima di pubblicare." };
  const { error } = await supabase.from("programs").update({ status: "published", published_at: new Date().toISOString(), ai_notes: null }).eq("id", id);
  if (error) return { error: "Pubblicazione non riuscita." };
  const userId = (p.clients as unknown as { user_id: string | null } | null)?.user_id;
  if (userId) {
    await notify([{ recipient_id: userId, client_id: p.client_id, kind: "program_published", title: "Il tuo nuovo programma è pronto", body: p.title, link: "/cliente/programma", dedupe_key: `published:${id}` }]);
    await deliverPendingEmails();
  }
  revalidatePath(`/staff/clienti/${p.client_id}`, "layout");
  revalidatePath(editorPath(id));
  return { ok: true, message: userId ? "Pubblicato: il cliente lo vede già e riceve un avviso." : "Pubblicato. Il cliente lo vedrà quando entra nell'app (non è ancora stato invitato)." };
}

export async function unpublishProgram(id: string): Promise<ActionState> {
  await requireStaff();
  const supabase = await createClient();
  const { data, error } = await supabase.from("programs").update({ status: "draft" }).eq("id", id).select("client_id").single();
  if (error) return { error: "Operazione non riuscita." };
  revalidatePath(`/staff/clienti/${data.client_id}`, "layout");
  revalidatePath(editorPath(id));
  return { ok: true, message: "Tornato in bozza: il cliente non lo vede più." };
}

export async function archiveProgram(id: string): Promise<ActionState> {
  await requireStaff();
  const supabase = await createClient();
  const { data, error } = await supabase.from("programs").update({ status: "archived" }).eq("id", id).select("client_id").single();
  if (error) return { error: "Operazione non riuscita." };
  revalidatePath(`/staff/clienti/${data.client_id}`, "layout");
  revalidatePath(editorPath(id));
  return { ok: true, message: "Archiviato: resta nello storico del cliente." };
}

export async function deleteProgram(id: string) {
  await requireStaff();
  const supabase = await createClient();
  const { data } = await supabase.from("programs").select("client_id, is_template").eq("id", id).maybeSingle();
  await supabase.from("programs").delete().eq("id", id);
  if (data?.client_id) {
    revalidatePath(`/staff/clienti/${data.client_id}`, "layout");
    redirect(`/staff/clienti/${data.client_id}/programma`);
  }
  redirect("/staff/modelli");
}

export async function saveAsTemplate(id: string, title: string): Promise<ActionState> {
  const me = await requireStaff();
  const supabase = await createClient();
  const { data: p } = await supabase.from("programs").select("title, description, weeks, content").eq("id", id).maybeSingle();
  if (!p) return { error: "Programma non trovato." };
  const { error } = await supabase.from("programs").insert({
    client_id: null,
    is_template: true,
    title: title.trim() || p.title,
    description: p.description,
    weeks: p.weeks,
    content: asJson(cloneWithNewIds(parseContent(p.content))),
    source: "copy",
    created_by: me.id,
  });
  if (error) return { error: "Non è stato possibile salvare il modello." };
  revalidatePath("/staff/modelli");
  return { ok: true, message: "Salvato tra i modelli." };
}

export async function setAiExample(id: string, value: boolean): Promise<ActionState> {
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase.from("programs").update({ is_ai_example: value }).eq("id", id);
  if (error) return { error: "Operazione non riuscita." };
  revalidatePath(editorPath(id));
  return { ok: true, message: value ? "L'assistente AI userà questo programma come esempio del tuo stile." : "Non è più un esempio per l'assistente AI." };
}

/** Aggiunge all'eserciziario gli esercizi scritti a mano nel programma e li collega. */
export async function addMissingExercises(id: string): Promise<ActionState & { content?: ProgramContent; updated_at?: string }> {
  await requireStaff();
  const supabase = await createClient();
  const { data: p } = await supabase.from("programs").select("content, client_id").eq("id", id).maybeSingle();
  if (!p) return { error: "Programma non trovato." };
  const content = parseContent(p.content);
  const names = new Map<string, string>();
  content.days.forEach((d) => d.blocks.forEach((b) => b.items.forEach((it) => {
    if (!it.exerciseId && it.name.trim()) names.set(it.name.trim().toLowerCase(), it.name.trim());
  })));
  if (names.size === 0) return { ok: true, message: "Nessun esercizio nuovo." };
  const { data: existing } = await supabase.from("exercises").select("id, name");
  const idByName = new Map((existing ?? []).map((e) => [e.name.toLowerCase(), e.id]));
  const toInsert = [...names.entries()].filter(([k]) => !idByName.has(k)).map(([, name]) => ({ name }));
  if (toInsert.length) {
    const { data: inserted, error } = await supabase.from("exercises").insert(toInsert).select("id, name");
    if (error) return { error: "Non è stato possibile aggiungere gli esercizi." };
    (inserted ?? []).forEach((e) => idByName.set(e.name.toLowerCase(), e.id));
  }
  const linked: ProgramContent = {
    days: content.days.map((d) => ({ ...d, blocks: d.blocks.map((b) => ({ ...b, items: b.items.map((it) => (it.exerciseId || !it.name.trim() ? it : { ...it, exerciseId: idByName.get(it.name.trim().toLowerCase()) ?? null })) })) })),
  };
  const { data: upd } = await supabase.from("programs").update({ content: asJson(linked) }).eq("id", id).select("updated_at").single();
  revalidatePath("/staff/eserciziario");
  return { ok: true, message: `${toInsert.length} esercizi aggiunti all'eserciziario: ora puoi aggiungere video e descrizione.`, content: linked, updated_at: upd?.updated_at };
}

/** Importa una scheda esportata dai fogli Google (CSV) come bozza per il cliente. */
export async function importFromSheet(clientId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const file = fd.get("file");
  const asHistory = fd.get("as_history") === "on";
  const startDate = String(fd.get("start_date") ?? "");
  const title = String(fd.get("title") ?? "").trim() || "Programma importato";
  if (!(file instanceof File) || file.size === 0) return { error: "Scegli il file .csv esportato dal foglio." };
  if (file.size > 2_000_000) return { error: "Il file è troppo grande." };
  if (asHistory && !isISODate(startDate)) return { error: "Per importarlo come fase passata serve la data di inizio." };
  const supabase = await createClient();
  const { data: lib } = await supabase.from("exercises").select("id, name");
  const byName = new Map((lib ?? []).map((e) => [e.name.trim().toLowerCase(), e.id]));
  const parsed = parseProgramSheet(await file.text(), (n) => byName.get(n.trim().toLowerCase()) ?? null);
  if (parsed.content.days.length === 0) return { error: parsed.warnings[0] ?? "Non ho trovato esercizi nel file." };

  const { data: prog, error } = await supabase
    .from("programs")
    .insert({
      client_id: clientId,
      title,
      weeks: parsed.weeks,
      start_date: isISODate(startDate) ? startDate : await suggestedStart(clientId),
      status: asHistory ? "archived" : "draft",
      content: asJson(parsed.content),
      source: "import",
      created_by: me.id,
    })
    .select("id")
    .single();
  if (error || !prog) return { error: "Import non riuscito." };

  // con "fase passata" importiamo anche quanto scritto nelle righe Log (serve all'assistente AI)
  if (asHistory && parsed.logs.length) {
    const dayIndex = new Map(parsed.content.days.map((d, i) => [d.id, i]));
    const nameOf = new Map<string, { name: string; exerciseId: string | null }>();
    parsed.content.days.forEach((d) => d.blocks.forEach((b) => b.items.forEach((it) => nameOf.set(it.id, { name: it.name, exerciseId: it.exerciseId ?? null }))));
    const sessions = new Map<string, { day: string; week: number }>();
    parsed.logs.forEach((l) => sessions.set(`${l.dayId}:${l.week}`, { day: l.dayId, week: l.week }));
    for (const s of sessions.values()) {
      const performed = addDays(startDate, (s.week - 1) * 7 + (dayIndex.get(s.day) ?? 0) * 2);
      const { data: wl } = await supabase
        .from("workout_logs")
        .insert({ client_id: clientId, program_id: prog.id, day_id: s.day, week: s.week, performed_on: performed, completed: true, notes: "Importato dal foglio Google" })
        .select("id")
        .single();
      if (!wl) continue;
      const rows = parsed.logs
        .filter((l) => l.dayId === s.day && l.week === s.week)
        .map((l) => ({
          workout_log_id: wl.id, client_id: clientId, program_id: prog.id, item_id: l.itemId,
          exercise_id: nameOf.get(l.itemId)?.exerciseId ?? null, exercise_name: nameOf.get(l.itemId)?.name ?? "",
          week: l.week, performed_on: performed, sets: [] as NonNullable<Json>, result_text: l.text,
        }));
      if (rows.length) await supabase.from("exercise_logs").insert(rows);
    }
  }
  // i link video del foglio completano l'eserciziario dove manca il video
  for (const v of parsed.videos) {
    const id = byName.get(v.itemName.trim().toLowerCase());
    if (id) await supabase.from("exercises").update({ video_url: v.url }).eq("id", id).is("video_url", null);
  }
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
  redirect(editorPath(prog.id));
}
