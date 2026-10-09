/**
 * Stima del massimale (e1RM) con la tabella RPE del foglio
 * "Calcolatore massimali": percentuale del massimale per ripetizioni
 * fatte (1–12) e RPE (6,5–10). Risultato arrotondato a 2,5 kg come
 * MROUND(carico / percentuale; 2,5).
 */

// righe: RPE; colonne: ripetizioni 1..12 (valori in %)
export const RPE_TABLE: Record<string, number[]> = {
  "10": [100, 96, 92, 89, 86, 84, 81, 79, 76, 74, 71, 68],
  "9.5": [98, 94, 91, 88, 85, 82, 80, 77, 75, 72, 69, 67],
  "9": [96, 92, 89, 86, 84, 81, 79, 76, 74, 71, 68, 65],
  "8.5": [94, 91, 88, 85, 82, 80, 77, 75, 72, 69, 67, 64],
  "8": [92, 89, 86, 84, 81, 79, 76, 74, 71, 68, 65, 63],
  "7.5": [91, 88, 85, 82, 80, 77, 75, 72, 69, 67, 64, 61],
  "7": [89, 86, 84, 81, 79, 76, 74, 71, 68, 65, 63, 60],
  "6.5": [88, 85, 82, 80, 77, 75, 72, 69, 67, 64, 61, 59],
};

export const RPE_VALUES = [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5];

export function percentOfMax(reps: number, rpe: number): number | null {
  if (!Number.isInteger(reps) || reps < 1 || reps > 12) return null;
  const row = RPE_TABLE[String(rpe)];
  if (!row) return null;
  return row[reps - 1];
}

export function mround(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Massimale stimato in kg, o null se ripetizioni/RPE sono fuori tabella. */
export function estimateOneRepMax(loadKg: number, reps: number, rpe: number): number | null {
  const pct = percentOfMax(reps, rpe);
  if (pct === null || !(loadKg > 0)) return null;
  return mround(loadKg / (pct / 100), 2.5);
}
