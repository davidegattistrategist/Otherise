/**
 * Legge una prescrizione scritta a mano ("4x8 65kg", "3x20\"", "5x800m")
 * per preparare il logbook del cliente. Se la scrittura non ha una forma
 * riconosciuta il cliente avrà un campo di testo libero: nulla di ciò che
 * l'allenatore scrive diventa impossibile.
 */

export type SetLog = { kg?: number | null; reps?: number | null; done?: boolean };

export type ParsedPrescription =
  | {
      kind: "sets";
      sets: number;
      /** Ripetizioni da proporre (solo se è un numero preciso) */
      reps: number | null;
      /** Testo delle ripetizioni come scritto: "8", "8/10", "10-12" */
      repsText: string;
      /** Carico da proporre in kg (solo se è un numero preciso) */
      kg: number | null;
      loadText: string;
    }
  | { kind: "timed"; sets: number; seconds: number }
  | { kind: "distance"; sets: number; meters: number }
  | { kind: "text" };

const num = (s: string) => Number(s.replace(",", "."));

export function parsePrescription(raw: string | null | undefined): ParsedPrescription {
  const text = (raw ?? "").trim();
  if (!text || /\+/.test(text)) return { kind: "text" };

  // 3x20"  · 2x20" per gamba · 1x30''
  let m = /^(\d{1,2})\s*[x×]\s*(\d{1,3})(?:\s*[/-]\s*\d{1,3})?\s*(?:"|''|”|″|sec\b|s\b)/i.exec(text);
  if (m) return { kind: "timed", sets: Number(m[1]), seconds: Number(m[2]) };

  // 5x800m · 4x1000 4:30 (ripetute)  · 4x1km
  m = /^(\d{1,2})\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(m|km)\b/i.exec(text);
  if (m) {
    const meters = m[3].toLowerCase() === "km" ? num(m[2]) * 1000 : num(m[2]);
    return { kind: "distance", sets: Number(m[1]), meters };
  }

  // 4x8 65kg · 4x8/10 · 2x 6/8 ripetizioni · 1x1 72,5kg · 4x10 45/47,5kg · 3x8/14
  m = /^(\d{1,2})\s*[x×]\s*(\d{1,3}(?:\s*[/-]\s*\d{1,3})?)(?!\s*(?:m|km|"|''))\b(.*)$/i.exec(text);
  if (m) {
    const sets = Number(m[1]);
    if (sets < 1 || sets > 20) return { kind: "text" };
    const repsText = m[2].replace(/\s+/g, "");
    const reps = /^\d+$/.test(repsText) ? Number(repsText) : null;
    const rest = m[3] ?? "";
    const load = /(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?)\s*kg/i.exec(rest);
    const loadText = load ? `${load[1].replace(/\s+/g, "")} kg` : "";
    const kg = load && !load[1].includes("/") ? num(load[1]) : null;
    return { kind: "sets", sets, reps, repsText, kg, loadText };
  }

  return { kind: "text" };
}

const fmtKg = (kg: number) => (Number.isInteger(kg) ? String(kg) : String(kg).replace(".", ","));

/** "4 × 10 · 65 kg" a partire da serie registrate (null se vuote). */
export function summarizeSets(sets: SetLog[] | null | undefined): string | null {
  const done = (sets ?? []).filter((s) => (s.reps ?? null) !== null || (s.kg ?? null) !== null);
  if (done.length === 0) return null;
  const allSame = done.every((s) => s.reps === done[0].reps && s.kg === done[0].kg);
  if (allSame) {
    const r = done[0].reps;
    const k = done[0].kg;
    const left = r !== null && r !== undefined ? `${done.length} × ${r}` : `${done.length} serie`;
    return k !== null && k !== undefined ? `${left} · ${fmtKg(k)} kg` : left;
  }
  return done
    .map((s) => {
      const r = s.reps ?? "–";
      return s.kg !== null && s.kg !== undefined ? `${r}×${fmtKg(s.kg)}` : `${r}`;
    })
    .join(", ") + (done.some((s) => s.kg) ? " kg" : "");
}

/**
 * Prescrizione per la nuova fase a partire da quello che il cliente ha
 * fatto davvero ("4x11 65kg"), o null se il log non è uniforme.
 */
export function prescriptionFromSets(sets: SetLog[] | null | undefined): string | null {
  const done = (sets ?? []).filter((s) => typeof s.reps === "number" && s.reps > 0);
  if (done.length === 0) return null;
  const reps = done[0].reps;
  const kg = done[0].kg ?? null;
  if (!done.every((s) => s.reps === reps && (s.kg ?? null) === kg)) return null;
  return kg !== null ? `${done.length}x${reps} ${fmtKg(kg)}kg` : `${done.length}x${reps}`;
}
