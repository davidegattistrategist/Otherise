/**
 * Import di un programma dai fogli Google usati finora.
 *
 * Come esportare: nel foglio del cliente apri la scheda del programma,
 * File → Scarica → Valori separati da virgola (.csv). Il file contiene solo
 * la scheda aperta.
 *
 * Struttura attesa (quella del template "BASE Programma"):
 *   colonna A  "Circuito" (facoltativo) sulla prima riga di un gruppo
 *   colonna B  "Giorno N …" (intestazione) oppure nome esercizio oppure "Log"
 *   colonna C  link al video
 *   colonne E–J  Week 1 … Week 6 (sulla riga "Log": quanto fatto dal cliente)
 *   colonna K  Rest
 *   colonna L  Indicazioni
 * Le righe "Circuito" diventano una superserie con l'esercizio successivo:
 * nei fogli il gruppo non è sempre chiaro, quindi l'anteprima va controllata.
 */
import { parseCsv } from "./csv";
import { newId, type ProgramBlock, type ProgramContent, type ProgramDay, type ProgramItem } from "../program/types";

const COL = { marker: 0, name: 1, video: 2, firstWeek: 4, rest: 10, notes: 11 } as const;
const MAX_WEEKS = 6;

export type ImportedLog = { dayId: string; itemId: string; week: number; text: string };
export type ImportedVideo = { itemName: string; url: string };

export type SheetImport = {
  content: ProgramContent;
  weeks: number;
  logs: ImportedLog[];
  videos: ImportedVideo[];
  warnings: string[];
};

const cell = (r: string[], i: number) => (r[i] ?? "").trim();
const isDayHeader = (r: string[]) => /^giorno\b/i.test(cell(r, COL.name)) && /^week\s*1$/i.test(cell(r, COL.firstWeek));
const isLogRow = (r: string[]) => /^log$/i.test(cell(r, COL.name));
const isCircuit = (r: string[]) => /^cir/i.test(cell(r, COL.marker));
const looksLikeUrl = (s: string) => /^https?:\/\//i.test(s);

export function parseProgramSheet(csvText: string, matchExercise?: (name: string) => string | null): SheetImport {
  const rows = parseCsv(csvText);
  const warnings: string[] = [];
  const days: ProgramDay[] = [];
  const logs: ImportedLog[] = [];
  const videos: ImportedVideo[] = [];
  let day: ProgramDay | null = null;
  let lastItem: ProgramItem | null = null;
  let pendingGroup: ProgramBlock | null = null; // superserie aperta da una riga "Circuito"
  let maxWeek = 0;

  for (const r of rows) {
    if (isDayHeader(r)) {
      day = { id: newId(), title: cell(r, COL.name), notes: "", blocks: [] };
      days.push(day);
      lastItem = null;
      pendingGroup = null;
      continue;
    }
    if (!day) continue;

    if (isLogRow(r)) {
      if (!lastItem) continue;
      for (let w = 0; w < MAX_WEEKS; w++) {
        const text = cell(r, COL.firstWeek + w);
        if (text) logs.push({ dayId: day.id, itemId: lastItem.id, week: w + 1, text });
      }
      continue;
    }

    const name = cell(r, COL.name);
    if (!name) continue;

    const prescriptions: string[] = [];
    for (let w = 0; w < MAX_WEEKS; w++) {
      const v = cell(r, COL.firstWeek + w);
      prescriptions.push(v);
      if (v) maxWeek = Math.max(maxWeek, w + 1);
    }
    const rest = cell(r, COL.rest);
    const video = cell(r, COL.video);
    const item: ProgramItem = {
      id: newId(),
      exerciseId: matchExercise?.(name) ?? null,
      name,
      rest: rest === "-" ? "" : rest,
      notes: cell(r, COL.notes),
      prescriptions,
    };
    if (looksLikeUrl(video)) videos.push({ itemName: name, url: video });
    lastItem = item;

    if (isCircuit(r)) {
      pendingGroup = { id: newId(), kind: "superset", title: "", notes: "", rounds: null, items: [item] };
      day.blocks.push(pendingGroup);
      continue;
    }
    if (pendingGroup && pendingGroup.items.length === 1) {
      // l'esercizio dopo una riga "Circuito" chiude la superserie
      pendingGroup.items.push(item);
      pendingGroup = null;
      continue;
    }
    pendingGroup = null;
    day.blocks.push({ id: newId(), kind: "single", title: "", notes: "", items: [item] });
  }

  // una "superserie" rimasta con un solo esercizio torna singola
  for (const d of days) {
    for (const b of d.blocks) if (b.kind === "superset" && b.items.length < 2) b.kind = "single";
  }
  const nonEmptyDays = days.filter((d) => d.blocks.length > 0);
  if (nonEmptyDays.length === 0) warnings.push("Non ho trovato giorni con esercizi: controlla di aver esportato la scheda del programma.");
  if (nonEmptyDays.some((d) => d.blocks.some((b) => b.kind === "superset"))) {
    warnings.push("Le righe \"Circuito\" sono diventate superserie con l'esercizio successivo: controlla i gruppi nell'anteprima.");
  }

  const weeks = Math.max(1, maxWeek);
  const content: ProgramContent = {
    days: nonEmptyDays.map((d) => ({
      ...d,
      blocks: d.blocks.map((b) => ({ ...b, items: b.items.map((it) => ({ ...it, prescriptions: it.prescriptions.slice(0, weeks) })) })),
    })),
  };
  return { content, weeks, logs: logs.filter((l) => l.week <= weeks), videos, warnings };
}
