/**
 * Come si presenta il logbook di un esercizio: righe di serie con kg e
 * ripetizioni, spunte per lavori a tempo o distanza, oppure testo libero.
 */
import { parsePrescription } from "./prescription";
import type { ProgramBlock, ProgramItem } from "./types";

export type LogPlan =
  | { mode: "sets"; rows: number; repsHint: string; kgHint: number | null; loadText: string }
  | { mode: "check"; rows: number; label: string }
  | { mode: "text" };

export function logPlan(item: ProgramItem, block: ProgramBlock, week: number): LogPlan {
  const rx = item.prescriptions[week - 1] ?? "";
  const p = parsePrescription(rx);
  if (block.kind === "amrap" || block.kind === "emom" || block.kind === "interval") return { mode: "text" };
  if (p.kind === "sets") return { mode: "sets", rows: p.sets, repsHint: p.repsText, kgHint: p.kg, loadText: p.loadText };
  if (p.kind === "timed") return { mode: "check", rows: p.sets, label: `${p.seconds}"` };
  if (p.kind === "distance") return { mode: "check", rows: p.sets, label: p.meters >= 1000 ? `${p.meters / 1000} km` : `${p.meters} m` };
  // Nei circuiti spesso si scrive solo "12" o "10-12": le serie sono i giri del blocco
  const plain = /^(\d{1,3}(?:\s*[-/]\s*\d{1,3})?)(?:\s*(?:rip|reps?|ripetizioni))?(?:\s+(\d+(?:[.,]\d+)?)\s*kg)?$/i.exec(rx.trim());
  if (plain && block.rounds && block.rounds <= 12) {
    return { mode: "sets", rows: block.rounds, repsHint: plain[1].replace(/\s+/g, ""), kgHint: plain[2] ? Number(plain[2].replace(",", ".")) : null, loadText: plain[2] ? `${plain[2]} kg` : "" };
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
