/**
 * Plicometria: composizione corporea dalle pliche (Jackson-Pollock + Siri).
 *
 * Non sempre si riescono a prendere tutte le pliche (coscia con ritenzione,
 * addome, ascellare…). Per questo ci sono più formule validate e si usa la
 * più completa possibile con le pliche rilevate:
 *   Uomo  7 pliche · 3 pliche petto-tricipite-sottoscapolare · 3 pliche petto-addome-coscia
 *   Donna 5 pliche (riportate a 7, come nei fogli originali) ·
 *         3 pliche tricipite-soprailiaca-addome · 3 pliche tricipite-soprailiaca-coscia
 * Una plica mancante non vale mai zero: semplicemente quella formula non si può usare.
 *
 * Formule diverse danno numeri un po' diversi: nei grafici di un cliente si
 * usa sempre la stessa (la "formula di riferimento", vedi referenceFormula).
 * Fonte: Jackson & Pollock (1978), Jackson, Pollock & Ward (1980), Siri (1961).
 */

export type Sex = "M" | "F";

export const SKINFOLD_SITES = [
  { key: "tricipite", label: "Tricipitale" },
  { key: "pettorale", label: "Pettorale" },
  { key: "ascellare", label: "Ascellare" },
  { key: "sottoscapolare", label: "Sottoscapolare" },
  { key: "soprailiaca", label: "Soprailiaca" },
  { key: "addominale", label: "Addominale" },
  { key: "coscia", label: "Coscia" },
] as const;

export type SkinfoldSite = (typeof SKINFOLD_SITES)[number]["key"];

export const siteLabel = (s: SkinfoldSite) => SKINFOLD_SITES.find((x) => x.key === s)!.label;

/** Pliche da misurare per sesso: uomo 7, donna 5 (senza pettorale e ascellare). */
export function protocolSites(sex: Sex): SkinfoldSite[] {
  const all = SKINFOLD_SITES.map((s) => s.key);
  return sex === "M" ? all : all.filter((k) => k !== "pettorale" && k !== "ascellare");
}

/** Le tre (o meno) rilevazioni di una plica, in mm. */
export type SkinfoldReadings = Partial<Record<SkinfoldSite, Array<number | null>>>;
export type SkinfoldAverages = Partial<Record<SkinfoldSite, number>>;

