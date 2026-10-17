import { NextResponse, type NextRequest } from "next/server";
import { friendlyError } from "@/lib/friendly-error";
import { z } from "zod";
import { getMe } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { budgetExceeded, logAiRequest } from "@/lib/ai/budget";
import { aiEnabled, progressRow, suggestAlternatives, type AiUsage } from "@/lib/ai/claude";
import { learnPending } from "@/lib/ai/learn";
import { runProgramDraft, type DraftInput } from "@/lib/ai/program-draft";
import { startProgramJob } from "@/lib/ai/program-jobs";
import { after } from "next/server";
import { buildClientContext, buildMethodContext } from "@/lib/ai/context";
import { programContentSchema } from "@/lib/program/types";
import { summarizeSets, type SetLog } from "@/lib/program/prescription";

export const maxDuration = 300;

const imageSchema = z.object({
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  data: z.string().max(7_000_000),
});

const reviseFields = {
  programId: z.string().uuid(),
  /** in coda (sul server), così si può passare subito a un altro cliente */
  background: z.boolean().default(false),
  /** updated_at del programma quando hai chiesto la bozza */
  baseUpdatedAt: z.string().nullish(),
  instruction: z.string().trim().min(3, "Scrivi cosa vuoi cambiare").max(6000),
  current: z.object({ title: z.string(), description: z.string(), weeks: z.number().int().min(1).max(12), content: programContentSchema }),
  images: z.array(imageSchema).max(4).default([]),
};

const bodySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("questions"), ...reviseFields }),
  z.object({
    mode: z.literal("revise"),
    ...reviseFields,
    answers: z.array(z.object({ question: z.string().max(400), answer: z.string().trim().max(1000) })).max(6).default([]),
    /** "Salta le domande": scrivi subito */
    skip: z.boolean().default(false),
  }),
  z.object({
    mode: z.literal("progress"),
    programId: z.string().uuid(),
    weeks: z.number().int().min(1).max(12),
    item: z.object({ name: z.string(), prescriptions: z.array(z.string()), notes: z.string().default(""), exerciseId: z.string().nullish() }),
  }),
  z.object({
    mode: z.literal("alternatives"),
    programId: z.string().uuid(),
    item: z.object({ name: z.string() }),
  }),
]);

export async function POST(req: NextRequest) {
  const me = await getMe();
  if (!me || (me.role !== "owner" && me.role !== "coach")) return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  if (!aiEnabled()) return NextResponse.json({ error: "Assistente AI non configurato: manca ANTHROPIC_API_KEY." }, { status: 400 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Richiesta non valida" }, { status: 400 });
  const body = parsed.data;

  const supabase = await createClient();
  // passa dai permessi: se lo staff non gestisce il cliente il programma non c'è
  const { data: program } = await supabase.from("programs").select("id, client_id, session_minutes, start_date").eq("id", body.programId).maybeSingle();
  if (!program?.client_id) return NextResponse.json({ error: "Programma non trovato" }, { status: 404 });

  // tetto di spesa mensile (stessa regola per tutte le funzioni AI)
  const over = await budgetExceeded(supabase);
  if (over) return NextResponse.json({ error: over }, { status: 429 });

  const log = (kind: string, usage: AiUsage) => logAiRequest(me.id, program.client_id, kind, usage);

  try {
    if (body.mode === "questions" || body.mode === "revise") {
      const input: DraftInput = body.mode === "revise" ? { mode: "revise", instruction: body.instruction, current: body.current, images: body.images, answers: body.answers, skip: body.skip } : { mode: "questions", instruction: body.instruction, current: body.current, images: body.images };
      // in coda: rispondo subito, l'AI lavora sul server e il trainer può passare a un altro cliente
      if (body.background) {
        const job = await startProgramJob(supabase, me.id, { ...program, client_id: program.client_id }, input, body.baseUpdatedAt ?? null);
        if ("error" in job) return NextResponse.json({ error: job.error }, { status: 409 });
        return NextResponse.json({ job: job.job });
      }
      const outcome = await runProgramDraft(supabase, me.id, { ...program, client_id: program.client_id }, input);
      // correzioni di programmi già pubblicati, ritoccati da almeno mezz'ora: diventano lezioni
      if (!("questions" in outcome)) after(() => learnPending(me.id, { olderThanMinutes: 30 }));
      return NextResponse.json(outcome);
    }
    if (body.mode === "progress") {
      const method = await buildMethodContext(supabase);
      let q = supabase.from("exercise_logs").select("performed_on, sets, result_text").eq("client_id", program.client_id).order("performed_on", { ascending: false }).limit(12);
      q = body.item.exerciseId ? q.eq("exercise_id", body.item.exerciseId) : q.ilike("exercise_name", body.item.name);
      const { data: hist } = await q;
      const history = (hist ?? []).reverse().map((h) => `${h.performed_on}: ${summarizeSets(h.sets as unknown as SetLog[]) ?? h.result_text}`).join("; ");
      const result = await progressRow({ method: method.method, examples: method.examples, item: body.item, weeks: body.weeks, history });
      await log("progress", result.usage);
      return NextResponse.json({ prescriptions: result.prescriptions, reason: result.reason });
    }
    const [method, clientContext] = await Promise.all([buildMethodContext(supabase), buildClientContext(supabase, program.client_id)]);
    const result = await suggestAlternatives({ exerciseName: body.item.name, exercises: method.exercises, clientContext });
    await log("alternatives", result.usage);
    return NextResponse.json({ alternatives: result.alternatives });
  } catch (e) {
    console.error("AI error", e);
    const msg = friendlyError(e, "L'assistente non ha risposto: riprova tra poco.");
    return NextResponse.json({ error: msg.length < 200 ? msg : "L'assistente non ha risposto correttamente. Riprova tra poco." }, { status: 502 });
  }
}
