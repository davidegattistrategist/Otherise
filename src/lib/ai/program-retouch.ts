import "server-only";
/**
 * "Ritocca da qui": il server prepara il contesto (metodo, lezioni, cliente,
 * logbook di questa fase sugli esercizi scelti), chiede all'AI e tiene solo le
 * modifiche permesse (pezzo scelto, settimane scelte, mai quelle fatte).
 */
import type { ServerSupabase } from "@/lib/supabase/server";
import { logAiRequest } from "./budget";
import { retouchProgram } from "./claude";
import { learningContext } from "./learn";
import { buildClientContext, buildMethodContext } from "./context";
import { getAiProfile } from "@/lib/data/ai-profile";
import { doneWeeks } from "@/lib/program/locks";
import { sanitizeChanges, scopeItems, type RetouchChange, type RetouchScope } from "@/lib/program/retouch";
import { summarizeSets, type SetLog } from "@/lib/program/prescription";
import { swapFor, type ProgramContent } from "@/lib/program/types";

export type RetouchRequest = {
  current: { title: string; description: string; weeks: number; content: ProgramContent };
  scope: RetouchScope;
  from: number;
  to: number;
  reason: string;
};

export type RetouchOutcome = { summary: string; changes: RetouchChange[]; done: number };

export async function runRetouch(
  supabase: ServerSupabase,
  userId: string,
  program: { id: string; client_id: string; session_minutes: number | null; start_date: string | null },
  req: RetouchRequest,
): Promise<RetouchOutcome> {
  const { content, weeks } = req.current;
  const items = scopeItems(content, req.scope);
  if (!items.length) throw new Error("Non trovo gli esercizi da ritoccare: salva e riprova.");
  const ids = items.map((f) => f.item.id);
  const [method, learning, clientContext, profile, { data: logs }, { data: exLogs }] = await Promise.all([
    buildMethodContext(supabase),
    learningContext(supabase),
    buildClientContext(supabase, program.client_id, program.id, content, { start: program.start_date, weeks }),
    getAiProfile(supabase, program.client_id),
    supabase.from("workout_logs").select("id, week, day_id, completed, performed_on, notes, discomfort").eq("program_id", program.id),
    supabase.from("exercise_logs").select("workout_log_id, item_id, week, exercise_name, sets, result_text").eq("program_id", program.id).in("item_id", ids),
  ]);
  // le settimane fatte le decide il logbook vero, non il browser
  const done = doneWeeks(content, weeks, logs ?? []);
  const from = Math.max(1, done + 1, Math.round(req.from));
  const to = Math.min(weeks, Math.round(req.to));
  if (from > to) throw new Error(done >= weeks ? "Tutte le settimane di questa fase sono già fatte: non c'è niente da ritoccare." : "Scegli settimane che non sono ancora state fatte.");

  // logbook di questa fase, esercizio per esercizio, con la prescrizione accanto
  const byItemWeek = new Map((exLogs ?? []).map((l) => [`${l.item_id}:${l.week}`, l]));
  const lines: string[] = [];
  for (const f of items) {
    const weeksTxt: string[] = [];
    for (let w = 1; w <= weeks; w++) {
      const l = byItemWeek.get(`${f.item.id}:${w}`);
      if (!l) continue;
      const did = summarizeSets(l.sets as unknown as SetLog[]) ?? "";
      const note = (l.result_text ?? "").trim();
      const s = swapFor(f.item, w);
      weeksTxt.push(`S${w}${s ? ` (fatto ${s.name} al suo posto)` : ""}: programma ${f.item.prescriptions[w - 1] || "—"} → fatto ${[did, note ? `nota "${note}"` : ""].filter(Boolean).join(", ") || "segnato senza dati"}`);
    }
    lines.push(`- ${f.label} ${f.item.name} [id ${f.item.id}] (${f.dayTitle}): ${weeksTxt.length ? weeksTxt.join("; ") : "niente registrato"}`);
  }
  const dayIds = new Set(items.map((f) => f.dayId));
  const notes = (logs ?? [])
    .filter((l) => dayIds.has(l.day_id) && (l.notes?.trim() || l.discomfort?.trim()))
    .sort((a, b) => a.week - b.week)
    .map((l) => `- Settimana ${l.week}, ${content.days.find((d) => d.id === l.day_id)?.title ?? "allenamento"}: ${[l.notes?.trim() ? `"${l.notes.trim()}"` : "", l.discomfort?.trim() ? `fastidio: "${l.discomfort.trim()}"` : ""].filter(Boolean).join(" · ")}`);
  const logbook = [lines.join("\n"), notes.length ? `Note del cliente a fine allenamento:\n${notes.join("\n")}` : ""].filter(Boolean).join("\n\n");

  const scopeText =
    req.scope.kind === "program"
      ? "il programma (tutti gli esercizi che servono)"
      : req.scope.kind === "day"
        ? `gli esercizi del giorno "${items[0].dayTitle}"`
        : `l'esercizio "${items[0].item.name}" (id ${items[0].item.id}, ${items[0].dayTitle})`;
  const instruction = `Ritocca ${scopeText} dalla settimana ${from} alla ${to}. Motivo del trainer: ${req.reason.trim()}`;

  const result = await retouchProgram({
    instruction,
    ...method,
    ...learning,
    clientContext,
    current: req.current,
    sessionMinutes: program.session_minutes ?? profile.session_minutes,
    scopeText,
    from,
    to,
    done,
    logbook,
  });
  await logAiRequest(userId, program.client_id, "retouch", result.usage);
  // sostituto scritto per nome senza codice: lo si cerca nell'eserciziario
  const byName = new Map(method.exercises.map((e) => [e.name.trim().toLowerCase(), e.id]));
  const proposal = {
    summary: result.summary,
    changes: result.changes.map((c) => ({ ...c, swap: c.swap ? { ...c.swap, exerciseId: c.swap.exerciseId ?? byName.get(c.swap.name.trim().toLowerCase()) ?? null } : null })),
  };
  return { summary: proposal.summary, changes: sanitizeChanges(content, req.scope, proposal, { from, to, done, weeks }), done };
}
