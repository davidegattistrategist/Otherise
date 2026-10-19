/**
 * Come si presenta il logbook di un esercizio: righe di serie con kg e
 * ripetizioni, spunte per lavori a tempo o distanza, oppure testo libero.
 */
import { MAX_REPS, parsePrescription } from "./prescription";
import type { ProgramBlock, ProgramItem } from "./types";

export type LogPlan =
  | { mode: "sets"; rows: number; repsHint: string; kgHint: number | null; loadText: string; pct?: number | null }
  | { mode: "check"; rows: number; label: string }
  | { mode: "text" };

export function logPlan(item: ProgramItem, block: ProgramBlock, week: number): LogPlan {
  const rx = item.prescriptions[week - 1] ?? "";
  const p = parsePrescription(rx);
  if (block.kind === "amrap" || block.kind === "emom" || block.kind === "interval") return { mode: "text" };
  if (p.kind === "sets") return { mode: "sets", rows: p.sets, repsHint: p.repsText, kgHint: p.kg, loadText: p.loadText, ...(p.pct ? { pct: p.pct } : {}) };
  if (p.kind === "timed") return { mode: "check", rows: p.sets, label: `${p.seconds}"` };
  if (p.kind === "distance") return { mode: "check", rows: p.sets, label: p.meters >= 1000 ? `${p.meters / 1000} km` : `${p.meters} m` };
  if (!block.rounds || block.rounds > 12) return { mode: "text" };
  // Nei circuiti spesso si scrive solo "12", "10-12" o "max": le serie sono i giri del blocco
  const t = rx.trim();
  const rounds = block.rounds;
  const plain = /^(\d{1,3}(?:\s*[-/]\s*\d{1,3})?)(?:\s*(?:rip|reps?|ripetizioni))?(?:\s+(\d+(?:[.,]\d+)?)\s*kg)?(?:\s+(?:per|x|ogni)\s*(?:lato|gamba|braccio))?$/i.exec(t);
  if (plain) {
    return { mode: "sets", rows: rounds, repsHint: plain[1].replace(/\s+/g, ""), kgHint: plain[2] ? Number(plain[2].replace(",", ".")) : null, loadText: plain[2] ? `${plain[2]} kg` : "" };
  }
  const max = new RegExp(String.raw`^${MAX_REPS}(?:\s+(\d+(?:[.,]\d+)?)\s*kg)?$`, "i").exec(t);
  if (max) {
    return { mode: "sets", rows: rounds, repsHint: "max", kgHint: max[1] ? Number(max[1].replace(",", ".")) : null, loadText: max[1] ? `${max[1]} kg` : "" };
  }
  // ...oppure solo il tempo ("30\"", "1'", "30\" per lato"): una spunta (e un timer) per giro
  const side = String.raw`(?:\s+(?:per|x|ogni)\s*(?:lato|gamba|braccio))?`;
  if (new RegExp(String.raw`^(?:\d{1,3}\s*(?:"|”|″|''|sec|s)|\d{1,2}\s*['’]\s*(?:\d{1,2}\s*(?:"|”|″))?)${side}$`, "i").test(t)) {
    const secs = restSeconds(t);
    if (secs) return { mode: "check", rows: rounds, label: secs % 60 === 0 && secs >= 60 ? `${secs / 60}'` : secs > 60 ? `${Math.floor(secs / 60)}'${secs % 60}"` : `${secs}"` };
  }
  // ...o la distanza o le calorie (vogatore, bike): "250m", "1 km", "15 cal"
  const dist = new RegExp(String.raw`^(\d+(?:[.,]\d+)?)\s*(m|mt|metri|km|cal|kcal|calorie)${side}$`, "i").exec(t);
  if (dist) {
    const unit = dist[2].toLowerCase();
    const label = unit.startsWith("k") && unit !== "kcal" ? `${dist[1]} km` : /cal/.test(unit) ? `${dist[1]} cal` : `${dist[1]} m`;
    return { mode: "check", rows: rounds, label };
  }
  return { mode: "text" };
}

/** Secondi di recupero da un testo come 90", 1'30", 2', 60-90", 2 min (null se non si capisce). */
export function restSeconds(rest: string | null | undefined): number | null {
  const t = (rest ?? "").trim().toLowerCase();
  if (!t) return null;
  let m = /^(\d{1,2})\s*['’]\s*(\d{1,2})\s*(?:"|''|”)?/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(\d{1,3})(?:\s*-\s*\d{1,3})?\s*(?:"|''|”|″|s\b|sec)/.exec(t);
  if (m) return Number(m[1]);
  m = /^(\d{1,2}(?:[.,]5)?)(?:\s*-\s*\d{1,2})?\s*(?:'|’|min)/.exec(t);
  if (m) return Math.round(Number(m[1].replace(",", ".")) * 60);
  return null;
}

/**
 * Recupero da mostrare al cliente. "EMOM 2" nel recupero vuol dire che la serie
 * riparte ogni 2 minuti (1,5 = 90 secondi, 2,5 = 2 minuti e mezzo).
 */
export function restLabel(rest: string | null | undefined): string {
  const t = (rest ?? "").trim();
  if (!t) return "";
  const m = /^e\.?m\.?o\.?m\.?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:'|’|min\w*)?$/i.exec(t);
  if (!m) return `Recupero ${t}`;
  const min = Number(m[1].replace(",", "."));
  const secs = Math.round(min * 60);
  const every = secs < 60 || secs % 60 !== 0 && secs % 30 !== 0
    ? `${secs} secondi`
    : secs === 90 ? "90 secondi"
    : secs % 60 === 0 ? (secs === 60 ? "minuto" : `${secs / 60} minuti`)
    : `${Math.floor(secs / 60)} minuti e mezzo`;
  return `EMOM ${String(min).replace(".", ",")}' · riparti ogni ${every}`;
}
