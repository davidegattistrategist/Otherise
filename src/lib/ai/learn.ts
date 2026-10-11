import "server-only";
/**
 * L'assistente impara dalle correzioni del trainer.
 *
 * 1. Ogni bozza preparata dall'AI viene salvata (program_ai_drafts).
 * 2. Quando il trainer pubblica, l'app confronta la bozza con il programma
 *    pubblicato e salva cosa è stato corretto.
 * 3. Un'altra chiamata all'AI trasforma le correzioni in "lezioni" generali
 *    (app_settings.ai_lessons), che entrano in ogni bozza successiva insieme
 *    alle ultime correzioni. Il titolare le vede e le può correggere.
 * Obiettivo: bozze che hanno bisogno di sempre meno modifiche.
 */
import { z } from "zod";
import type { ServerSupabase } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { diffPrograms, diffText } from "../program/diff";
import { parseContent, type ProgramContent } from "../program/types";
import type { Json } from "../supabase/database.types";
import { aiEnabled, runJson } from "./claude";

export const MAX_LESSONS = 25;

/** Salva la bozza appena preparata dall'AI (per confrontarla con quella pubblicata). */
export async function recordDraft(supabase: ServerSupabase, d: { programId: string; clientId: string | null; userId: string; content: ProgramContent; instruction: string }) {
  await supabase.from("program_ai_drafts").insert({
    program_id: d.programId,
    client_id: d.clientId,
    created_by: d.userId,
    content: d.content as unknown as Json,
    instruction: d.instruction.slice(0, 2000),
  });
}

/**
 * Confronta l'ultima bozza dell'AI di questo programma con il programma del
 * trainer (alla pubblicazione, o al salvataggio di un programma già pubblicato
 * entro 2 giorni dalla bozza). Ogni nuovo salvataggio aggiorna il confronto.
 */
export async function compareWithDraft(programId: string, final: ProgramContent, opts: { maxAgeHours?: number } = {}) {
  const admin = createAdminClient();
  let q = admin.from("program_ai_drafts").select("id, content").eq("program_id", programId).order("created_at", { ascending: false }).limit(1);
  if (opts.maxAgeHours) q = q.gte("created_at", new Date(Date.now() - opts.maxAgeHours * 3600_000).toISOString());
  const { data: draft } = await q.maybeSingle();
  if (!draft) return null;
  const d = diffPrograms(parseContent(draft.content), final);
  await admin
    .from("program_ai_drafts")
    .update({ compared_at: new Date().toISOString(), rows_total: d.total, rows_changed: d.changed, corrections: diffText(d), learned_at: null })
    .eq("id", draft.id);
  return d;
}

/**
 * Trasforma in lezioni le correzioni non ancora imparate. Con olderThanMinutes
 * aspetta che il trainer abbia finito di ritoccare (per i salvataggi ripetuti).
 */
export async function learnPending(createdBy: string | null, opts: { programId?: string; olderThanMinutes?: number } = {}) {
  if (!aiEnabled()) return;
  const admin = createAdminClient();
  let q = admin.from("program_ai_drafts").select("id, corrections, instruction, rows_changed").not("compared_at", "is", null).is("learned_at", null).order("compared_at").limit(3);
  if (opts.programId) q = q.eq("program_id", opts.programId);
  if (opts.olderThanMinutes) q = q.lte("compared_at", new Date(Date.now() - opts.olderThanMinutes * 60_000).toISOString());
  const { data } = await q;
  for (const d of data ?? []) {
    await admin.from("program_ai_drafts").update({ learned_at: new Date().toISOString() }).eq("id", d.id);
    if ((d.rows_changed ?? 0) > 0) await updateLessons({ text: d.corrections, instruction: d.instruction }, createdBy);
  }
}

/** Lezioni e ultime correzioni da dare all'AI a ogni bozza. */
export async function learningContext(supabase: ServerSupabase) {
  const [{ data: settings }, { data: recent }] = await Promise.all([
    supabase.from("app_settings").select("ai_lessons").maybeSingle(),
    supabase
      .from("program_ai_drafts")
      .select("compared_at, corrections, instruction, rows_changed")
      .not("compared_at", "is", null)
      .gt("rows_changed", 0)
      .order("compared_at", { ascending: false })
      .limit(3),
  ]);
  return {
    lessons: settings?.ai_lessons ?? "",
    corrections: (recent ?? []).map((r) => `Bozza del ${r.compared_at!.slice(0, 10)}${r.instruction ? ` (richiesta: "${r.instruction.slice(0, 160)}")` : ""}\n${r.corrections}`),
  };
}

