import "server-only";
/**
 * Dati per la pagina del logbook di una sessione: la giornata del programma,
 * quello che è già registrato, l'ultima volta per ogni esercizio, i record
 * e i massimali (per le prescrizioni in % del massimale).
 */
import type { ServerSupabase } from "../supabase/server";
import { addDays, formatShort, todayISO } from "../dates";
import { parseContent, type ProgramDay } from "../program/types";
import { summarizeSets, type SetLog } from "../program/prescription";
import { computeRecords } from "../strength/records";
import { getVideoMap } from "./me";

export type SessionData = {
  program: { id: string; client_id: string; title: string; weeks: number; status: string };
  week: number;
  day: ProgramDay;
  today: string;
  initial: { performedOn: string; completed: boolean; notes: string; discomfort: string; items: Record<string, { sets: SetLog[]; resultText: string }>; updatedAt: string | null };
  last: Record<string, { date: string; summary: string }>;
  lastSets: Record<string, SetLog[]>;
  records: Record<string, { e1rm: number | null; heaviest: number }>;
  maxes: Record<string, number>;
  videos: Record<string, string>;
};

const key = (name: string) => name.trim().toLowerCase();

export async function loadSession(supabase: ServerSupabase, programId: string, weekStr: string, dayId: string, viewer: "client" | "staff"): Promise<SessionData | null> {
  if (!/^[0-9a-f-]{36}$/i.test(programId)) return null;
  const { data: program } = await supabase.from("programs").select("id, client_id, title, weeks, status, content").eq("id", programId).maybeSingle();
  const week = Number(weekStr);
  if (!program?.client_id || program.status === "draft" || !Number.isInteger(week) || week < 1 || week > program.weeks) return null;
  const content = parseContent(program.content);
  const day = content.days.find((d) => d.id === dayId);
  if (!day) return null;
  const today = todayISO();
  const cid = program.client_id;

  const { data: log } = await supabase.from("workout_logs").select("id, performed_on, completed, notes, discomfort, updated_at").eq("program_id", programId).eq("week", week).eq("day_id", dayId).maybeSingle();
  const before = log?.performed_on ?? addDays(today, 1);
  const [{ data: exLogs }, { data: lastLogs }, { data: history }, checksRes, videos] = await Promise.all([
    log ? supabase.from("exercise_logs").select("item_id, sets, result_text").eq("workout_log_id", log.id) : Promise.resolve({ data: [] as Array<{ item_id: string; sets: unknown; result_text: string }> }),
    supabase.rpc("last_exercise_logs", { cid, before_date: before }),
    supabase.from("exercise_logs").select("exercise_name, exercise_id, performed_on, sets, workout_log_id").eq("client_id", cid).lt("performed_on", before).order("performed_on", { ascending: false }).limit(1500),
    viewer === "staff"
      ? supabase.from("checks").select("check_date, strength_tests").eq("client_id", cid).not("check_date", "is", null).order("check_date", { ascending: true })
      : supabase.rpc("my_checks"),
    getVideoMap(),
  ]);

  const items: SessionData["initial"]["items"] = {};
  for (const l of exLogs ?? []) items[l.item_id] = { sets: (l.sets as SetLog[]) ?? [], resultText: l.result_text };

  const last: SessionData["last"] = {};
  const lastSets: SessionData["lastSets"] = {};
  for (const l of lastLogs ?? []) {
    if (log && l.performed_on === log.performed_on) continue;
    const sets = (l.sets as unknown as SetLog[]) ?? [];
    const summary = summarizeSets(sets) ?? l.result_text;
    if (!summary) continue;
    const entry = { date: l.performed_on, summary: `${summary} · ${formatShort(l.performed_on)}` };
    for (const k of [l.exercise_id, key(l.exercise_name)].filter(Boolean) as string[]) {
      last[k] = entry;
      if (sets.length) lastSets[k] = sets;
    }
  }

  const rec = computeRecords((history ?? []).filter((h) => !log || h.workout_log_id !== log.id));
  const records: SessionData["records"] = {};
  for (const [k, r] of rec) records[k] = { e1rm: r.e1rm, heaviest: r.heaviest };

  // massimali: test dei check (più recenti) e, in mancanza, il massimale stimato dal logbook
  const maxes: Record<string, number> = {};
  for (const [k, r] of rec) if (r.e1rm) maxes[k] = r.e1rm;
  for (const c of (checksRes.data ?? []) as Array<{ strength_tests: unknown }>) {
    for (const t of (c.strength_tests as Array<{ exercise?: string; e1rm?: number | null }> | null) ?? []) {
      if (t.exercise && t.e1rm) maxes[key(t.exercise)] = Number(t.e1rm);
    }
  }

  return {
    program: { id: program.id, client_id: cid, title: program.title, weeks: program.weeks, status: program.status },
    week,
    day,
    today,
    initial: { performedOn: log?.performed_on ?? today, completed: log?.completed ?? false, notes: log?.notes ?? "", discomfort: log?.discomfort ?? "", items, updatedAt: log?.updated_at ?? null },
    last,
    lastSets,
    records,
    maxes,
    videos,
  };
}
