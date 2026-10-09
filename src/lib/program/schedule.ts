/**
 * Calendario di un programma: settimana in corso, fine fase, prossima sessione.
 * Il cliente non è legato ai giorni della settimana: la "prossima sessione"
 * è il primo giorno non ancora registrato nella settimana in corso.
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
