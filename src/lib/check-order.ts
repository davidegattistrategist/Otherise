/**
 * Ordine dei check: prima lo storico importato (Check 1, 2… anche senza
 * data, colonna `sequence`), poi quelli registrati nell'app, per data.
 */
import { formatShort } from "./dates";

type Orderable = { check_date: string | null; sequence?: number | null; created_at?: string };

export function compareChecks(a: Orderable, b: Orderable): number {
  const ia = a.sequence != null ? 0 : 1;
  const ib = b.sequence != null ? 0 : 1;
  if (ia !== ib) return ia - ib;
  if (ia === 0 && a.sequence !== b.sequence) return (a.sequence ?? 0) - (b.sequence ?? 0);
  const d = (a.check_date ?? "").localeCompare(b.check_date ?? "");
  return d || (a.created_at ?? "").localeCompare(b.created_at ?? "");
}

/** Dal più vecchio al più recente. */
export function sortChecks<T extends Orderable>(list: T[]): T[] {
  return [...list].sort(compareChecks);
}

/** "12 mar" oppure "Check 3 (senza data)". */
export function checkLabel(c: Orderable, refYear?: number): string {
  if (c.check_date) return formatShort(c.check_date, refYear);
  return c.sequence ? `Check ${c.sequence} (senza data)` : "Check senza data";
}
