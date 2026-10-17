/**
 * Bozze AI in coda: forma comune per server e browser (niente dati del
 * database qui dentro, solo la "vista" di una richiesta).
 */
import type { ProgramContent } from "@/lib/program/types";
import type { DraftAnswer, DraftQuestion } from "./program-draft";

/** Oltre questo tempo una richiesta "in preparazione" non ha più risposto (il server si ferma a 5 minuti). */
export const STALE_MS = 6 * 60 * 1000;

export type JobStatus = "working" | "questions" | "ready" | "failed" | "applied" | "discarded";

export type JobDraft = { summary: string; title: string; description: string; weeks: number; content: ProgramContent; notes: Record<string, string>; sessionMinutes: number | null };

export type JobView = {
  id: string;
  programId: string;
  clientId: string;
  clientName?: string;
  status: JobStatus;
  createdAt: string;
  finishedAt: string | null;
  instruction: string;
  answers: DraftAnswer[];
  baseUpdatedAt: string | null;
  questions?: DraftQuestion[];
  draft?: JobDraft;
  error?: string;
};

export type JobRow = {
  id: string;
  program_id: string;
  client_id: string;
  status: string;
  created_at: string;
  finished_at: string | null;
  base_updated_at: string | null;
  request: unknown;
  result: unknown;
  error: string | null;
};

export function jobView(r: JobRow, clientName?: string, now = Date.now()): JobView {
  const req = (r.request ?? {}) as { instruction?: string; answers?: DraftAnswer[] };
  const res = (r.result ?? null) as ({ questions?: DraftQuestion[] } & Partial<JobDraft>) | null;
  const stale = r.status === "working" && now - new Date(r.created_at).getTime() > STALE_MS;
  const status = (stale ? "failed" : r.status) as JobStatus;
  return {
    id: r.id,
    programId: r.program_id,
    clientId: r.client_id,
    clientName,
    status,
    createdAt: r.created_at,
    finishedAt: r.finished_at,
    instruction: req.instruction ?? "",
    answers: Array.isArray(req.answers) ? req.answers : [],
    baseUpdatedAt: r.base_updated_at,
    questions: status === "questions" ? res?.questions ?? [] : undefined,
    draft: status === "ready" && res?.content ? (res as JobDraft) : undefined,
    error: status === "failed" ? (stale ? "L'AI non ha risposto in tempo: riprova." : r.error ?? "Non riuscita: riprova.") : undefined,
  };
}

/** "Sto preparando… 1:20", "Pronta", … per il riquadro e l'editor. */
export function jobLabel(j: Pick<JobView, "status" | "createdAt">, now = Date.now()): string {
  if (j.status === "working") {
    const s = Math.max(0, Math.round((now - new Date(j.createdAt).getTime()) / 1000));
    return `In preparazione · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
  if (j.status === "questions") return "Ha qualche domanda";
  if (j.status === "ready") return "Pronta da rivedere";
  if (j.status === "failed") return "Non riuscita: riprova";
  return "";
}