/** Media delle rilevazioni valide di una plica (null se non ce ne sono). */
export function siteAverage(readings: Array<number | null> | undefined): number | null {
  const valid = (readings ?? []).filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/** Medie delle pliche rilevate (solo quelle con almeno una lettura). */
export function averagesOf(readings: SkinfoldReadings | null | undefined): SkinfoldAverages {
  const out: SkinfoldAverages = {};
  for (const s of SKINFOLD_SITES) {
    const a = siteAverage(readings?.[s.key]);
    if (a !== null) out[s.key] = a;
  }
  return out;
}

export function maleDensity(sum7: number, age: number): number {
  return 1.112 - 0.00043499 * sum7 + 0.00000055 * sum7 * sum7 - 0.00028826 * age;
}

export function femaleDensity(sum5: number, age: number): number {
  const s7 = (sum5 / 5) * 7;
  return 1.097 - 0.00046971 * s7 + 0.00000056 * s7 * s7 - 0.00012828 * age;
}

export function siriBodyFat(density: number): number {
  return 495 / density - 450;
}

export type FormulaId = "m7" | "m3_pts" | "m3_pac" | "f5" | "f3_tsa" | "f3_tsc";

export type Formula = {
  id: FormulaId;
  sex: Sex;
  sites: SkinfoldSite[];
  /** Nome breve per l'interfaccia */
  label: string;
  /** % di massa grassa dalla somma delle pliche della formula */
  bodyFat: (sum: number, age: number) => number;
};

/** In ordine di preferenza: prima la più completa. */
export const FORMULAS: Formula[] = [
  { id: "m7", sex: "M", sites: ["tricipite", "pettorale", "ascellare", "sottoscapolare", "soprailiaca", "addominale", "coscia"], label: "7 pliche", bodyFat: (s, a) => siriBodyFat(maleDensity(s, a)) },
  { id: "m3_pts", sex: "M", sites: ["pettorale", "tricipite", "sottoscapolare"], label: "3 pliche (petto, tricipite, sottoscapolare)", bodyFat: (s, a) => siriBodyFat(1.1125025 - 0.0013125 * s + 0.0000055 * s * s - 0.000244 * a) },
  { id: "m3_pac", sex: "M", sites: ["pettorale", "addominale", "coscia"], label: "3 pliche (petto, addome, coscia)", bodyFat: (s, a) => siriBodyFat(1.10938 - 0.0008267 * s + 0.0000016 * s * s - 0.0002574 * a) },
  { id: "f5", sex: "F", sites: ["tricipite", "sottoscapolare", "soprailiaca", "addominale", "coscia"], label: "5 pliche", bodyFat: (s, a) => siriBodyFat(femaleDensity(s, a)) },
  { id: "f3_tsa", sex: "F", sites: ["tricipite", "soprailiaca", "addominale"], label: "3 pliche (tricipite, soprailiaca, addome)", bodyFat: (s, a) => 0.41563 * s - 0.00112 * s * s + 0.03661 * a + 4.03653 },
  { id: "f3_tsc", sex: "F", sites: ["tricipite", "soprailiaca", "coscia"], label: "3 pliche (tricipite, soprailiaca, coscia)", bodyFat: (s, a) => siriBodyFat(1.0994921 - 0.0009929 * s + 0.0000023 * s * s - 0.0001392 * a) },
];

export const formulaById = (id: string | null | undefined): Formula | null => FORMULAS.find((f) => f.id === id) ?? null;
export const formulasFor = (sex: Sex) => FORMULAS.filter((f) => f.sex === sex);

const fits = (f: Formula, avg: SkinfoldAverages) => f.sites.every((s) => avg[s] !== undefined);

/** Formule utilizzabili con le pliche rilevate, dalla più completa. */
export function availableFormulas(sex: Sex, avg: SkinfoldAverages): Formula[] {
  return formulasFor(sex).filter((f) => fits(f, avg));
}

/** Più è in alto nella lista, più è completa (0 = la migliore). */
const rank = (f: Formula) => formulasFor(f.sex).indexOf(f);

const round2 = (n: number) => Math.round(n * 100) / 100;

export type BodyComposition =
  | {
      ok: true;
      formula: Formula;
      /** somma delle pliche usate dalla formula */
      sumMm: number;
      bodyFatPct: number;
      fatMassKg: number | null;
      leanMassKg: number | null;
      averages: SkinfoldAverages;
      /** true se la formula di riferimento non si poteva usare ed è stata usata un'altra */
      fallback: boolean;
    }
  | { ok: false; missing: SkinfoldSite[]; reason: string; averages: SkinfoldAverages };

/**
 * Calcola la composizione corporea. Con `formula` usa quella (la formula di
 * riferimento del cliente) e, se mancano delle sue pliche, ripiega sulla più
 * completa disponibile segnalandolo. Senza formula sceglie la più completa.
 * Se nessuna formula è utilizzabile NON calcola la percentuale: una somma
 * incompleta darebbe un valore molto più basso di quello vero.
 */
export function computeBodyComposition(input: {
  sex: Sex;
  age: number | null;
  weightKg: number | null;
  skinfolds: SkinfoldReadings;
  formula?: FormulaId | null;
}): BodyComposition {
  const averages = averagesOf(input.skinfolds);
  const wanted = formulaById(input.formula);
  const options = availableFormulas(input.sex, averages);
  const chosen = wanted && fits(wanted, averages) ? wanted : options[0] ?? null;
  if (!chosen) {
    const ref = wanted ?? formulasFor(input.sex)[0];
    return { ok: false, averages, missing: ref.sites.filter((s) => averages[s] === undefined), reason: "Con le pliche rilevate non c'è una formula validata" };
  }
  if (input.age === null || !Number.isFinite(input.age) || input.age <= 0) {
    return { ok: false, missing: [], averages, reason: "Manca l'età (data di nascita del cliente)" };
  }
  const sum = chosen.sites.reduce((acc, s) => acc + (averages[s] ?? 0), 0);
  const bf = chosen.bodyFat(sum, input.age);
  const weight = input.weightKg && input.weightKg > 0 ? input.weightKg : null;
  const fat = weight !== null ? (weight * bf) / 100 : null;
  return {
    ok: true,
    formula: chosen,
    sumMm: round2(sum),
    bodyFatPct: round2(bf),
    fatMassKg: fat !== null ? round2(fat) : null,
    leanMassKg: fat !== null && weight !== null ? round2(weight - fat) : null,
    averages,
    fallback: Boolean(wanted && chosen.id !== wanted.id),
  };
}

/** Un check ridotto a quello che serve per scegliere la formula. */
export type FoldCheck = { averages: SkinfoldAverages };

/**
 * Formula di riferimento del cliente: quella scelta dal trainer oppure, in
 * automatico, la più completa che si può usare in TUTTI i check con pliche
 * (così il grafico non salta quando una plica manca o si aggiunge).
 * null se non ce n'è nessuna (si confrontano solo somme, peso e circonferenze).
 */
export function referenceFormula(sex: Sex, checks: FoldCheck[], chosen?: string | null): Formula | null {
  const c = formulaById(chosen);
  if (c && c.sex === sex) return c;
  const withFolds = checks.filter((k) => Object.keys(k.averages).length > 0);
  if (withFolds.length === 0) return formulasFor(sex)[0];
  return formulasFor(sex).find((f) => withFolds.every((k) => fits(f, k.averages))) ?? null;
}

/**
 * Proposta di cambio formula: se negli ultimi 3 check di fila con pliche si può
 * usare una formula più completa di quella di riferimento (es. da qualche
 * volta si riesce a prendere anche la coscia), la propone. Il trainer decide.
 */
export function formulaUpgrade(sex: Sex, checksOldToNew: FoldCheck[], current: Formula | null, streak = 3): Formula | null {
  const recent = checksOldToNew.filter((k) => Object.keys(k.averages).length > 0).slice(-streak);
  if (recent.length < streak) return null;
  const best = formulasFor(sex).find((f) => recent.every((k) => fits(f, k.averages)));
  if (!best) return null;
  if (current && rank(best) >= rank(current)) return null;
  return best;
}

/** Pliche rilevate in tutti i check (per la "somma confrontabile"). */
export function commonSites(sex: Sex, checks: FoldCheck[]): SkinfoldSite[] {
  const withFolds = checks.filter((k) => Object.keys(k.averages).length > 0);
  if (withFolds.length === 0) return [];
  return SKINFOLD_SITES.map((s) => s.key).filter((s) => (sex === "M" || protocolSites("F").includes(s)) && withFolds.every((k) => k.averages[s] !== undefined));
}

export const sumOf = (avg: SkinfoldAverages, sites: SkinfoldSite[]) => round2(sites.reduce((a, s) => a + (avg[s] ?? 0), 0));

export const CIRCUMFERENCES = [
  { key: "spalle", label: "Spalle" },
  { key: "torace", label: "Torace" },
  { key: "vita", label: "Vita" },
  { key: "fianchi", label: "Fianchi" },
  { key: "coscia_sx", label: "Coscia sx" },
  { key: "coscia_dx", label: "Coscia dx" },
  { key: "braccio_sx", label: "Braccio sx" },
  { key: "braccio_dx", label: "Braccio dx" },
  { key: "polpaccio_sx", label: "Polpaccio sx" },
  { key: "polpaccio_dx", label: "Polpaccio dx" },
] as const;

export type CircumferenceKey = (typeof CIRCUMFERENCES)[number]["key"];
