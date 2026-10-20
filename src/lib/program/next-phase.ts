/**
 * Nuova fase a partire dalla precedente: stessi giorni, blocchi, esercizi,
 * indicazioni e video. La settimana 1 parte da quello che il cliente ha
 * fatto davvero nell'ultima settimana registrata (se il log è uniforme),
 * altrimenti dall'ultima prescrizione scritta. Le altre settimane restano
 * vuote: le compila l'allenatore, o le propone l'assistente AI.
 */
import { prescriptionFromSets, type SetLog } from "./prescription";
import { newId, swapFor, withoutSwaps, type ProgramContent } from "./types";

export type ItemLastLog = { item_id: string; week: number; sets: SetLog[]; result_text: string };

function lastNonEmpty(arr: string[]): string {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i]?.trim()) return arr[i];
  return "";
}

export function buildNextPhase(
  previous: ProgramContent,
  newWeeks: number,
  lastLogs: ItemLastLog[] = [],
): ProgramContent {
  // ultimo log per esercizio (settimana più alta), senza le settimane in cui
  // c'era un sostituto: quello che ha fatto il sostituto non vale per l'originale
  const swapsOf = new Map(previous.days.flatMap((d) => d.blocks.flatMap((b) => b.items.map((it) => [it.id, it] as const))));
  const byItem = new Map<string, ItemLastLog>();
  for (const l of lastLogs) {
    const it = swapsOf.get(l.item_id);
    if (it && swapFor(it, l.week)) continue;
    const cur = byItem.get(l.item_id);
    if (!cur || l.week > cur.week) byItem.set(l.item_id, l);
  }
  return {
    days: previous.days.map((d) => ({
      ...d,
      blocks: d.blocks.map((b) => ({
        ...b,
        items: b.items.map((it) => {
          const fromLog = byItem.get(it.id) ? prescriptionFromSets(byItem.get(it.id)!.sets) : null;
          const first = fromLog ?? lastNonEmpty(it.prescriptions);
          // le sostituzioni temporanee restano nella fase vecchia
          return {
            ...withoutSwaps(it),
            prescriptions: Array.from({ length: newWeeks }, (_, i) => (i === 0 ? first : "")),
          };
        }),
      })),
    })),
  };
}

/** Copia settimana `from` su tutte le altre settimane vuote (o su tutte, se overwrite). */
export function copyWeekToOthers(content: ProgramContent, from: number, weeks: number, overwrite = false): ProgramContent {
  return {
    days: content.days.map((d) => ({
      ...d,
      blocks: d.blocks.map((b) => ({
        ...b,
        items: b.items.map((it) => ({
          ...it,
          prescriptions: Array.from({ length: weeks }, (_, i) => {
            const cur = it.prescriptions[i] ?? "";
            if (i === from) return cur;
            return overwrite || !cur.trim() ? it.prescriptions[from] ?? "" : cur;
          }),
        })),
      })),
    })),
  };
}

/** Duplica un giorno con id nuovi, subito dopo l'originale. */
export function duplicateDay(content: ProgramContent, dayId: string): ProgramContent {
  const idx = content.days.findIndex((d) => d.id === dayId);
  if (idx === -1) return content;
  const src = content.days[idx];
  const copy = {
    ...src,
    id: newId(),
    title: `${src.title} (copia)`,
    blocks: src.blocks.map((b) => ({ ...b, id: newId(), items: b.items.map((it) => ({ ...it, id: newId(), prescriptions: [...it.prescriptions] })) })),
  };
  const days = [...content.days];
  days.splice(idx + 1, 0, copy);
  return { days };
}

/**
 * Nome della nuova fase. Con la numerazione progressiva ("21 Preparazione
 * beach volley") il numero è quello dopo il più alto del cliente, anche se si
 * parte da una fase più vecchia (da "20" con la 21 già fatta → "22"), con le
 * stesse cifre ("06" → "07"). Senza numero: "<nome> · nuova fase".
 */
export function nextPhaseTitle(prevTitle: string, clientTitles: string[]): string {
  const m = /^(\d+)(\s*[-–·.]?\s*)(.*)$/.exec(prevTitle.trim());
  if (!m) return `${prevTitle.trim()} · nuova fase`;
  const numbers = [prevTitle, ...clientTitles].map((t) => /^(\d+)/.exec(t.trim())?.[1]).filter((x): x is string => Boolean(x)).map(Number);
  const next = Math.max(...numbers) + 1;
  const width = m[1].length;
  const rest = m[3].replace(/\s*·\s*nuova fase$/i, "").trim();
  return `${String(next).padStart(width, "0")}${rest ? ` ${rest}` : ""}`;
}
