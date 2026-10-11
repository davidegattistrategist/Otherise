import "server-only";
/**
 * Check e formula delle pliche: la % di massa grassa salvata in ogni check è
 * calcolata con la formula di riferimento del cliente (vedi
 * referenceFormula in lib/body/skinfolds), così peso, grasso e magra restano
 * confrontabili. Va ricalcolata quando cambia un check o la formula.
 */
import type { ServerSupabase } from "../supabase/server";
import { ageOn, todayISO } from "../dates";
import { sortChecks } from "../check-order";
import {
  averagesOf,
  computeBodyComposition,
  protocolSites,
  referenceFormula,
  sumOf,
  type Formula,
  type Sex,
  type SkinfoldReadings,
  type SkinfoldSite,
} from "../body/skinfolds";

const FIELDS = "id, check_date, sequence, created_at, order_hint, skinfolds, weight_kg, age_years, skinfold_sum_mm, body_fat_pct, fat_mass_kg, lean_mass_kg, body_fat_formula";

type Row = {
  id: string;
  check_date: string | null;
  sequence: number | null;
  created_at: string;
  order_hint: string | null;
  skinfolds: unknown;
  weight_kg: number | null;
  age_years: number | null;
};

const eq = (a: number | string | null, b: number | null) => (a === null || b === null ? a === b : Number(a) === b);

/** Età da usare per un check: quella salvata, altrimenti dalla data di nascita. */
export function checkAge(c: { age_years: number | null; check_date: string | null }, birthDate: string | null): number | null {
  return c.age_years ?? ageOn(birthDate, c.check_date ?? todayISO());
}

/** Ricalcola % grasso, massa grassa e magra di tutti i check del cliente. */
export async function recomputeClientChecks(supabase: ServerSupabase, clientId: string): Promise<Formula | null> {
  const [{ data: client }, { data: rows }] = await Promise.all([
    supabase.from("clients").select("sex, birth_date, skinfold_formula").eq("id", clientId).maybeSingle(),
    supabase.from("checks").select(FIELDS).eq("client_id", clientId),
  ]);
  if (!client) return null;
  const sex = client.sex as Sex;
  const list = rows ?? [];
  const ref = referenceFormula(sex, list.map((c) => ({ averages: averagesOf(c.skinfolds as SkinfoldReadings) })), client.skinfold_formula);
  for (const c of list) {
    const readings = (c.skinfolds ?? {}) as SkinfoldReadings;
    const avg = averagesOf(readings);
    const comp = ref
      ? computeBodyComposition({ sex, age: checkAge(c, client.birth_date), weightKg: c.weight_kg === null ? null : Number(c.weight_kg), skinfolds: readings, formula: ref.id })
      : null;
    // con la formula scelta a mano un check senza le sue pliche resta senza %:
    // meglio un buco nel grafico che un punto calcolato in un altro modo
    const use = comp?.ok && !comp.fallback ? comp : null;
    const next = {
      skinfold_sum_mm: use ? use.sumMm : Object.keys(avg).length ? sumOf(avg, Object.keys(avg) as SkinfoldSite[]) : null,
      body_fat_pct: use ? use.bodyFatPct : null,
      fat_mass_kg: use ? use.fatMassKg : null,
      lean_mass_kg: use ? use.leanMassKg : null,
      body_fat_formula: use ? use.formula.id : null,
    };
    const same =
      eq(c.skinfold_sum_mm, next.skinfold_sum_mm) &&
      eq(c.body_fat_pct, next.body_fat_pct) &&
      eq(c.fat_mass_kg, next.fat_mass_kg) &&
      eq(c.lean_mass_kg, next.lean_mass_kg) &&
      c.body_fat_formula === next.body_fat_formula;
    if (!same) await supabase.from("checks").update(next).eq("id", c.id);
  }
  return ref;
}

/**
 * Per il modulo del check: formula di riferimento e pliche che l'ultima volta
 * non sono state prese (così il trainer lo vede subito).
 */
export async function foldContext(supabase: ServerSupabase, client: { id: string; sex: string; skinfold_formula: string | null }, excludeId?: string) {
  const { data } = await supabase.from("checks").select("id, check_date, sequence, created_at, order_hint, skinfolds").eq("client_id", client.id);
  const sex = client.sex as Sex;
  const list = sortChecks((data ?? []).filter((c) => c.id !== excludeId));
  const folds = list.map((c) => ({ averages: averagesOf(c.skinfolds as SkinfoldReadings) }));
  const ref = referenceFormula(sex, folds, client.skinfold_formula);
  const lastWithFolds = [...folds].reverse().find((f) => Object.keys(f.averages).length > 0);
  const lastMissing: SkinfoldSite[] = lastWithFolds ? protocolSites(sex).filter((s) => lastWithFolds.averages[s] === undefined) : [];
  return { ref, lastMissing };
}

export type { Row as CheckRow };
