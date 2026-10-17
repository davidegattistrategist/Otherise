/**
 * Bozza del programma con l'AI (domande oppure programma), condivisa tra la
 * richiesta diretta e quella in coda (src/lib/ai/program-jobs.ts): stesso
 * contesto, stesse regole, stessi registri di spesa.
 */
import type { ServerSupabase } from "@/lib/supabase/server";
import { logAiRequest } from "./budget";
import { draftProgram, TIME_OPTIONS, TIME_QUESTION } from "./claude";
import { learningContext, recordDraft } from "./learn";
import { minutesFromAnswer } from "@/lib/ai-profile";
import { getAiProfile, saveAiProfile } from "@/lib/data/ai-profile";
import { buildClientContext, buildMethodContext } from "./context";
import type { ProgramContent } from "@/lib/program/types";

type DB = ServerSupabase;

export type DraftQuestion = { question: string; options: string[] };
export type DraftAnswer = { question: string; answer: string };
export type DraftImage = { mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string };

export type DraftInput = {
  mode: "questions" | "revise";
  instruction: string;
  current: { title: string; description: string; weeks: number; content: ProgramContent };
  images: DraftImage[];
  answers?: DraftAnswer[];
  skip?: boolean;
};

export type DraftOutcome =
  | { questions: DraftQuestion[] }
  | { summary: string; title: string; description: string; weeks: number; content: ProgramContent; notes: Record<string, string>; sessionMinutes: number | null };

export async function runProgramDraft(
  supabase: DB,
  userId: string,
  program: { id: string; client_id: string; session_minutes: number | null; start_date: string | null },
  body: DraftInput,
): Promise<DraftOutcome> {
  const [method, learning, clientContext, profile] = await Promise.all([
    buildMethodContext(supabase),
    learningContext(supabase),
    buildClientContext(supabase, program.client_id, program.id, body.current.content, { start: program.start_date, weeks: body.current.weeks }),
    getAiProfile(supabase, program.client_id),
  ]);
  // tempo per seduta: quello del programma, altrimenti quello di riferimento del cliente
  let sessionMinutes = program.session_minutes ?? profile.session_minutes;
  // se non c'è, lo chiede l'app prima di tutto (senza spendere una chiamata all'AI)
  if (body.mode === "questions" && !sessionMinutes) return { questions: [{ question: TIME_QUESTION, options: TIME_OPTIONS }] };
  const given = body.mode === "revise" ? body.answers ?? [] : [];
  const answers = given.filter((a) => a.answer);
  const timeAnswer = answers.find((a) => a.question === TIME_QUESTION);
  const answeredMinutes = timeAnswer ? minutesFromAnswer(timeAnswer.answer) : null;
  if (answeredMinutes) sessionMinutes = answeredMinutes;
  // l'AI può fare domande una volta sola, e non dopo "Salta le domande"
  const aiAlreadyAsked = body.mode === "revise" && given.some((a) => a.question !== TIME_QUESTION);
  const allowQuestions = !(body.mode === "revise" && body.skip) && !aiAlreadyAsked;
  const result = await draftProgram({ instruction: body.instruction, ...method, ...learning, clientContext, current: body.current, sessionMinutes, answers, images: body.images }, allowQuestions);
  await logAiRequest(userId, program.client_id, result.kind === "questions" ? "questions" : "revise", result.usage);
  if (result.kind === "questions") return { questions: result.questions };
  // il tempo detto dal trainer (risposta o richiesta) diventa il nuovo riferimento del cliente
  const newMinutes = answeredMinutes ?? (result.timeFromTrainer ? result.sessionMinutes : null);
  if (newMinutes && newMinutes !== profile.session_minutes) {
    await saveAiProfile(supabase, program.client_id, { session_minutes: newMinutes });
  }
  // la bozza si conserva: alla pubblicazione si vede cosa hai corretto e l'AI impara
  await recordDraft(supabase, { programId: program.id, clientId: program.client_id, userId, content: result.content, instruction: body.instruction });
  return {
    summary: result.summary,
    title: result.title,
    description: result.description,
    weeks: result.weeks,
    content: result.content,
    notes: result.notes,
    sessionMinutes: newMinutes ?? sessionMinutes ?? null,
  };
}
