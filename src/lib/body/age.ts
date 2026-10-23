/**
 * Età per la formula delle pliche quando manca la data di nascita: si prende
 * dall'età scritta nei check precedenti (per esempio quelli importati dai
 * fogli) più gli anni passati. Senza età la percentuale di grasso non si può
 * calcolare, e un check nuovo resterebbe senza % mentre i vecchi ce l'hanno.
 */
import { ageOn, diffDays, type ISODate } from "../dates";

export type KnownAge = { date: ISODate; age: number };

/** Le età già scritte nei check (con la data). */
export function knownAges(rows: Array<{ check_date: string | null; age_years: number | string | null }>): KnownAge[] {
  return rows
    .filter((r) => r.check_date && r.age_years !== null && Number.isFinite(Number(r.age_years)) && Number(r.age_years) > 0)
    .map((r) => ({ date: r.check_date as ISODate, age: Number(r.age_years) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Stima dall'età più vicina: l'ultima prima di quella data (o la prima dopo), più gli anni interi passati. */
export function estimateAge(known: KnownAge[], on: ISODate): number | null {
  if (!known.length) return null;
  const before = known.filter((k) => k.date <= on);
  const ref = before.length ? before[before.length - 1] : known[0];
  const years = diffDays(ref.date, on) / 365.25;
  const age = ref.age + (years >= 0 ? Math.floor(years) : Math.ceil(years));
  return age > 0 ? age : null;
}

/** Età a quella data: dalla data di nascita se c'è, altrimenti stimata dai check. */
export function ageAt(birthDate: string | null | undefined, on: ISODate, known: KnownAge[] = []): number | null {
  return ageOn(birthDate, on) ?? estimateAge(known, on);
}
