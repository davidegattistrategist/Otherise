/**
 * Come si presenta il logbook di un esercizio: righe di serie con kg e
 * ripetizioni, spunte per lavori a tempo o distanza, oppure testo libero.
 */
import { parsePrescription } from "./prescription";
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
  // Nei circuiti spesso si scrive solo "12" o "10-12": le serie sono i giri del blocco
  const plain = /^(\d{1,3}(?:\s*[-/]\s*\d{1,3})?)(?:\s*(?:rip|reps?|ripetizioni))?(?:\s+(\d+(?:[.,]\d+)?)\s*kg)?$/i.exec(rx.trim());
  if (plain && block.rounds && block.rounds <= 12) {
    return { mode: "sets", rows: block.rounds, repsHint: plain[1].replace(/\s+/g, ""), kgHint: plain[2] ? Number(plain[2].replace(",", ".")) : null, loadText: plain[2] ? `${plain[2]} kg` : "" };
  }
  // ...oppure solo il tempo ("30\"", "1'"): una spunta (e un timer) per giro
  if (block.rounds && block.rounds <= 12 && /^\d{1,3}\s*(?:"|”|″|''|sec|s)$|^\d{1,2}\s*['’]\s*(?:\d{1,2}\s*(?:"|”|″))?$/i.test(rx.trim())) {
    const secs = restSeconds(rx);
    if (secs) return { mode: "check", rows: block.rounds, label: secs % 60 === 0 && secs >= 60 ? `${secs / 60}'` : secs > 60 ? `${Math.floor(secs / 60)}'${secs % 60}"` : `${secs}"` };
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
