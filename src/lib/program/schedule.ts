/**
 * Calendario di un programma: settimana in corso, fine fase, prossimo allenamento.
 * Il cliente non è legato ai giorni della settimana e gli allenamenti vanno fatti
 * in ordine: se ne salta uno, il prossimo è ancora quello (si "scala", non si salta).
 */
import { addDays, diffDays, type ISODate } from "../dates";
import type { ProgramContent } from "./types";

export function programEndDate(startDate: ISODate, weeks: number): ISODate {
  return addDays(startDate, weeks * 7 - 1);
}

export type WeekPosition =
  | { state: "not_started"; startsInDays: number }
  | { state: "running"; week: number }
  | { state: "finished"; endedDaysAgo: number };

export function weekPosition(startDate: ISODate, weeks: number, today: ISODate): WeekPosition {
  const d = diffDays(startDate, today);
  if (d < 0) return { state: "not_started", startsInDays: -d };
  const week = Math.floor(d / 7) + 1;
  if (week > weeks) return { state: "finished", endedDaysAgo: d - weeks * 7 + 1 };
  return { state: "running", week };
}

/** La settimana da mostrare: quella in corso, la prima se non è iniziato, l'ultima se è finito. */
export function displayWeek(startDate: ISODate | null, weeks: number, today: ISODate): number {
  if (!startDate) return 1;
  const p = weekPosition(startDate, weeks, today);
  if (p.state === "running") return p.week;
  return p.state === "not_started" ? 1 : weeks;
}

export type LoggedDay = { week: number; day_id: string; completed: boolean };

/** Primo giorno della settimana non ancora completato (null se la settimana è finita). */
export function nextDay(content: ProgramContent, week: number, logs: LoggedDay[]) {
  const done = new Set(logs.filter((l) => l.week === week && l.completed).map((l) => l.day_id));
  const idx = content.days.findIndex((d) => !done.has(d.id));
  if (idx === -1) return null;
  return { day: content.days[idx], index: idx };
}

/**
 * Prossimo allenamento in sequenza: il primo giorno non completato, settimana dopo
 * settimana (null se la fase è tutta fatta). Se il cliente è indietro rispetto al
 * calendario continua da dove era rimasto.
 */
export function nextWorkout(content: ProgramContent, weeks: number, logs: LoggedDay[]) {
  if (!content.days.length) return null;
  const done = new Set(logs.filter((l) => l.completed).map((l) => `${l.week}:${l.day_id}`));
  for (let w = 1; w <= weeks; w++) {
    const idx = content.days.findIndex((d) => !done.has(`${w}:${d.id}`));
    if (idx !== -1) return { week: w, day: content.days[idx], index: idx };
  }
  return null;
}

export function completedCount(content: ProgramContent, logs: LoggedDay[], uptoWeek: number) {
  const ids = new Set(content.days.map((d) => d.id));
  return logs.filter((l) => l.completed && l.week <= uptoWeek && ids.has(l.day_id)).length;
}

/** Percentuale di avanzamento del programma in base al tempo trascorso (0–100). */
export function timeProgress(startDate: ISODate, weeks: number, today: ISODate): number {
  const total = weeks * 7;
  const d = Math.min(Math.max(diffDays(startDate, today) + 1, 0), total);
  return Math.round((d / total) * 100);
}

/**
 * Il programma "in corso" di un cliente: il pubblicato iniziato più di
 * recente; se nessuno è ancora iniziato, il prossimo che parte (con
 * `upcoming: false` in quel caso nessuno). Unica regola per tutte le pagine.
 */
export function currentProgram<T extends { status: string; start_date: string | null }>(programs: readonly T[], today: ISODate, opts: { upcoming?: boolean } = {}): T | null {
  const published = programs.filter((p) => p.status === "published" && p.start_date).sort((a, b) => b.start_date!.localeCompare(a.start_date!));
  const started = published.find((p) => p.start_date! <= today);
  if (started) return started;
  return opts.upcoming === false ? null : published[published.length - 1] ?? null;
}
