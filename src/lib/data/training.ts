import "server-only";
/**
 * Letture per lo storico degli allenamenti di un cliente (staff): allenamenti
 * del programma con gli esercizi fatti, allenamenti liberi, sessioni PT legate.
 * I calcoli sono in src/lib/training-history.ts.
 */
import type { ServerSupabase } from "../supabase/server";
import { parseContent, flattenItems } from "../program/types";
import { buildHistory, type HistorySession } from "../training-history";
import type { ISODate } from "../dates";

export async function getTrainingHistory(supabase: ServerSupabase, clientId: string, since: ISODate): Promise<HistorySession[]> {
  const [logsRes, freeRes, ptRes] = await Promise.all([
    supabase
      .from("workout_logs")
      .select("id, program_id, week, day_id, performed_on, completed, notes, discomfort")
      .eq("client_id", clientId)
      .gte("performed_on", since)
      .order("performed_on", { ascending: false })
      .limit(500),
    supabase.from("free_workouts").select("id, kind, minutes, effort, performed_on, notes").eq("client_id", clientId).gte("performed_on", since).order("performed_on", { ascending: false }).limit(500),
    supabase.from("pt_sessions").select("source").eq("client_id", clientId).gte("session_date", since).not("source", "is", null),
  ]);
  const logs = logsRes.data ?? [];
  const logIds = logs.map((l) => l.id);
  const programIds = [...new Set(logs.map((l) => l.program_id))];
  const [exRes, progRes] = await Promise.all([
    logIds.length
      ? supabase.from("exercise_logs").select("workout_log_id, item_id, exercise_name, sets, result_text").in("workout_log_id", logIds).limit(5000)
      : Promise.resolve({ data: [] as Array<{ workout_log_id: string; item_id: string; exercise_name: string; sets: unknown; result_text: string }> }),
    programIds.length ? supabase.from("programs").select("id, title, content").in("id", programIds) : Promise.resolve({ data: [] as Array<{ id: string; title: string; content: unknown }> }),
  ]);
  const itemOrder = new Map<string, number>();
  const programs = (progRes.data ?? []).map((p) => {
    const content = parseContent(p.content);
    flattenItems(content).forEach((f, i) => {
      if (!itemOrder.has(f.item.id)) itemOrder.set(f.item.id, i);
    });
    return {
      id: p.id,
      title: p.title,
      days: content.days.map((d) => ({ id: d.id, title: d.title, items: d.blocks.reduce((n, b) => n + b.items.filter((it) => it.name.trim()).length, 0) })),
    };
  });
  return buildHistory({
    logs,
    exercises: exRes.data ?? [],
    programs,
    free: freeRes.data ?? [],
    ptSources: (ptRes.data ?? []).map((p) => p.source).filter((s): s is string => Boolean(s)),
    itemOrder,
  });
}
