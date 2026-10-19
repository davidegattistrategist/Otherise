/**
 * Corse nel programma: dire chiaro cosa si fa e non dimenticare riscaldamento
 * e defaticamento.
 *
 * - Il tipo di corsa della settimana: "Ripetute", "Fartlek" o "Lento lungo".
 *   Un esercizio chiamato "Corsa di qualità" che una settimana ha "6x400m" e
 *   quella dopo "fartlek 20'" si mostra come "Ripetute" e poi "Fartlek".
 * - Nei giorni con ripetute o fartlek, se il trainer non ha già scritto un
 *   riscaldamento di corsa, prima del blocco forte si mostrano 10' di corsa
 *   blanda e dopo almeno 5' di defaticamento. Il lento lungo no: è già volume.
 */
import type { ProgramDay, ProgramItem } from "./types";

export type RunKind = "Ripetute" | "Fartlek" | "Lento lungo";

export const RUN_WARMUP = "10' di corsa blanda";
export const RUN_COOLDOWN = "5' di corsa blanda (anche di più)";

const RUNNING = /\bcors[aei]|\brun\b|running|ripetut|fartlek|qualit[aà]|lent[oa][\s-]*lung|lung[oa][\s-]*lent|tapis|treadmill|\bjog/i;
/** Nomi che dicono solo "corsa": al cliente si mostra il tipo al loro posto */
const GENERIC = /^(?:corsa(?:\s+(?:di\s+)?(?:qualit[aà]|intensa|veloce|forte|intervallata|del\s+giorno))?|qualit[aà]|run(?:ning)?|lavoro\s+(?:di\s+)?corsa)$/i;

/** Ripetute, fartlek o lento lungo, da nome e prescrizione della settimana (null se non è una corsa riconoscibile). */
export function runKind(name: string, rx: string): RunKind | null {
  const n = name.trim();
  const t = rx.trim();
  if (!RUNNING.test(n) && !/ripetut|fartlek|lent[oa][\s-]*lung|lung[oa][\s-]*lent/i.test(t)) return null;
  if (/fartlek/i.test(t) || (/fartlek/i.test(n) && !/ripetut/i.test(t))) return "Fartlek";
  if (/ripetut/i.test(t)) return "Ripetute";
  // 6x400m, 5 x 1km, 4x3', 8x1' forte / 1' piano, 3x(…)
  if (/^\d{1,2}\s*[x×]\s*(?:\(|\d+(?:[.,]\d+)?\s*(?:m\b|mt\b|metri|km\b|['’]|min\b|"|”|″))/i.test(t)) return "Ripetute";
  if (/ripetut/i.test(n)) return "Ripetute";
  if (/lent[oa][\s-]*lung|lung[oa][\s-]*lent|\blungo\b/i.test(`${n} ${t}`)) return "Lento lungo";
  return null;
}

/** Il nome da mostrare: il tipo al posto di un nome generico, accanto a un nome specifico. */
export function runTitle(name: string, rx: string): string {
  const kind = runKind(name, rx);
  if (!kind) return name;
  const n = name.trim();
  if (!n || GENERIC.test(n)) return kind;
  const word = kind === "Lento lungo" ? /lent[oa][\s-]*lung|lung[oa][\s-]*lent/i : new RegExp(kind.slice(0, 6), "i");
  return word.test(n) ? n : `${n} · ${kind}`;
}

/** La prescrizione da mostrare: senza il tipo davanti, se il nome lo dice già ("Ripetute 6x400m" → "6x400m"). */
export function runRx(name: string, rx: string): string {
  const kind = runKind(name, rx);
  if (kind !== "Ripetute" && kind !== "Fartlek") return rx;
  return rx.replace(new RegExp(String.raw`^\s*${kind}\s*:?\s*`, "i"), "") || rx;
}

const isQuality = (it: ProgramItem, week: number) => {
  const k = runKind(it.name, it.prescriptions[week - 1] ?? "");
  return k === "Ripetute" || k === "Fartlek";
};

/** Testi del giorno (note, blocchi, esercizi e prescrizioni della settimana). */
function dayTexts(day: ProgramDay, week: number): string[] {
  return [day.notes, ...day.blocks.flatMap((b) => [b.title, b.notes, ...b.items.flatMap((it) => [it.name, it.notes, it.prescriptions[week - 1] ?? ""])])].map((t) => t ?? "");
}

/**
 * Dove mettere riscaldamento e defaticamento di corsa in un giorno con ripetute
 * o fartlek: prima del primo esercizio di qualità e dopo l'ultimo (id). Quello
 * che il trainer ha già scritto (riscaldamento di corsa, corsa blanda,
 * defaticamento) non si ripete.
 */
export function runWarmup(day: ProgramDay, week: number): { before: string | null; after: string | null } | null {
  const items = day.blocks.flatMap((b) => (b.kind === "text" ? [] : b.items));
  const quality = items.filter((it) => isQuality(it, week));
  if (!quality.length) return null;
  const texts = dayTexts(day, week);
  const warm = texts.some((t) => /riscald\w*[^.\n]{0,40}(?:cors|blanda|jog)|cors\w*[^.\n]{0,15}blanda|blanda[^.\n]{0,20}cors|\bjog/i.test(t));
  const cool = texts.some((t) => /defatic/i.test(t));
  if (warm && cool) return null;
  return { before: warm ? null : quality[0].id, after: cool ? null : quality[quality.length - 1].id };
}

/** Per l'editor: come vede il cliente questa corsa (null se non è una corsa riconoscibile). */
export function runHint(name: string, prescriptions: string[]): string | null {
  const kinds = prescriptions.map((rx) => runKind(name, rx ?? ""));
  if (!kinds.some(Boolean)) return null;
  const titles = prescriptions.map((rx, i) => (kinds[i] ? runTitle(name, rx ?? "") : null));
  const uniq = [...new Set(titles.filter((t): t is string => Boolean(t)))];
  const what = uniq.length === 1 ? `«${uniq[0]}»` : titles.map((t, i) => (t ? `sett. ${i + 1} «${t}»` : null)).filter(Boolean).join(", ");
  const quality = kinds.some((k) => k === "Ripetute" || k === "Fartlek");
  return `Il cliente vede ${what}${quality ? `; prima ${RUN_WARMUP} e dopo il defaticamento, se non li scrivi tu` : ""}`;
}
