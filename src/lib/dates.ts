/**
 * Date "di calendario" (senza ore) nel fuso orario italiano.
 * Tutte le date dell'app sono stringhe ISO "AAAA-MM-GG": così non ci sono
 * sorprese con i fusi orari (il server di Vercel lavora in UTC).
 */

export const TIME_ZONE = "Europe/Rome";

export type ISODate = string; // "2026-10-09"

/** La data di oggi in Italia, come "AAAA-MM-GG". */
export function todayISO(now: Date = new Date()): ISODate {
  // en-CA formatta come AAAA-MM-GG
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function parts(d: ISODate): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) throw new Error(`Data non valida: ${d}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function toUTC(d: ISODate): number {
  const [y, m, day] = parts(d);
  return Date.UTC(y, m - 1, day);
}

function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

/** L'ora (0-23) in Italia in questo momento. */
export function romeHour(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(now));
}

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = parts(s);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromUTC(toUTC(d) + n * 86_400_000);
}

/** Aggiunge mesi tenendo il giorno; se il mese è più corto si ferma all'ultimo giorno (31 gen + 1 mese = 28/29 feb). */
export function addMonths(d: ISODate, n: number): ISODate {
  const [y, m, day] = parts(d);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return fromUTC(target.getTime());
}

/** Giorni da a → b (positivo se b è dopo a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
}

/** 1 = lunedì … 7 = domenica */
export function isoWeekday(d: ISODate): number {
  const wd = new Date(toUTC(d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function mondayOf(d: ISODate): ISODate {
  return addDays(d, 1 - isoWeekday(d));
}

export function ageOn(birthDate: ISODate | null | undefined, on: ISODate): number | null {
  if (!birthDate) return null;
  const [by, bm, bd] = parts(birthDate);
  const [y, m, d] = parts(on);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age;
}

/** È il compleanno? Chi è nato il 29 febbraio lo festeggia il 28 negli anni non bisestili. */
export function isBirthday(birthDate: ISODate | null | undefined, on: ISODate): boolean {
  if (!birthDate) return false;
  const [, bm, bd] = parts(birthDate);
  const [y, m, d] = parts(on);
  if (m === bm && d === bd) return true;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return bm === 2 && bd === 29 && !leap && m === 2 && d === 28;
}

const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const MONTHS_LONG = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const DAYS = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
const DAYS_LONG = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];

/** "9 ott" oppure "9 ott 2025" se l'anno è diverso da quello di riferimento */
export function formatShort(d: ISODate | null | undefined, refYear?: number): string {
  if (!d) return "";
  const [y, m, day] = parts(d);
  const showYear = refYear !== undefined && y !== refYear;
  return `${day} ${MONTHS[m - 1]}${showYear ? ` ${y}` : ""}`;
}

/** "9 ottobre 2026" */
export function formatLong(d: ISODate | null | undefined): string {
  if (!d) return "";
  const [y, m, day] = parts(d);
  return `${day} ${MONTHS_LONG[m - 1]} ${y}`;
}

/** "18 ottobre" (senza anno) */
export function formatDayMonth(d: ISODate | null | undefined): string {
  if (!d) return "";
  const [, m, day] = parts(d);
  return `${day} ${MONTHS_LONG[m - 1]}`;
}

/** "ven 9 ott" */
export function formatWithWeekday(d: ISODate | null | undefined): string {
  if (!d) return "";
  return `${DAYS[isoWeekday(d) - 1]} ${formatShort(d)}`;
}

/** "Venerdì 9 ottobre" */
export function formatHeading(d: ISODate): string {
  const [, m, day] = parts(d);
  const wd = DAYS_LONG[isoWeekday(d) - 1];
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${day} ${MONTHS_LONG[m - 1]}`;
}

/** "12/01/2027" */
export function formatNumeric(d: ISODate | null | undefined): string {
  if (!d) return "";
  const [y, m, day] = parts(d);
  return `${String(day).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}
