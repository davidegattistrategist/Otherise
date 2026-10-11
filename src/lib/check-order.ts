/**
 * Ordine dei check, dal più vecchio:
 * 1. lo storico importato senza data (Check 1, 2… colonna `sequence`);
 * 2. tutti gli altri per data. Un check storico senza data ma di cui si sa il
 *    periodo ha `order_hint` (una data che serve solo a metterlo al suo posto,
 *    non si mostra e non entra nei grafici).
 */
import { formatShort } from "./dates";

type Orderable = { check_date: string | null; sequence?: number | null; created_at?: string; order_hint?: string | null };

const when = (c: Orderable) => c.check_date ?? c.order_hint ?? null;

export function compareChecks(a: Orderable, b: Orderable): number {
  const wa = when(a);
  const wb = when(b);
  const ga = wa ? 1 : 0;
  const gb = wb ? 1 : 0;
  if (ga !== gb) return ga - gb;
  if (ga === 0) {
    const sa = a.sequence ?? Number.MAX_SAFE_INTEGER;
    const sb = b.sequence ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
  } else {
    const d = (wa ?? "").localeCompare(wb ?? "");
    if (d) return d;
  }
  return (a.created_at ?? "").localeCompare(b.created_at ?? "");
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
