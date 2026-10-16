/**
 * Storico degli allenamenti di un cliente, per lo staff: quelli del programma
 * (con cosa ha fatto, esercizio per esercizio) e quelli liberi, in un'unica
 * lista dal più recente; allenamenti per settimana e costanza.
 * Solo calcoli: le letture sono in src/lib/data/training.ts.
 */
import { addDays, diffDays, mondayOf, type ISODate } from "./dates";
import { compliance } from "./compliance";
import { summarizeSets, type SetLog } from "./program/prescription";
import { freeKindLabel, freeWorkoutDetail } from "./free-workout";

export type HistoryExercise = { name: string; summary: string };

export type HistorySession =
  | {
      kind: "program";
      id: string;
      date: ISODate;
      completed: boolean;
      /** "Giorno 2 · Tirata e core" */
      title: string;
      /** "Fase 2 · Volume · settimana 3" */
      subtitle: string;
      programId: string;
      week: number;
      dayId: string;
      pt: boolean;
      exercises: HistoryExercise[];
      /** esercizi del giorno nel programma (per "6 di 8 esercizi") */
      planned: number;
      notes: string;
      discomfort: string;
    }
  | {
      kind: "free";
      id: string;
      date: ISODate;
      completed: true;
      /** "Spinning" */
      title: string;
      /** "45 min · duro" */
      subtitle: string;
      notes: string;
    };

type ProgramInfo = { id: string; title: string; days: Array<{ id: string; title: string; items: number }> };

export function buildHistory(input: {
  logs: Array<{ id: string; program_id: string; week: number; day_id: string; performed_on: ISODate; completed: boolean; notes: string; discomfort: string }>;
  exercises: Array<{ workout_log_id: string; item_id: string; exercise_name: string; sets: unknown; result_text: string }>;
  programs: ProgramInfo[];
  free: Array<{ id: string; kind: string; minutes: number | null; effort: number | null; performed_on: ISODate; notes: string }>;
  /** `source` delle sessioni PT legate a un allenamento: "programma:settimana:giorno" */
  ptSources: string[];
  /** ordine degli esercizi nel giorno (item_id → posizione), per mostrarli come nel programma */
  itemOrder?: Map<string, number>;
}): HistorySession[] {
  const programs = new Map(input.programs.map((p) => [p.id, p]));
  const pt = new Set(input.ptSources);
  const byLog = new Map<string, typeof input.exercises>();
  for (const e of input.exercises) {
    const arr = byLog.get(e.workout_log_id) ?? [];
    arr.push(e);
    byLog.set(e.workout_log_id, arr);
  }
  const out: HistorySession[] = [];
  for (const l of input.logs) {
    const p = programs.get(l.program_id);
    const day = p?.days.find((d) => d.id === l.day_id);
    const rows = [...(byLog.get(l.id) ?? [])].sort((a, b) => (input.itemOrder?.get(a.item_id) ?? 999) - (input.itemOrder?.get(b.item_id) ?? 999));
    const exercises = rows
      .map((e) => ({ name: e.exercise_name, summary: summarizeSets(e.sets as SetLog[]) ?? e.result_text.trim() }))
      .filter((e) => e.summary);
    out.push({
      kind: "program",
      id: l.id,
      date: l.performed_on,
      completed: l.completed,
      title: day?.title || "Allenamento del programma",
      subtitle: [p?.title, `settimana ${l.week}`].filter(Boolean).join(" · "),
      programId: l.program_id,
      week: l.week,
      dayId: l.day_id,
      pt: pt.has(`${l.program_id}:${l.week}:${l.day_id}`),
      exercises,
      planned: day?.items ?? 0,
      notes: l.notes.trim(),
      discomfort: l.discomfort.trim(),
    });
  }
  for (const f of input.free) {
    out.push({ kind: "free", id: f.id, date: f.performed_on, completed: true, title: freeKindLabel(f.kind), subtitle: freeWorkoutDetail(f), notes: f.notes.trim() });
  }
  // dal più recente; a parità di giorno prima quelli del programma
  return out.sort((a, b) => (a.date === b.date ? (a.kind === b.kind ? 0 : a.kind === "program" ? -1 : 1) : a.date < b.date ? 1 : -1));
}

export type WeekCount = { week: ISODate; program: number; free: number };

/** Allenamenti per settimana (lunedì), ultime `weeks` settimane: del programma (chiusi) e liberi. */
export function weeklyCounts(sessions: HistorySession[], today: ISODate, weeks = 12): WeekCount[] {
  const first = addDays(mondayOf(today), -7 * (weeks - 1));
  const out: WeekCount[] = Array.from({ length: weeks }, (_, i) => ({ week: addDays(first, i * 7), program: 0, free: 0 }));
  for (const s of sessions) {
    if (!s.completed || s.date < first || s.date > today) continue;
    const b = out.find((w) => w.week === mondayOf(s.date));
    if (!b) continue;
    if (s.kind === "program") b.program++;
    else b.free++;
  }
  return out;
}

/** Media a settimana sulle ultime `n` settimane intere (esclusa quella in corso). */
export function weeklyAverage(counts: WeekCount[], n = 4, include: "program" | "all" = "all"): number {
  const full = counts.slice(0, -1).slice(-n);
  if (!full.length) return 0;
  const sum = full.reduce((s, w) => s + w.program + (include === "all" ? w.free : 0), 0);
  return Math.round((sum / full.length) * 10) / 10;
}

export type TrainingSummary = {
  thisWeek: { program: number; free: number };
  /** media a settimana delle ultime 4 settimane intere (programma + liberi) */
  average: number;
  /** allenamenti del programma fatti / previsti nelle ultime 2 settimane (null senza programma in corso o nei primi giorni) */
  consistency: { pct: number | null; done: number; expected: number; program: boolean };
  daysSinceLast: number | null;
  weeks: WeekCount[];
};

/** Il riassunto in cima allo storico: questa settimana, media, costanza, ultimo allenamento. */
export function trainingSummary(
  sessions: HistorySession[],
  today: ISODate,
  program: { start: ISODate; end: ISODate; daysPerWeek: number } | null,
  weeks = 12,
): TrainingSummary {
  const counts = weeklyCounts(sessions, today, weeks);
  const cur = counts[counts.length - 1];
  const last = sessions.find((s) => s.completed && s.date <= today)?.date ?? null;
  const c = compliance({
    today,
    windowDays: 14,
    sessionsPerWeek: program?.daysPerWeek ?? 0,
    programStart: program?.start ?? null,
    programEnd: program?.end ?? null,
    completedDates: sessions.filter((s) => s.kind === "program" && s.completed).map((s) => s.date),
    lastLog: last,
  });
  return {
    thisWeek: { program: cur.program, free: cur.free },
    average: weeklyAverage(counts, 4, "all"),
    consistency: { pct: c.pct, done: c.done, expected: c.expected, program: program !== null },
    daysSinceLast: last ? diffDays(last, today) : null,
    weeks: counts,
  };
}
