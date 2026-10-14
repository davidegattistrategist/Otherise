/**
 * Record personali e massimali stimati dal logbook.
 * Per le serie registrate si usa la formula di Epley (kg × (1 + rip/30)),
 * solo fino a 12 ripetizioni: oltre la stima non è affidabile.
 */
import { mround } from "./e1rm";
import type { SetLog } from "../program/prescription";

export function epley(kg: number, reps: number): number | null {
  if (!(kg > 0) || !Number.isInteger(reps) || reps < 1 || reps > 12) return null;
  return reps === 1 ? kg : Math.round(kg * (1 + reps / 30) * 10) / 10;
}

export type BestSet = { e1rm: number | null; kg: number; reps: number };

/** La serie migliore (massimale stimato più alto, poi carico più alto). */
export function bestSet(sets: SetLog[] | null | undefined): BestSet | null {
  let best: BestSet | null = null;
  for (const s of sets ?? []) {
    if (typeof s.kg !== "number" || typeof s.reps !== "number" || s.kg <= 0 || s.reps <= 0) continue;
    const e = epley(s.kg, s.reps);
    const cand = { e1rm: e, kg: s.kg, reps: s.reps };
    if (!best || (cand.e1rm ?? 0) > (best.e1rm ?? 0) || ((cand.e1rm ?? 0) === (best.e1rm ?? 0) && cand.kg > best.kg)) best = cand;
  }
  return best;
}

export type ExerciseRecord = { name: string; e1rm: number | null; kg: number; reps: number; date: string; heaviest: number };

/** Record per esercizio a partire dai log (nome come chiave, minuscolo). */
export function computeRecords(logs: Array<{ exercise_name: string; performed_on: string; sets: unknown }>): Map<string, ExerciseRecord> {
  const out = new Map<string, ExerciseRecord>();
  for (const l of logs) {
    const b = bestSet(l.sets as SetLog[]);
    if (!b) continue;
    const key = l.exercise_name.trim().toLowerCase();
    const cur = out.get(key);
    const heaviest = Math.max(cur?.heaviest ?? 0, ...((l.sets as SetLog[]) ?? []).map((s) => (typeof s.kg === "number" ? s.kg : 0)));
    if (!cur || (b.e1rm ?? 0) > (cur.e1rm ?? 0)) out.set(key, { name: l.exercise_name, ...b, date: l.performed_on, heaviest });
    else out.set(key, { ...cur, heaviest });
  }
  return out;
}

/** Carico da una percentuale del massimale, arrotondato a 2,5 kg. */
export function loadFromPercent(pct: number, max: number): number | null {
  if (!(pct > 0) || !(max > 0)) return null;
  return mround((max * pct) / 100, 2.5);
}

/** Record calcolati dal database (funzione exercise_bests) nello stesso formato di computeRecords. */
export function recordsFromRows(rows: Array<{ name: string; e1rm: number | string | null; kg: number | string; reps: number; performed_on: string; heaviest: number | string }>): Map<string, ExerciseRecord> {
  const out = new Map<string, ExerciseRecord>();
  for (const r of rows) {
    out.set(r.name.trim().toLowerCase(), { name: r.name, e1rm: r.e1rm === null ? null : Number(r.e1rm), kg: Number(r.kg), reps: r.reps, date: r.performed_on, heaviest: Number(r.heaviest) });
  }
  return out;
}
