import { NextResponse, type NextRequest } from "next/server";
import { friendlyError } from "@/lib/friendly-error";
import { z } from "zod";
import { getMe } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { aiEnabled, askQuestions, progressRow, reviseProgram, suggestAlternatives, TIME_QUESTION, type AiUsage } from "@/lib/ai/claude";
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
    answers: z.array(z.object({ question: z.string().max(400), answer: z.string().trim().max(1000) })).max(5).default([]),
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

function monthStart() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

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

  // tetto di spesa mensile
  const [{ data: settings }, { data: spent }] = await Promise.all([
    supabase.from("app_settings").select("ai_monthly_budget_eur").maybeSingle(),
    supabase.from("ai_requests").select("cost_eur").gte("created_at", monthStart()),
  ]);
  const budget = Number(settings?.ai_monthly_budget_eur ?? 20);
  const used = (spent ?? []).reduce((a, r) => a + Number(r.cost_eur), 0);
  if (used >= budget) {
    return NextResponse.json({ error: `Raggiunto il tetto di spesa AI del mese (${budget.toFixed(0)} €). Si può alzare in Impostazioni.` }, { status: 429 });
  }

  const log = async (kind: string, usage: AiUsage) => {
    await createAdminClient().from("ai_requests").insert({
      created_by: me.id, client_id: program.client_id, kind, model: usage.model,
      input_tokens: usage.input, output_tokens: usage.output, cost_eur: Number(usage.costEur.toFixed(4)),
    });
  };

  try {
    if (body.mode === "questions" || body.mode === "revise") {
      const [method, clientContext, profile] = await Promise.all([
        buildMethodContext(supabase),
        buildClientContext(supabase, program.client_id, program.id, body.current.content, { start: program.start_date, weeks: body.current.weeks }),
        getAiProfile(supabase, program.client_id),
      ]);
      // tempo per seduta: quello del programma, altrimenti quello di riferimento del cliente
      let sessionMinutes = program.session_minutes ?? profile.session_minutes;
      if (body.mode === "questions") {
        const result = await askQuestions({ instruction: body.instruction, ...method, clientContext, current: body.current, sessionMinutes, images: body.images });
        await log("questions", result.usage);
        return NextResponse.json({ questions: result.questions });
      }
      const answers = body.answers.filter((a) => a.answer);
      const timeAnswer = answers.find((a) => a.question === TIME_QUESTION);
      const answeredMinutes = timeAnswer ? minutesFromAnswer(timeAnswer.answer) : null;
      if (answeredMinutes) sessionMinutes = answeredMinutes;
      const result = await reviseProgram({ instruction: body.instruction, ...method, clientContext, current: body.current, sessionMinutes, answers, images: body.images });
      await log("revise", result.usage);
      // il tempo detto dal trainer (risposta o richiesta) diventa il nuovo riferimento del cliente
      const newMinutes = answeredMinutes ?? (result.timeFromTrainer ? result.sessionMinutes : null);
      if (newMinutes && newMinutes !== profile.session_minutes) {
        await saveAiProfile(supabase, program.client_id, { session_minutes: newMinutes });
      }
      // nel programma lo mette l'editor (campo "Tempo per seduta"), che poi salva: niente conflitti di versione
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
