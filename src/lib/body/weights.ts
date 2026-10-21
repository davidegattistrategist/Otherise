/**
 * Peso giorno per giorno (facoltativo, lo scrive il cliente in Progressi).
 * Il peso del singolo giorno oscilla (acqua, sale, carboidrati, ciclo): conta
 * l'andamento, quindi si guarda soprattutto la media degli ultimi 7 giorni.
 * Funzioni pure: le usano la pagina del cliente, quella dello staff e l'AI.
 */
import { addDays, diffDays, isISODate, type ISODate } from "../dates";

export type WeightEntry = { date: ISODate; kg: number };

export const MIN_KG = 25;
export const MAX_KG = 400;
/** Giorni della media mobile. */
export const AVERAGE_DAYS = 7;

/** "63,95" o "63.95" o "64 kg" → 63.95 (due decimali); null se non è un peso plausibile. */
export function parseKg(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().replace(/\s*kg$/i, "").replace(",", ".");
  if (!/^\d{1,3}(\.\d+)?$/.test(s)) return null;
  const n = Math.round(Number(s) * 100) / 100;
  return n >= MIN_KG && n <= MAX_KG ? n : null;
}

/** Una pesata per giorno, in ordine di data (se due hanno la stessa data vale l'ultima). */
export function normalizeWeights(rows: Array<{ date?: string | null; log_date?: string | null; kg: number | string | null }>): WeightEntry[] {
  const byDate = new Map<ISODate, number>();
  for (const r of rows) {
    const date = r.date ?? r.log_date ?? null;
    const kg = parseKg(r.kg);
    if (!isISODate(date) || kg === null) continue;
    byDate.set(date, kg);
  }
  return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, kg]) => ({ date, kg }));
}

/** Media delle pesate nei `days` giorni che finiscono il giorno `end` (compreso); null se non ce ne sono. */
export function averageUntil(entries: WeightEntry[], end: ISODate, days = AVERAGE_DAYS): number | null {
  const from = addDays(end, -(days - 1));
  const vals = entries.filter((e) => e.date >= from && e.date <= end).map((e) => e.kg);
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
}

/** Per ogni pesata, la media dei 7 giorni che finiscono quel giorno (la linea "andamento" del grafico). */
export function rollingAverage(entries: WeightEntry[], days = AVERAGE_DAYS): Array<{ date: ISODate; avg: number }> {
  return entries.map((e) => ({ date: e.date, avg: averageUntil(entries, e.date, days)! }));
}

export type WeightSummary = {
  last: WeightEntry;
  /** media degli ultimi 7 giorni fino all'ultima pesata */
  avg7: number;
  /** quante pesate in quei 7 giorni */
  count7: number;
  /** differenza con la media di 4 settimane prima (null se allora non ci sono pesate) */
  change28: number | null;
  /** l'ultima pesata è di più di 10 giorni fa */
  stale: boolean;
};

export function weightSummary(entries: WeightEntry[], today: ISODate): WeightSummary | null {
  if (!entries.length) return null;
  const last = entries[entries.length - 1];
  const avg7 = averageUntil(entries, last.date)!;
  const count7 = entries.filter((e) => e.date > addDays(last.date, -AVERAGE_DAYS) && e.date <= last.date).length;
  const before = averageUntil(entries, addDays(last.date, -28));
  return {
    last,
    avg7,
    count7,
    change28: before === null ? null : Math.round((avg7 - before) * 100) / 100,
    stale: diffDays(last.date, today) > 10,
  };
}

/** Le pesate degli ultimi `days` giorni (null = tutte). */
export function lastDays(entries: WeightEntry[], days: number | null, today: ISODate): WeightEntry[] {
  if (days === null) return entries;
  const from = addDays(today, -(days - 1));
  return entries.filter((e) => e.date >= from);
}

/** Riga per l'assistente AI: andamento del peso, senza date esatte superflue. */
export function weightTrendText(entries: WeightEntry[], today: ISODate): string {
  const s = weightSummary(entries, today);
  if (!s) return "";
  const kg = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 1 });
  const parts = [`media degli ultimi 7 giorni ${kg(s.avg7)} kg (${s.count7} pesate, l'ultima il ${s.last.date})`];
  if (s.change28 !== null) parts.push(`${s.change28 > 0 ? "+" : s.change28 < 0 ? "−" : ""}${kg(Math.abs(s.change28))} kg rispetto a 4 settimane prima`);
  return `Peso giornaliero scritto dal cliente: ${parts.join(", ")}.`;
}
