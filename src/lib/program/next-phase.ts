/**
 * Nuova fase a partire dalla precedente: stessi giorni, blocchi, esercizi,
 * indicazioni e video. La settimana 1 parte da quello che il cliente ha
 * fatto davvero nell'ultima settimana registrata (se il log è uniforme),
 * altrimenti dall'ultima prescrizione scritta. Le altre settimane restano
 * vuote: le compila l'allenatore, o le propone l'assistente AI.
 */
import { prescriptionFromSets, type SetLog } from "./prescription";
import { newId, type ProgramContent } from "./types";

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
  // ultimo log per esercizio (settimana più alta)
  const byItem = new Map<string, ItemLastLog>();
  for (const l of lastLogs) {
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
          return {
            ...it,
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
