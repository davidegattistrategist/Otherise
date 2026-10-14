import "server-only";
/** Andamento degli esercizi e degli allenamenti per i grafici di cliente e staff. */
import type { ServerSupabase } from "../supabase/server";
import { addDays, mondayOf, todayISO } from "../dates";
import { bestSet, computeRecords, recordsFromRows } from "../strength/records";
import type { SetLog } from "../program/prescription";

import type { ExerciseSeries } from "./progress-types";
export type { ExerciseSeries };

export async function getExerciseProgress(supabase: ServerSupabase, clientId: string): Promise<ExerciseSeries[]> {
  // dal database: il migliore di ogni esercizio giorno per giorno e i record (poche righe invece di tutto il logbook)
  const since = addDays(todayISO(), -365);
  const [daily, bests] = await Promise.all([supabase.rpc("exercise_daily_best", { cid: clientId, since }), supabase.rpc("exercise_bests", { cid: clientId })]);
  if (!daily.error && daily.data && !bests.error && bests.data) {
    const records = recordsFromRows(bests.data);
    const by = new Map<string, ExerciseSeries>();
    for (const d of daily.data) {
      const key = d.name.trim().toLowerCase();
      const s = by.get(key) ?? { key, name: d.name, sessions: 0, points: [], record: records.get(key) ?? null };
      s.points.push({ date: d.performed_on, value: Number(d.e1rm) });
      s.sessions += d.logs;
      by.set(key, s);
    }
    return [...by.values()].filter((s) => s.points.length >= 2).sort((a, b) => b.sessions - a.sessions);
  }
  return exerciseProgressFromLogs(supabase, clientId);
}

/** Il modo di prima (se la funzione del database non c'è ancora). */
async function exerciseProgressFromLogs(supabase: ServerSupabase, clientId: string): Promise<ExerciseSeries[]> {
  const { data } = await supabase
    .from("exercise_logs")
    .select("exercise_name, performed_on, sets")
    .eq("client_id", clientId)
    .gte("performed_on", addDays(todayISO(), -365))
    .order("performed_on")
    .limit(1000);
  const logs = data ?? [];
  const records = computeRecords(logs);
  const by = new Map<string, ExerciseSeries>();
  for (const l of logs) {
    const b = bestSet(l.sets as unknown as SetLog[]);
    if (!b?.e1rm) continue;
    const key = l.exercise_name.trim().toLowerCase();
    const s = by.get(key) ?? { key, name: l.exercise_name, sessions: 0, points: [], record: records.get(key) ?? null };
    const last = s.points[s.points.length - 1];
    if (last && last.date === l.performed_on) last.value = Math.max(last.value, b.e1rm);
    else s.points.push({ date: l.performed_on, value: b.e1rm });
    s.sessions++;
    by.set(key, s);
  }
  return [...by.values()].filter((s) => s.points.length >= 2).sort((a, b) => b.sessions - a.sessions);
}

/** Allenamenti completati per settimana (lunedì → numero), ultime `weeks` settimane. */
export async function getWeeklySessions(supabase: ServerSupabase, clientId: string, weeks = 8) {
  const today = todayISO();
  const first = addDays(mondayOf(today), -7 * (weeks - 1));
  const { data } = await supabase.from("workout_logs").select("performed_on").eq("client_id", clientId).eq("completed", true).gte("performed_on", first);
  const out: Array<{ week: string; count: number }> = [];
  for (let i = 0; i < weeks; i++) out.push({ week: addDays(first, i * 7), count: 0 });
  for (const l of data ?? []) {
    const m = mondayOf(l.performed_on);
    const b = out.find((x) => x.week === m);
    if (b) b.count++;
  }
  return out;
}
