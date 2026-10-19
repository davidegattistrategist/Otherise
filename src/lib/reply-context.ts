/**
 * Per le bozze di risposta: confronto tra quello che il programma chiedeva e
 * quello che il cliente ha fatto davvero, serie per serie. Funzioni pure
 * (senza database), usate da src/lib/ai/reply-context.ts e dai test.
 *
 * Serve a due cose: non fare complimenti sbagliati ("hai chiuso tutte le
 * serie" quando l'ultima è venuta con una ripetizione in meno) e non dare
 * indicazioni in contrasto con il programma (se carico e ripetizioni sono
 * scritti, li decide il programma; solo con un range si può suggerire come
 * progredire).
 */
import { parsePrescription, type SetLog } from "./program/prescription";
import type { ProgramDay } from "./program/types";

export type LoggedItem = { item_id: string; sets: SetLog[] | null; result_text: string };

const kgText = (n: number) => String(n).replace(".", ",");

/** Chi decide carico e ripetizioni per questa prescrizione. */
export function prescriptionRule(rx: string): string {
  const p = parsePrescription(rx);
  if (p.kind === "timed") return "tempo deciso dal programma";
  if (p.kind === "distance") return "distanza decisa dal programma";
  if (p.kind !== "sets") return "";
  if (p.repsText === "max") return p.kg !== null ? "carico deciso dal programma, ripetizioni al massimo: conta quante ne ha fatte" : "ripetizioni al massimo: conta quante ne ha fatte";
  const range = p.reps === null && /[/-]/.test(p.repsText);
  const load = p.kg !== null || p.pct !== null || Boolean(p.loadText);
  if (load && !range) return "carico e ripetizioni decisi dal programma: non suggerire cambi";
  if (load && range) return "carico deciso dal programma, ripetizioni in un range: puoi suggerire come salire dentro il range";
  if (range) return "range di ripetizioni, carico libero: puoi suggerire come progredire (ripetizioni dentro il range, poi carico)";
  return "ripetizioni decise dal programma, carico libero";
}

/** Le serie registrate davvero (fatte, o con ripetizioni scritte). */
function performed(sets: SetLog[] | null): SetLog[] {
  return (sets ?? []).filter((s) => s.done || typeof s.reps === "number");
}

/** "8×52,5, 8×52,5, 7×52,5" */
function setsText(sets: SetLog[]): string {
  return sets
    .map((s) => {
      const r = typeof s.reps === "number" ? String(s.reps) : "?";
      return typeof s.kg === "number" ? `${r}×${kgText(s.kg)}` : r;
    })
    .join(", ") + (sets.some((s) => typeof s.kg === "number") ? " kg" : "");
}

/** Differenze tra prescrizione e serie fatte (vuoto se combacia). */
export function setDifferences(rx: string, sets: SetLog[] | null): string[] {
  const p = parsePrescription(rx);
  if (p.kind !== "sets") return [];
  const done = performed(sets);
  const out: string[] = [];
  if (done.length < p.sets) out.push(`fatte ${done.length} serie su ${p.sets}`);
  const min = p.reps ?? (/^(\d+)/.exec(p.repsText) ? Number(/^(\d+)/.exec(p.repsText)![1]) : null);
  done.forEach((s, i) => {
    if (typeof s.reps === "number" && min !== null && s.reps < min) {
      out.push(`serie ${i + 1}: ${s.reps} ripetizioni invece di ${p.reps !== null ? p.reps : `almeno ${min}`}`);
    }
    if (p.kg !== null && typeof s.kg === "number" && Math.abs(s.kg - p.kg) > 0.01) {
      out.push(`serie ${i + 1}: ${kgText(s.kg)} kg invece di ${kgText(p.kg)}`);
    }
  });
  if (done.length > p.sets) out.push(`${done.length - p.sets} serie in più del previsto`);
  return out;
}

/**
 * Un allenamento in testo compatto: per ogni esercizio la prescrizione della
 * settimana, chi decide carico e ripetizioni, cosa ha fatto e le differenze.
 */
export function workoutVsPlan(day: ProgramDay, week: number, logs: LoggedItem[]): string {
  const byItem = new Map(logs.map((l) => [l.item_id, l]));
  const lines: string[] = [];
  for (const b of day.blocks) {
    if (b.kind === "text") continue;
    for (const it of b.items) {
      if (!it.name.trim()) continue;
      const rx = (it.prescriptions[week - 1] ?? "").trim();
      const log = byItem.get(it.id);
      const done = performed(log?.sets ?? null);
      const rule = rx ? prescriptionRule(rx) : "";
      const what = done.length ? setsText(done) : log?.result_text.trim() ? "" : "non registrato";
      const diff = rx && done.length ? setDifferences(rx, log?.sets ?? null) : [];
      const parts = [
        `- ${it.name}`,
        `programma: ${rx || "—"}${rule ? ` (${rule})` : ""}`,
        `fatto: ${[what, log?.result_text.trim() ? `nota "${log.result_text.trim()}"` : ""].filter(Boolean).join(", ")}`,
        diff.length ? `DIFFERENZE: ${diff.join("; ")}` : done.length && rx ? "come da programma" : "",
      ].filter(Boolean);
      lines.push(parts.join(" — "));
    }
  }
  return lines.join("\n");
}
