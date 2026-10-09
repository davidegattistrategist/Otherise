/**
 * Plicometria: stessi calcoli dei fogli "Report con grafici mensile".
 *
 * Uomo, 7 pliche (Jackson-Pollock 7):
 *   D = 1,112 − 0,00043499·S + 0,00000055·S² − 0,00028826·età
 * Donna, 5 pliche: la somma viene portata a 7 pliche (S × 7/5) e poi
 * entra nella formula femminile a 7 pliche:
 *   D = 1,097 − 0,00046971·S7 + 0,00000056·S7² − 0,00012828·età
 * Per entrambi, Siri: %MG = 495 / D − 450
 *
 * La conversione 5 → 7 pliche per le donne è un adattamento dei fogli
 * originali, tenuto per confrontare i nuovi check con lo storico.
 * Per cambiarla basta modificare femaleDensity() qui sotto.
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

/** Pliche da misurare per sesso: uomo 7, donna 5 (senza pettorale e ascellare). */
export function protocolSites(sex: Sex): SkinfoldSite[] {
  const all = SKINFOLD_SITES.map((s) => s.key);
  return sex === "M" ? all : all.filter((k) => k !== "pettorale" && k !== "ascellare");
}

/** Le tre (o meno) rilevazioni di una plica, in mm. */
export type SkinfoldReadings = Partial<Record<SkinfoldSite, Array<number | null>>>;

/** Media delle rilevazioni valide di una plica (null se non ce ne sono). */
export function siteAverage(readings: Array<number | null> | undefined): number | null {
  const valid = (readings ?? []).filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
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

const round2 = (n: number) => Math.round(n * 100) / 100;

export type BodyComposition =
  | {
      ok: true;
      sumMm: number;
      density: number;
      bodyFatPct: number;
      fatMassKg: number | null;
      leanMassKg: number | null;
      averages: Partial<Record<SkinfoldSite, number>>;
    }
  | { ok: false; missing: SkinfoldSite[]; reason: string; averages: Partial<Record<SkinfoldSite, number>> };

/**
 * Calcola la composizione corporea. Se manca anche una sola plica del
 * protocollo NON calcola la percentuale: una somma incompleta darebbe un
 * valore molto più basso di quello vero.
 */
export function computeBodyComposition(input: {
  sex: Sex;
  age: number | null;
  weightKg: number | null;
  skinfolds: SkinfoldReadings;
}): BodyComposition {
  const sites = protocolSites(input.sex);
  const averages: Partial<Record<SkinfoldSite, number>> = {};
  const missing: SkinfoldSite[] = [];
  for (const site of sites) {
    const avg = siteAverage(input.skinfolds[site]);
    if (avg === null) missing.push(site);
    else averages[site] = avg;
  }
  if (missing.length > 0) {
    return { ok: false, missing, averages, reason: "Mancano delle pliche del protocollo" };
  }
  if (input.age === null || !Number.isFinite(input.age) || input.age <= 0) {
    return { ok: false, missing: [], averages, reason: "Manca l'età (data di nascita del cliente)" };
  }
  const sum = sites.reduce((acc, s) => acc + (averages[s] ?? 0), 0);
  const density = input.sex === "M" ? maleDensity(sum, input.age) : femaleDensity(sum, input.age);
  const bf = siriBodyFat(density);
  const weight = input.weightKg && input.weightKg > 0 ? input.weightKg : null;
  const fat = weight !== null ? (weight * bf) / 100 : null;
  return {
    ok: true,
    sumMm: round2(sum),
    density,
    bodyFatPct: round2(bf),
    fatMassKg: fat !== null ? round2(fat) : null,
    leanMassKg: fat !== null && weight !== null ? round2(weight - fat) : null,
    averages,
  };
}

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
