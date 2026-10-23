/**
 * Il check che stai scrivendo (modalità check), come punto dei grafici e dei
 * confronti: così in "Confronti" vedi subito le misure di oggi accanto a
 * quelle dei check salvati, anche se le scrive l'altro dispositivo.
 * Calcoli puri: nessun dato salvato, nessuna lettura dal database.
 */
import { ageOn, formatShort, type ISODate } from "../dates";
import { averagesOf, computeBodyComposition, protocolSites, type FormulaId, type Sex, type SkinfoldReadings } from "./skinfolds";
import type { BodyPoint, FormulaSeries } from "./progress";

/** id del punto "in corso" (non è un check salvato) */
export const LIVE_POINT_ID = "check-in-corso";

/** Le misure come stanno nel modulo del check (testi, con la virgola). */
export type LiveCheckInput = {
  check_date: string;
  weight: string;
  sf: Record<string, string[]>;
  circ: Record<string, string>;
};

const parse = (s: string | undefined) => {
  if (!s || !s.trim()) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function readingsOf(input: LiveCheckInput, sex: Sex): SkinfoldReadings {
  const r: SkinfoldReadings = {};
  for (const s of protocolSites(sex)) r[s] = (input.sf[s] ?? []).map((v) => parse(v));
  return r;
}

type Comp = { pct: number | null; kg: number | null; lean: number | null };

function composition(sex: Sex, age: number | null, weight: number | null, readings: SkinfoldReadings, formula: FormulaId | null): Comp {
  if (!formula) return { pct: null, kg: null, lean: null };
  const r = computeBodyComposition({ sex, age, weightKg: weight, skinfolds: readings, formula });
  // come nei check salvati: senza le pliche della formula niente %, mai un'altra formula
  return r.ok && !r.fallback ? { pct: r.bodyFatPct, kg: r.fatMassKg, lean: r.leanMassKg } : { pct: null, kg: null, lean: null };
}

/**
 * Il punto del check in corso, o null se non c'è ancora nessuna misura.
 * `formula` = formula di riferimento del cliente (la % segue sempre quella).
 */
export function livePoint(input: LiveCheckInput, opts: { sex: Sex; birthDate: string | null; formula: FormulaId | null; today: ISODate }): BodyPoint | null {
  const date = (input.check_date || opts.today) as ISODate;
  const weight = parse(input.weight);
  const readings = readingsOf(input, opts.sex);
  const folds = averagesOf(readings);
  const circ: Record<string, number> = {};
  for (const [k, v] of Object.entries(input.circ ?? {})) {
    const n = parse(v);
    if (n !== null) circ[k] = n;
  }
  if (weight === null && !Object.keys(folds).length && !Object.keys(circ).length) return null;
  const comp = composition(opts.sex, ageOn(opts.birthDate, date), weight, readings, opts.formula);
  const year = Number(opts.today.slice(0, 4));
  return {
    id: LIVE_POINT_ID,
    date,
    label: `${date === opts.today ? "Oggi" : formatShort(date, year)} · in corso`,
    weight,
    fatPct: comp.pct,
    fatKg: comp.kg,
    leanKg: comp.lean,
    folds,
    circ,
  };
}

/**
 * Punti e formule dei check salvati più il check in corso (in fondo, ordinato
 * per data come gli altri). Le serie delle formule ricevono anche il valore di oggi.
 */
export function withLiveCheck(
  points: BodyPoint[],
  formulas: FormulaSeries[],
  input: LiveCheckInput | null,
  opts: { sex: Sex; birthDate: string | null; formula: FormulaId | null; today: ISODate },
): { points: BodyPoint[]; formulas: FormulaSeries[] } {
  const point = input ? livePoint(input, opts) : null;
  if (!point || !input) return { points, formulas };
  const readings = readingsOf(input, opts.sex);
  const age = ageOn(opts.birthDate, point.date!);
  // i check senza data restano davanti, quelli con data in ordine: il check in corso va dopo quelli fino a oggi
  const after = points.findIndex((p) => p.date !== null && p.date > point.date!);
  const list = after === -1 ? [...points, point] : [...points.slice(0, after), point, ...points.slice(after)];
  return {
    points: list,
    formulas: formulas.map((f) => ({ ...f, values: { ...f.values, [LIVE_POINT_ID]: composition(opts.sex, age, point.weight, readings, f.id as FormulaId) } })),
  };
}
