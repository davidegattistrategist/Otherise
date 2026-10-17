/**
 * Bozze AI in coda: il trainer dà le indicazioni e può passare subito a un
 * altro cliente; l'AI lavora sul server (dopo la risposta, fino a 5 minuti) e
 * il risultato resta nella tabella `ai_program_jobs` finché il trainer non lo
 * apre nell'editor di QUEL programma o lo scarta. Una sola bozza in
 * preparazione per programma, ogni trainer vede solo le sue.
 */
import "server-only";
import { after } from "next/server";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { friendlyError } from "@/lib/friendly-error";
import { notify } from "@/lib/notify";
import { learnPending } from "./learn";
import { runProgramDraft, type DraftInput, type DraftOutcome } from "./program-draft";
import { jobView, STALE_MS, type JobRow, type JobView } from "./program-jobs-shared";

type Program = { id: string; client_id: string; session_minutes: number | null; start_date: string | null };

const OPEN = ["working", "questions", "ready", "failed"];

/** Fa partire la bozza in coda. Errore se per questo programma ce n'è già una in preparazione. */
export async function startProgramJob(supabase: ServerSupabase, userId: string, program: Program, input: DraftInput, baseUpdatedAt: string | null): Promise<{ job: JobView } | { error: string }> {
  // una richiesta rimasta "in preparazione" troppo a lungo non ha risposto: non blocca le nuove
  await supabase
    .from("ai_program_jobs")
    .update({ status: "failed", error: "L'AI non ha risposto in tempo.", finished_at: new Date().toISOString() })
    .eq("program_id", program.id)
    .eq("status", "working")
    .lt("created_at", new Date(Date.now() - STALE_MS).toISOString());
  // quello che c'era prima per questo programma (domande, bozza non aperta) lascia il posto alla nuova richiesta
  await supabase.from("ai_program_jobs").update({ status: "discarded", closed_at: new Date().toISOString() }).eq("program_id", program.id).in("status", ["questions", "ready", "failed"]);
  const request = {
    mode: input.mode,
    instruction: input.instruction,
    answers: input.answers ?? [],
    skip: input.skip ?? false,
    title: input.current.title,
    weeks: input.current.weeks,
    images: input.images.length,
  };
  const { data: row, error } = await supabase
    .from("ai_program_jobs")
    .insert({ program_id: program.id, client_id: program.client_id, created_by: userId, status: "working", request: request as unknown as Json, base_updated_at: baseUpdatedAt })
    .select("*")
    .single();
  if (error || !row) {
    if (error?.code === "23505") return { error: "Per questo programma c'è già una bozza in preparazione: aspetta che sia pronta." };
    return { error: "Non sono riuscito a far partire la bozza: riprova." };
  }
  const { data: client } = await supabase.from("clients").select("first_name, last_name").eq("id", program.client_id).maybeSingle();
  const who = client ? `${client.first_name} ${client.last_name}`.trim() : "il cliente";

  after(async () => {
    let outcome: DraftOutcome | null = null;
    let failure: string | null = null;
    try {
      outcome = await runProgramDraft(supabase, userId, program, input);
    } catch (e) {
      console.error("AI job error", e);
      const msg = friendlyError(e, "L'assistente non ha risposto: riprova tra poco.");
      failure = msg.length < 200 ? msg : "L'assistente non ha risposto correttamente. Riprova tra poco.";
    }
    const status = failure ? "failed" : outcome && "questions" in outcome ? "questions" : "ready";
    // aggiorna solo se è ancora "in preparazione" (se nel frattempo l'hai scartata resta scartata)
    const { data: updated } = await supabase
      .from("ai_program_jobs")
      .update({ status, result: (outcome ?? null) as unknown as Json, error: failure, finished_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "working")
      .select("id");
    if (!updated?.length) return;
    const link = `/staff/programmi/${program.id}?ai=1`;
    await notify([
      {
        recipient_id: userId,
        client_id: program.client_id,
        kind: "ai_draft",
        title: status === "ready" ? `Bozza pronta: ${who}` : status === "questions" ? `L'AI ha qualche domanda: ${who}` : `Bozza non riuscita: ${who}`,
        body: status === "ready" ? "Aprila e rivedila." : status === "questions" ? "Rispondi e la prepara." : "Apri il programma e riprova.",
        link,
        dedupe_key: `ai:${row.id}`,
      },
    ]).catch(() => undefined);
    if (status === "ready") await learnPending(userId, { olderThanMinutes: 30 }).catch(() => undefined);
  });
  return { job: jobView(row as JobRow, who) };
}

/** La richiesta più recente ancora aperta per un programma (per riprenderla nell'editor). */
export async function openJobForProgram(supabase: ServerSupabase, programId: string): Promise<JobView | null> {
  const { data } = await supabase.from("ai_program_jobs").select("*").eq("program_id", programId).in("status", OPEN).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data ? jobView(data as JobRow) : null;
}

export async function getJob(supabase: ServerSupabase, id: string): Promise<JobView | null> {
  const { data } = await supabase.from("ai_program_jobs").select("*").eq("id", id).maybeSingle();
  return data ? jobView(data as JobRow) : null;
}

/** Le mie richieste aperte, con il nome del cliente (per il riquadro "Bozze AI"). */
export async function myOpenJobs(supabase: ServerSupabase, userId: string): Promise<JobView[]> {
  const { data } = await supabase
    .from("ai_program_jobs")
    .select("*, clients(first_name, last_name)")
    .eq("created_by", userId)
    .in("status", OPEN)
    .order("created_at", { ascending: false })
    .limit(12);
  return (data ?? []).map((r) => {
    const c = (r as unknown as { clients: { first_name: string; last_name: string } | null }).clients;
    return jobView(r as unknown as JobRow, c ? `${c.first_name} ${c.last_name}`.trim() : undefined);
  });
}

/** Aperta nell'editor (applied) o scartata: esce dall'elenco e la notifica si segna letta. */
export async function closeJob(supabase: ServerSupabase, id: string, status: "applied" | "discarded") {
  const { data } = await supabase.from("ai_program_jobs").update({ status, closed_at: new Date().toISOString() }).eq("id", id).in("status", OPEN).select("id, created_by");
  if (data?.[0]) await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", data[0].created_by).eq("dedupe_key", `ai:${id}`).is("read_at", null);
}
