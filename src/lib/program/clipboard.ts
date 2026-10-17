/**
 * Copia e incolla di esercizi nell'editor del programma (puro, senza React).
 *
 * L'unità è il blocco: un esercizio singolo, una superserie o un circuito
 * interi, un blocco di testo. Si copiano dei blocchi (anche da giorni diversi,
 * in ordine di programma) e si incollano:
 * - al posto di quelli selezionati: in ogni giorno con una selezione, i blocchi
 *   selezionati escono e i copiati entrano dove c'era il primo;
 * - sopra quelli selezionati (in ogni giorno, prima del primo selezionato);
 * - in fondo a un giorno.
 * Ogni copia incollata ha id nuovi (il logbook si aggancia agli id: due giorni
 * non devono mai avere lo stesso esercizio con lo stesso id) e le settimane
 * portate a quelle del programma di arrivo.
 */
import { z } from "zod";
import { newId, programBlockSchema, type ProgramBlock, type ProgramContent } from "./types";

export type ProgramClip = {
  v: 1;
  /** quando è stato copiato (ms) */
  at: number;
  programId: string;
  programTitle: string;
  /** giorni da cui arrivano i blocchi (per non incollarli sopra sé stessi) */
  dayIds: string[];
  /** posizione nel giorno di partenza del primo blocco copiato */
  fromIndex: number;
  blocks: ProgramBlock[];
};

/** I blocchi con questi id, nell'ordine del programma. */
export function collectBlocks(content: ProgramContent, ids: ReadonlySet<string>): { blocks: ProgramBlock[]; dayIds: string[]; fromIndex: number } {
  const blocks: ProgramBlock[] = [];
  const dayIds: string[] = [];
  let fromIndex = -1;
  for (const d of content.days) {
    d.blocks.forEach((b, i) => {
      if (!ids.has(b.id)) return;
      if (fromIndex < 0) fromIndex = i;
      blocks.push(structuredClone(b));
      if (!dayIds.includes(d.id)) dayIds.push(d.id);
    });
  }
  return { blocks, dayIds, fromIndex: Math.max(0, fromIndex) };
}

/**
 * Prescrizioni portate a `weeks` settimane: si tagliano se sono di più; se sono
 * di meno, le settimane in più ripetono la prescrizione solo quando era uguale
 * in tutte (es. il riscaldamento), altrimenti restano vuote da scrivere.
 */
export function fitPrescriptions(p: string[], weeks: number): string[] {
  const written = p.filter((x) => x.trim());
  const same = written.length > 0 && written.length === p.length && written.every((x) => x.trim() === written[0].trim());
  return Array.from({ length: weeks }, (_, i) => p[i] ?? (same ? written[0] : ""));
}

/** Copia di un blocco pronta da incollare: id nuovi e settimane del programma di arrivo. */
export function fitBlock(b: ProgramBlock, weeks: number): ProgramBlock {
  return {
    ...structuredClone(b),
    id: newId(),
    items: b.items.map((it) => ({ ...structuredClone(it), id: newId(), prescriptions: fitPrescriptions(it.prescriptions, weeks) })),
  };
}

const fresh = (blocks: ProgramBlock[], weeks: number) => blocks.map((b) => fitBlock(b, weeks));

export type PasteResult = { content: ProgramContent; days: number; removed: number };

/** Al posto dei selezionati: in ogni giorno toglie i selezionati e mette i copiati dove c'era il primo. */
export function replaceSelected(content: ProgramContent, ids: ReadonlySet<string>, clip: ProgramBlock[], weeks: number): PasteResult {
  let days = 0;
  let removed = 0;
  const next = {
    days: content.days.map((d) => {
      const at = d.blocks.findIndex((b) => ids.has(b.id));
      if (at < 0) return d;
      days += 1;
      const kept = d.blocks.filter((b) => !ids.has(b.id));
      removed += d.blocks.length - kept.length;
      // i selezionati prima di `at` non ci sono: `at` è il primo
      return { ...d, blocks: [...kept.slice(0, at), ...fresh(clip, weeks), ...kept.slice(at)] };
    }),
  };
  return { content: next, days, removed };
}

/** Sopra i selezionati: in ogni giorno con una selezione, prima del primo selezionato. */
export function insertBeforeSelected(content: ProgramContent, ids: ReadonlySet<string>, clip: ProgramBlock[], weeks: number): PasteResult {
  let days = 0;
  const next = {
    days: content.days.map((d) => {
      const at = d.blocks.findIndex((b) => ids.has(b.id));
      if (at < 0) return d;
      days += 1;
      return { ...d, blocks: [...d.blocks.slice(0, at), ...fresh(clip, weeks), ...d.blocks.slice(at)] };
    }),
  };
  return { content: next, days, removed: 0 };
}

/** In fondo a un giorno. */
export function appendToDay(content: ProgramContent, dayId: string, clip: ProgramBlock[], weeks: number): PasteResult {
  return {
    content: { days: content.days.map((d) => (d.id === dayId ? { ...d, blocks: [...d.blocks, ...fresh(clip, weeks)] } : d)) },
    days: 1,
    removed: 0,
  };
}

/** Toglie i blocchi selezionati. */
export function deleteSelected(content: ProgramContent, ids: ReadonlySet<string>): PasteResult {
  let days = 0;
  let removed = 0;
  const next = {
    days: content.days.map((d) => {
      const kept = d.blocks.filter((b) => !ids.has(b.id));
      if (kept.length === d.blocks.length) return d;
      days += 1;
      removed += d.blocks.length - kept.length;
      return { ...d, blocks: kept };
    }),
  };
  return { content: next, days, removed };
}

/**
 * Gli stessi posti dei copiati in tutti gli altri giorni: es. copiati i primi 3
 * del giorno 1 → i primi 3 dei giorni 2, 3, 4 (dove ci sono). Esclude i giorni
 * da cui arriva la copia, se è questo programma.
 */
export function samePlaceIds(content: ProgramContent, clip: ProgramClip, programId: string): string[] {
  const skip = clip.programId === programId ? new Set(clip.dayIds) : new Set<string>();
  const n = clip.blocks.length;
  return content.days.filter((d) => !skip.has(d.id)).flatMap((d) => d.blocks.slice(clip.fromIndex, clip.fromIndex + n).map((b) => b.id));
}

/** Nomi dei blocchi copiati, per ricordare cosa c'è negli appunti. */
export function blockNames(blocks: ProgramBlock[]): string[] {
  return blocks.map((b) => {
    if (b.kind === "text") return b.title.trim() || "Testo";
    const names = b.items.map((it) => it.name.trim()).filter(Boolean);
    return names.length ? names.join(" + ") : "Esercizio senza nome";
  });
}

/** "1 esercizio", "3 esercizi" (un gruppo conta come uno). */
export function blocksLabel(n: number): string {
  return n === 1 ? "1 esercizio" : `${n} esercizi`;
}

/** Legge gli appunti salvati (null se non validi). */
export function parseClip(raw: string | null): ProgramClip | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as ProgramClip;
    if (c?.v !== 1) return null;
    const blocks = z.array(programBlockSchema).min(1).safeParse(c.blocks);
    if (!blocks.success) return null;
    return { ...c, blocks: blocks.data, dayIds: Array.isArray(c.dayIds) ? c.dayIds : [], fromIndex: Number.isInteger(c.fromIndex) ? c.fromIndex : 0 };
  } catch {
    return null;
  }
}
