/**
 * Costanza del cliente: allenamenti registrati rispetto a quelli previsti
 * dal programma in corso, in una finestra di giorni.
 */
import { addDays, diffDays, type ISODate } from "./dates";

export type Compliance = { done: number; expected: number; pct: number | null; daysSinceLast: number | null };

export function compliance(opts: {
  today: ISODate;
  windowDays: number;
  sessionsPerWeek: number;
  programStart: ISODate | null;
  programEnd: ISODate | null;
  completedDates: ISODate[];
  lastLog: ISODate | null;
}): Compliance {
  const { today, windowDays, sessionsPerWeek, programStart, programEnd } = opts;
  const daysSinceLast = opts.lastLog ? diffDays(opts.lastLog, today) : null;
  if (!programStart || !programEnd || sessionsPerWeek <= 0) return { done: 0, expected: 0, pct: null, daysSinceLast };
  const from = [addDays(today, -(windowDays - 1)), programStart].sort().at(-1)!;
  const to = [today, programEnd].sort()[0];
  const span = diffDays(from, to) + 1;
  if (span <= 0) return { done: 0, expected: 0, pct: null, daysSinceLast };
  const expected = Math.max(1, Math.round((span / 7) * sessionsPerWeek));
  const done = opts.completedDates.filter((d) => d >= from && d <= to).length;
  // nei primi giorni del programma non ha senso giudicare
  const pct = span < 7 ? null : Math.min(100, Math.round((done / expected) * 100));
  return { done, expected, pct, daysSinceLast };
}