/** Quanto ha corretto il trainer nelle ultime bozze (dalla più vecchia alla più recente), in %. */
export async function correctionTrend(supabase: ServerSupabase, n = 8): Promise<number[]> {
  const { data } = await supabase
    .from("program_ai_drafts")
    .select("rows_changed, rows_total")
    .not("compared_at", "is", null)
    .order("compared_at", { ascending: false })
    .limit(n);
  return (data ?? [])
    .filter((r) => (r.rows_total ?? 0) > 0)
    .map((r) => Math.round(((r.rows_changed ?? 0) / (r.rows_total ?? 1)) * 100))
    .reverse();
}

const LESSONS_SYSTEM = `Sei l'assistente di programmazione di un personal trainer italiano. Tieni aggiornata una breve lista di LEZIONI: cosa hai imparato dalle correzioni che il trainer fa alle tue bozze di programma, così la prossima bozza gli somiglia di più e richiede meno modifiche.
Regole:
- Ricevi le lezioni attuali, la richiesta del trainer per quella bozza e le correzioni che ha fatto (riga per riga). Restituisci la lista aggiornata.
- Una lezione è una regola concreta e generale sul suo modo di programmare, valida per molti clienti: es. "Sui complementari di braccia usa range larghi tipo 3x10/14, non 8/10", "Non mettere più di 2 complementari dopo il fondamentale in 60 minuti", "Le indicazioni sono di una riga, senza ripetere il nome dell'esercizio".
- Se una correzione dipende chiaramente dal singolo cliente (un fastidio, un attrezzo che manca, un test), NON farne una lezione generale.
- Unisci e rendi più precise le lezioni simili; togli quelle che le nuove correzioni smentiscono; non ripetere cose già ovvie dal metodo, salvo che la correzione lo contraddica (allora la lezione vince).
- Nessun nome di cliente o dato personale. Al massimo ${MAX_LESSONS} lezioni, ognuna breve (massimo 200 caratteri), in italiano.
- Se le correzioni non insegnano niente di generale, restituisci le lezioni attuali invariate.`;

const LESSONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["lessons"],
  properties: { lessons: { type: "array", items: { type: "string" } } },
} as const;

/** Aggiorna le lezioni dopo una pubblicazione con correzioni. Non lancia errori. */
async function updateLessons(c: { text: string; instruction: string }, createdBy: string | null) {
  if (!aiEnabled()) return;
  try {
    const admin = createAdminClient();
    const { data: settings } = await admin.from("app_settings").select("ai_lessons, coaching_method").eq("id", 1).maybeSingle();
    const current = (settings?.ai_lessons ?? "").trim();
    const user = [
      settings?.coaching_method ? `# Metodo del trainer (estratto, per contesto)\n${settings.coaching_method.slice(0, 6000)}` : "",
      `# Lezioni attuali\n${current || "(nessuna)"}`,
      `# Richiesta del trainer per la bozza\n${c.instruction || "(non indicata)"}`,
      `# Correzioni del trainer alla tua bozza\n${c.text}`,
    ].filter(Boolean).join("\n\n");
    const { json, usage } = await runJson(LESSONS_SYSTEM, user, LESSONS_SCHEMA as unknown as Record<string, unknown>, [], 3000);
    const lessons = z.object({ lessons: z.array(z.string()) }).parse(json).lessons
      .map((l) => l.trim().replace(/^[-•]\s*/, "").slice(0, 200))
      .filter(Boolean)
      .slice(0, MAX_LESSONS);
    await Promise.all([
      admin.from("app_settings").update({ ai_lessons: lessons.map((l) => `- ${l}`).join("\n"), ai_lessons_updated_at: new Date().toISOString() }).eq("id", 1),
      admin.from("ai_requests").insert({
        created_by: createdBy,
        kind: "lessons",
        model: usage.model,
        input_tokens: usage.input,
        output_tokens: usage.output,
        cost_eur: Number(usage.costEur.toFixed(4)),
      }),
    ]);
  } catch (e) {
    console.error("updateLessons", e);
  }
}
