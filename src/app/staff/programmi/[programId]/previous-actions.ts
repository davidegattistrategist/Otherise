"use server";

/**
 * Dati per il pannello "Fase precedente" dell'editor: si leggono solo quando
 * lo apri (l'editor non si appesantisce).
 */
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseContent } from "@/lib/program/types";
import { buildCompareView, previousPhases, type CompareView, type PhaseOption } from "@/lib/program/compare";

export type PreviousResult = { phases: PhaseOption[]; view: CompareView | null; error?: string };

export async function loadPreviousPhase(programId: string, otherId?: string): Promise<PreviousResult> {
  await requireStaff();
  const supabase = await createClient();
  const { data: cur } = await supabase.from("programs").select("id, client_id, start_date").eq("id", programId).maybeSingle();
  if (!cur?.client_id) return { phases: [], view: null, error: "Questo programma non è di un cliente." };
  const { data: list } = await supabase
    .from("programs")
    .select("id, title, start_date, weeks, status")
    .eq("client_id", cur.client_id)
    .eq("is_template", false)
    .in("status", ["published", "archived"])
    .limit(200);
  const { phases, defaultId } = previousPhases((list ?? []) as PhaseOption[], cur);
  const id = otherId && phases.some((p) => p.id === otherId) ? otherId : defaultId;
  if (!id) return { phases, view: null };
  const [{ data: prog }, { data: logs }] = await Promise.all([
    supabase.from("programs").select("id, title, weeks, start_date, content").eq("id", id).maybeSingle(),
    supabase.from("workout_logs").select("id, week, day_id, performed_on").eq("program_id", id).limit(1000),
  ]);
  if (!prog) return { phases, view: null, error: "Non trovo questa fase: riprova." };
  const ids = (logs ?? []).map((l) => l.id);
  const exLogs: Array<{ workout_log_id: string; item_id: string; sets: unknown; result_text: string }> = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from("exercise_logs").select("workout_log_id, item_id, sets, result_text").in("workout_log_id", ids.slice(i, i + 200)).limit(5000);
    exLogs.push(...(data ?? []));
  }
  return { phases, view: buildCompareView(prog, parseContent(prog.content), logs ?? [], exLogs) };
}
