import { NextResponse, type NextRequest } from "next/server";
import { friendlyError } from "@/lib/friendly-error";
import { z } from "zod";
import { getMe } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { budgetExceeded, logAiRequest } from "@/lib/ai/budget";
import { aiEnabled, draftProgram, progressRow, suggestAlternatives, TIME_OPTIONS, TIME_QUESTION, type AiUsage } from "@/lib/ai/claude";
import { learnPending, learningContext, recordDraft } from "@/lib/ai/learn";
import { after } from "next/server";
import { minutesFromAnswer } from "@/lib/ai-profile";
import { getAiProfile, saveAiProfile } from "@/lib/data/ai-profile";
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
      const [method, learning, clientContext, profile] = await Promise.all([
        buildMethodContext(supabase),
        learningContext(supabase),
        buildClientContext(supabase, program.client_id, program.id, body.current.content, { start: program.start_date, weeks: body.current.weeks }),
        getAiProfile(supabase, program.client_id),
      ]);
      // tempo per seduta: quello del programma, altrimenti quello di riferimento del cliente
      let sessionMinutes = program.session_minutes ?? profile.session_minutes;
      // se non c'è, lo chiede l'app prima di tutto (senza spendere una chiamata all'AI)
      if (body.mode === "questions" && !sessionMinutes) {
        return NextResponse.json({ questions: [{ question: TIME_QUESTION, options: TIME_OPTIONS }] });
      }
      const answers = body.mode === "revise" ? body.answers.filter((a) => a.answer) : [];
      const timeAnswer = answers.find((a) => a.question === TIME_QUESTION);
      const answeredMinutes = timeAnswer ? minutesFromAnswer(timeAnswer.answer) : null;
      if (answeredMinutes) sessionMinutes = answeredMinutes;
      // l'AI può fare domande una volta sola, e non dopo "Salta le domande"
      const aiAlreadyAsked = body.mode === "revise" && body.answers.some((a) => a.question !== TIME_QUESTION);
      const allowQuestions = !(body.mode === "revise" && body.skip) && !aiAlreadyAsked;
      const result = await draftProgram({ instruction: body.instruction, ...method, ...learning, clientContext, current: body.current, sessionMinutes, answers, images: body.images }, allowQuestions);
      await log(result.kind === "questions" ? "questions" : "revise", result.usage);
      if (result.kind === "questions") return NextResponse.json({ questions: result.questions });
      // il tempo detto dal trainer (risposta o richiesta) diventa il nuovo riferimento del cliente
      const newMinutes = answeredMinutes ?? (result.timeFromTrainer ? result.sessionMinutes : null);
      if (newMinutes && newMinutes !== profile.session_minutes) {
        await saveAiProfile(supabase, program.client_id, { session_minutes: newMinutes });
      }
      // nel programma il tempo lo mette l'editor (campo "Tempo per seduta"), che poi salva: niente conflitti di versione
      // la bozza si conserva: alla pubblicazione si vede cosa hai corretto e l'AI impara
      await recordDraft(supabase, { programId: program.id, clientId: program.client_id, userId: me.id, content: result.content, instruction: body.instruction });
      // correzioni di programmi già pubblicati, ritoccati da almeno mezz'ora: diventano lezioni
      after(() => learnPending(me.id, { olderThanMinutes: 30 }));
      return NextResponse.json({
        summary: result.summary,
        title: result.title,
        description: result.description,
        weeks: result.weeks,
        content: result.content,
        notes: result.notes,
        sessionMinutes: newMinutes ?? sessionMinutes ?? null,
      });
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
