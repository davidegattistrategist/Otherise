"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isISODate, todayISO } from "@/lib/dates";
import { flattenItems, parseContent } from "@/lib/program/types";
import type { Json } from "@/lib/supabase/database.types";
import { notify, staffRecipients } from "@/lib/notify";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";

async function alertDiscomfort(clientId: string, logId: string, text: string, where: string) {
  const admin = createAdminClient();
  const [ids, { data: c }] = await Promise.all([staffRecipients(clientId), admin.from("clients").select("first_name, last_name").eq("id", clientId).maybeSingle()]);
  const name = c ? `${c.first_name} ${c.last_name}`.trim() : "Un cliente";
  const title = `Dolore o fastidio: ${name}`;
  const body = `${where}: "${text.slice(0, 300)}"`;
  const link = `/staff/clienti/${clientId}`;
  await notify(ids.map((id) => ({ recipient_id: id, client_id: clientId, kind: "discomfort", title, body, link, dedupe_key: `discomfort:${logId}` })));
  const { data: staff } = await admin.from("profiles").select("id, email").in("id", ids);
  const base = await siteUrl();
  for (const s of staff ?? []) {
    if (!s.email) continue;
    const ok = await sendEmail(s.email, title, `${body}\n\nDecidi tu come intervenire: ${base}${link}`);
    if (ok) await admin.from("notifications").update({ emailed_at: new Date().toISOString() }).eq("recipient_id", s.id).eq("dedupe_key", `discomfort:${logId}`);
  }
}

const setSchema = z.object({
  kg: z.number().min(0).max(1000).nullable().optional(),
  reps: z.number().int().min(0).max(1000).nullable().optional(),
  done: z.boolean().optional(),
});

const inputSchema = z.object({
  programId: z.string().uuid(),
  week: z.number().int().min(1).max(12),
  dayId: z.string().min(1).max(40),
  performedOn: z.string(),
  completed: z.boolean(),
  notes: z.string().max(4000),
  /** Dolore o fastidio: arriva subito allo staff (decide il trainer, non l'AI) */
  discomfort: z.string().max(1000).default(""),
  items: z.array(
    z.object({
      itemId: z.string().min(1).max(40),
      sets: z.array(setSchema).max(30),
      resultText: z.string().max(1000),
    }),
  ).max(80),
});

export type SaveWorkoutInput = z.infer<typeof inputSchema>;
export type SaveWorkoutResult = { ok: true; savedAt: string } | { ok: false; error: string };

/**
 * Salva il logbook di una sessione. Lo può fare il cliente (sui propri
 * programmi pubblicati) o lo staff che lo segue: i permessi li controlla il
 * database. Nome ed esercizio vengono presi dal programma, non dal browser.
 */
export async function saveWorkout(raw: SaveWorkoutInput): Promise<SaveWorkoutResult> {
  const me = await requireUser();
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Dati non validi." };
  const input = parsed.data;
  if (!isISODate(input.performedOn) || input.performedOn > todayISO()) return { ok: false, error: "Data non valida." };

  const supabase = await createClient();
  const { data: program } = await supabase.from("programs").select("id, client_id, weeks, content, status").eq("id", input.programId).maybeSingle();
  if (!program?.client_id || program.status === "draft") return { ok: false, error: "Programma non trovato." };
  if (input.week > program.weeks) return { ok: false, error: "Settimana non valida." };
  const content = parseContent(program.content);
  const items = new Map(flattenItems(content).filter((f) => f.day.id === input.dayId).map((f) => [f.item.id, f.item]));
  if (items.size === 0 && !content.days.some((d) => d.id === input.dayId)) return { ok: false, error: "Giornata non trovata." };

  const discomfort = input.discomfort.trim();
  const { data: before } = await supabase.from("workout_logs").select("discomfort").eq("program_id", program.id).eq("week", input.week).eq("day_id", input.dayId).maybeSingle();
  const { data: log, error } = await supabase
    .from("workout_logs")
    .upsert(
      {
        client_id: program.client_id, program_id: program.id, day_id: input.dayId, week: input.week, performed_on: input.performedOn, completed: input.completed, notes: input.notes.trim(),
        discomfort,
        ...(discomfort !== (before?.discomfort ?? "") ? { discomfort_seen_at: null } : {}),
      },
      { onConflict: "program_id,week,day_id" },
    )
    .select("id")
    .single();
  if (error || !log) return { ok: false, error: "Salvataggio non riuscito. Controlla la connessione e riprova." };

  const toDelete: string[] = [];
  const rows = [];
  for (const it of input.items) {
    const item = items.get(it.itemId);
    if (!item) continue;
    const sets = it.sets.map((s) => ({ kg: s.kg ?? null, reps: s.reps ?? null, ...(s.done ? { done: true } : {}) }));
    const hasData = sets.some((s) => s.kg !== null || s.reps !== null || s.done) || it.resultText.trim();
    if (!hasData) {
      toDelete.push(it.itemId);
      continue;
    }
    rows.push({
      workout_log_id: log.id,
      client_id: program.client_id,
      program_id: program.id,
      item_id: it.itemId,
      exercise_id: item.exerciseId ?? null,
      exercise_name: item.name || "Esercizio",
      week: input.week,
      performed_on: input.performedOn,
      sets: sets as unknown as NonNullable<Json>,
      result_text: it.resultText.trim(),
    });
  }
  if (rows.length) {
    const { error: e2 } = await supabase.from("exercise_logs").upsert(rows, { onConflict: "workout_log_id,item_id" });
    if (e2) return { ok: false, error: "Salvataggio non riuscito. Riprova tra poco." };
  }
  if (toDelete.length) await supabase.from("exercise_logs").delete().eq("workout_log_id", log.id).in("item_id", toDelete);

  // dolore o fastidio scritto dal cliente: avviso subito allo staff (una volta per allenamento)
  if (discomfort && !before?.discomfort && me.role === "client") {
    const day = content.days.find((d) => d.id === input.dayId);
    await alertDiscomfort(program.client_id, log.id, discomfort, `${day?.title ?? "Allenamento"} · settimana ${input.week}`);
  }

  if (input.completed) {
    revalidatePath("/cliente", "layout");
    revalidatePath(`/staff/clienti/${program.client_id}`, "layout");
  }
  return { ok: true, savedAt: new Date().toISOString() };
}
