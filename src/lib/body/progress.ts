/**
 * Dati dei check pronti per grafici e confronti (staff, modalità check e
 * cliente): un punto per check con peso, massa grassa in % e in kg, massa
 * magra, pliche (media di ogni sito) e circonferenze. Funzioni pure (testate
 * in lib.test.ts).
 */
import type { ISODate } from "../dates";
import { CIRCUMFERENCES, SKINFOLD_SITES, sumOf, type SkinfoldAverages, type SkinfoldSite } from "./skinfolds";

export type BodyPoint = {
  id: string;
  /** null = check importato senza data (non va nei grafici, sì nei confronti) */
  date: ISODate | null;
  /** "3 set", "Check 2 (senza data)" */
  label: string;
  weight: number | null;
  fatPct: number | null;
  fatKg: number | null;
  leanKg: number | null;
  folds: SkinfoldAverages;
  circ: Record<string, number>;
};

export type FormulaSeries = {
  id: string;
  label: string;
  /** quella di riferimento del cliente (i numeri dei check) */
  ref: boolean;
  /** per check: % di grasso, kg di grasso, kg di massa magra */
  values: Record<string, { pct: number | null; kg: number | null; lean: number | null }>;
};

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** Circonferenze lette dal database (solo numeri validi). */
export function circOf(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries((raw as Record<string, unknown> | null) ?? {})) {
    const n = num(v);
    if (n !== null && n > 0) out[k] = n;
  }
  return out;
}

export { num as toNumber };

export type Delta = { from: number; to: number; diff: number; fromLabel: string };

/** Da dove a dove: dal primo check che ha il dato all'ultimo che ce l'ha (non dal primo in assoluto). */
export function firstToLast(points: BodyPoint[], get: (p: BodyPoint) => number | null): Delta | null {
  const withValue = points.filter((p) => p.date && get(p) !== null);
  if (withValue.length < 2) return null;
  const a = withValue[0];
  const b = withValue[withValue.length - 1];
  return { from: get(a)!, to: get(b)!, diff: round(get(b)! - get(a)!), fromLabel: a.label };
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Pliche con almeno un valore, nell'ordine del protocollo. */
export function foldSitesIn(points: BodyPoint[]): SkinfoldSite[] {
  return SKINFOLD_SITES.map((s) => s.key).filter((k) => points.some((p) => p.folds[k] !== undefined));
}

/** Circonferenze con almeno un valore, nell'ordine del modulo. */
export function circKeysIn(points: BodyPoint[]): string[] {
  return CIRCUMFERENCES.map((c) => c.key as string).filter((k) => points.some((p) => p.circ[k] !== undefined));
}

/** Somma delle pliche indicate, solo se il check le ha tutte. */
export function foldSum(p: BodyPoint, sites: SkinfoldSite[]): number | null {
  return sites.length && sites.every((s) => p.folds[s] !== undefined) ? sumOf(p.folds, sites) : null;
}

/**
 * Per i colori del confronto: cosa è un buon segno. Grasso e pliche giù, massa
 * magra su; peso e circonferenze dipendono dall'obiettivo (nessun colore).
 */
export type Better = "down" | "up" | null;

export type CompareRow = { key: string; label: string; unit: string; digits: number; a: number | null; b: number | null; diff: number | null; better: Better; group: "corpo" | "pliche" | "cm" };

/** Righe del confronto tra due check (a = prima, b = dopo). */
export function compareRows(a: BodyPoint, b: BodyPoint, sumSites: SkinfoldSite[]): CompareRow[] {
  const row = (key: string, label: string, unit: string, digits: number, va: number | null, vb: number | null, better: Better, group: CompareRow["group"]): CompareRow => ({
    key, label, unit, digits, a: va, b: vb, diff: va !== null && vb !== null ? round(vb - va) : null, better, group,
  });
  const rows: CompareRow[] = [
    row("weight", "Peso", "kg", 1, a.weight, b.weight, null, "corpo"),
    row("fatPct", "Massa grassa", "%", 1, a.fatPct, b.fatPct, "down", "corpo"),
    row("fatKg", "Massa grassa", "kg", 1, a.fatKg, b.fatKg, "down", "corpo"),
    row("leanKg", "Massa magra", "kg", 1, a.leanKg, b.leanKg, "up", "corpo"),
  ];
  const sites = foldSitesIn([a, b]);
  if (sites.length) {
    rows.push(row("sum", "Somma pliche", "mm", 1, foldSum(a, sumSites), foldSum(b, sumSites), "down", "pliche"));
    for (const s of sites) rows.push(row(`f:${s}`, SKINFOLD_SITES.find((x) => x.key === s)!.label, "mm", 1, a.folds[s] ?? null, b.folds[s] ?? null, "down", "pliche"));
  }
  for (const k of circKeysIn([a, b])) rows.push(row(`c:${k}`, CIRCUMFERENCES.find((c) => c.key === k)!.label, "cm", 1, a.circ[k] ?? null, b.circ[k] ?? null, null, "cm"));
  // via le righe vuote in entrambi i check
  return rows.filter((r) => r.a !== null || r.b !== null);
}

/** Il confronto di partenza: penultimo e ultimo check (o l'unico). */
export function defaultPair(points: BodyPoint[], opts: { withFolds?: boolean } = {}): [string, string] | null {
  if (!points.length) return null;
  // per la composizione corporea: gli ultimi due check con le pliche (un check di solo peso non serve)
  const usable = opts.withFolds ? points.filter((p) => Object.keys(p.folds).length) : [];
  const list = usable.length >= 2 ? usable : points;
  const last = list[list.length - 1].id;
  return [list.length > 1 ? list[list.length - 2].id : last, last];
}

/** Pliche prese in tutti i check che ne hanno (per una somma confrontabile). */
export function sitesInAll(points: BodyPoint[]): SkinfoldSite[] {
  const withFolds = points.filter((p) => Object.keys(p.folds).length);
  return foldSitesIn(withFolds).filter((s) => withFolds.every((p) => p.folds[s] !== undefined));
}
