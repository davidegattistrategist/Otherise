/**
 * Progressioni automatiche (senza AI): partendo dalla prescrizione di una
 * settimana compila le successive con una regola semplice.
 */
import { mround } from "../strength/e1rm";

export const PROGRESSION_RULES = [
  { key: "double", label: "Doppia progressione: +1 rip. per 2 settimane, poi +2,5 kg e si riparte" },
  { key: "reps", label: "+1 ripetizione a settimana" },
  { key: "kg25", label: "+2,5 kg a settimana" },
  { key: "kg5", label: "+5 kg a settimana" },
  { key: "pct", label: "+2,5% del massimale a settimana" },
  { key: "sets", label: "+1 serie a settimana" },
  { key: "same", label: "Uguale tutte le settimane" },
] as const;
export type ProgressionRule = (typeof PROGRESSION_RULES)[number]["key"];

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10).replace(".", ","));
const num = (s: string) => Number(s.replace(",", "."));

/** La prescrizione `base` portata avanti di `steps` settimane con la regola. Null se la regola non si applica. */
export function progress(base: string, rule: ProgressionRule, steps: number): string | null {
  const text = base.trim();
  if (!text) return null;
  if (rule === "same" || steps === 0) return text;
  // serie x ripetizioni (o secondi) + resto
  const full = /^(\d{1,2})\s*[x×]\s*(\d{1,3})(?:\s*([/-])\s*(\d{1,3}))?(\s*(?:"|''|”|″|sec\b|s\b))?(.*)$/i.exec(text);
  // nei circuiti spesso le serie non si scrivono (sono i giri): "12 16kg", "30\"", "8-10"
  const noSets = full ? null : /^()(\d{1,3})(?:\s*([/-])\s*(\d{1,3}))?(\s*(?:"|''|”|″|sec\b|s\b))?(?=$|\s|[,;·])(.*)$/i.exec(text);
  // solo il carico: "16kg"
  const loadOnly = full || noSets ? null : /^\d+(?:[.,]\d+)?\s*kg\b/i.test(text);
  if (loadOnly) {
    if (rule !== "kg25" && rule !== "kg5" && rule !== "double") return null;
    const k = /(\d+(?:[.,]\d+)?)\s*kg/i.exec(text)!;
    const per = rule === "kg5" ? 5 : 2.5;
    const n = rule === "double" ? Math.floor(steps / 3) : steps;
    return text.replace(k[0], `${fmt(num(k[1]) + per * n)}kg`);
  }
  const m = full ?? noSets;
  if (!m) return null;
  if (noSets && rule === "sets") return null;
  let sets = Number(m[1]);
  let a = Number(m[2]);
  let b = m[4] ? Number(m[4]) : null;
  const sep = m[3] ?? "";
  const timed = Boolean(m[5]);
  let rest = m[6] ?? "";
  switch (rule) {
    case "double": {
      // 4x7 16kg → 4x8 16kg → 4x9 16kg → 4x7 18,5kg → …
      const k = /(\d+(?:[.,]\d+)?)\s*kg/i.exec(rest);
      const cycle = k ? Math.floor(steps / 3) : 0;
      const inc = k ? steps % 3 : steps;
      a += timed ? 5 * inc : inc;
      if (b !== null) b += timed ? 5 * inc : inc;
      if (k && cycle) rest = rest.replace(k[0], `${fmt(num(k[1]) + 2.5 * cycle)}kg`);
      break;
    }
    case "reps": {
      const inc = timed ? 5 * steps : steps;
      a += inc;
      if (b !== null) b += inc;
      break;
    }
    case "sets":
      sets += steps;
      break;
    case "kg25":
    case "kg5": {
      const k = /(\d+(?:[.,]\d+)?)\s*kg/i.exec(rest);
      if (!k) return null;
      const next = num(k[1]) + (rule === "kg25" ? 2.5 : 5) * steps;
      rest = rest.replace(k[0], `${fmt(next)}kg`);
      break;
    }
    case "pct": {
      const p = /(@?\s*)(\d{2,3}(?:[.,]\d)?)\s*%/.exec(rest);
      if (!p) return null;
      const next = Math.min(110, num(p[2]) + 2.5 * steps);
      rest = rest.replace(p[0], `${p[1]}${fmt(next)}%`);
      break;
    }
  }
  const reps = b !== null ? `${a}${sep}${b}` : `${a}`;
  return `${noSets ? "" : `${sets}x`}${reps}${m[5] ?? ""}${rest}`;
}

/** Compila le settimane dopo `from` partendo dalla prescrizione di `from` (le prescrizioni non riconosciute restano com'erano). */
export function fillWeeks(prescriptions: string[], from: number, rule: ProgressionRule, opts: { deloadLast?: boolean } = {}): string[] {
  const base = prescriptions[from] ?? "";
  const out = prescriptions.map((p, w) => (w <= from ? p : progress(base, rule, w - from) ?? p));
  const last = out.length - 1;
  if (opts.deloadLast && last - from >= 2) out[last] = deload(out[last - 1]);
  return out;
}

/** Settimana di scarico: un terzo delle serie in meno (minimo 2), carico −10%. */
export function deload(rx: string): string {
  const m = /^(\d{1,2})\s*[x×]\s*(.*)$/i.exec(rx.trim());
  if (!m) {
    // senza serie (circuiti): solo il carico −10%
    const k = /(\d+(?:[.,]\d+)?)\s*kg/i.exec(rx);
    return k ? rx.replace(k[0], `${fmt(mround(num(k[1]) * 0.9, 2.5))}kg`) : rx;
  }
  const sets = Math.max(2, Math.round(Number(m[1]) * (2 / 3)));
  let rest = m[2];
  const k = /(\d+(?:[.,]\d+)?)\s*kg/i.exec(rest);
  if (k) rest = rest.replace(k[0], `${fmt(mround(num(k[1]) * 0.9, 2.5))}kg`);
  return `${sets}x${rest}`;
}

/** Compila le settimane di un esercizio partendo dalla prima scritta (vuoto = resta com'è). */
export function progressPrescriptions(prescriptions: string[], rule: ProgressionRule, opts: { deloadLast?: boolean } = {}): string[] {
  const from = prescriptions.findIndex((p) => p.trim());
  return from >= 0 ? fillWeeks(prescriptions, from, rule, opts) : prescriptions;
}
