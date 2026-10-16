/**
 * "Fase precedente" nell'editor: una fase vecchia del cliente in forma
 * leggera da consultare mentre si scrive quella nuova (prescrizione e
 * cosa ha fatto davvero, settimana per settimana). Solo calcoli.
 */
import type { ISODate } from "../dates";
import { blockLetter, blockSummary, itemLabel, BLOCK_KIND_LABELS, type ProgramContent } from "./types";
import { summarizeSets, type SetLog } from "./prescription";

export type CompareItem = {
  id: string;
  label: string;
  name: string;
  /** chiave per riconoscere lo stesso esercizio nell'editor */
  key: string;
  rest: string;
  notes: string;
  prescriptions: string[];
  /** cosa ha fatto, per settimana (null = niente registrato) */
  done: Array<string | null>;
};
export type CompareBlock = { id: string; heading: string; text: string; items: CompareItem[] };
export type CompareDay = { id: string; title: string; blocks: CompareBlock[] };
export type CompareView = {
  id: string;
  title: string;
  weeks: number;
  start_date: ISODate | null;
  days: CompareDay[];
  /** settimane con almeno un allenamento registrato (0 = prima) */
  loggedWeeks: number[];
};

export type PhaseOption = { id: string; title: string; start_date: ISODate | null; weeks: number; status: string };

/** Stessa chiave nell'editor e nel pannello: esercizio dell'eserciziario o nome scritto. */
export function exerciseKey(it: { exerciseId?: string | null; name: string }): string {
  return it.exerciseId ? `id:${it.exerciseId}` : `n:${it.name.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

/** Le fasi da proporre (dalla più recente) e quella da aprire: l'ultima iniziata prima di questa. */
export function previousPhases(all: PhaseOption[], current: { id: string; start_date: ISODate | null }): { phases: PhaseOption[]; defaultId: string | null } {
  const phases = all
    .filter((p) => p.id !== current.id)
    .sort((a, b) => (a.start_date === b.start_date ? 0 : !a.start_date ? 1 : !b.start_date ? -1 : a.start_date < b.start_date ? 1 : -1));
  const before = current.start_date ? phases.find((p) => p.start_date && p.start_date < current.start_date!) : null;
  return { phases, defaultId: (before ?? phases[0])?.id ?? null };
}

export function buildCompareView(
  program: { id: string; title: string; weeks: number; start_date: ISODate | null },
  content: ProgramContent,
  logs: Array<{ id: string; week: number; day_id: string; performed_on: ISODate }>,
  exerciseLogs: Array<{ workout_log_id: string; item_id: string; sets: unknown; result_text: string }>,
): CompareView {
  // per (settimana, giorno) il log più recente
  const logBy = new Map<string, { id: string; performed_on: ISODate }>();
  for (const l of logs) {
    const k = `${l.week}:${l.day_id}`;
    const prev = logBy.get(k);
    if (!prev || l.performed_on > prev.performed_on) logBy.set(k, l);
  }
  const doneBy = new Map<string, string>();
  for (const e of exerciseLogs) {
    const txt = summarizeSets(e.sets as SetLog[]) ?? (e.result_text ?? "").trim();
    if (txt) doneBy.set(`${e.workout_log_id}:${e.item_id}`, txt);
  }
  const weeks = Math.max(1, program.weeks);
  const loggedWeeks = new Set<number>();
  const days: CompareDay[] = content.days.map((d) => ({
    id: d.id,
    title: d.title,
    blocks: d.blocks.map((b, bi) => {
      const extra = blockSummary(b);
      const multi = b.kind !== "single" && b.kind !== "text";
      return {
        id: b.id,
        heading: b.kind === "text" ? b.title || "Testo" : multi ? [`${blockLetter(bi)} · ${BLOCK_KIND_LABELS[b.kind]}`, extra].filter(Boolean).join(" · ") : "",
        text: b.kind === "text" ? b.notes : "",
        items:
          b.kind === "text"
            ? []
            : b.items
                // etichette come nell'editor (A1, A2…): prima si numerano, poi si tolgono le righe vuote
                .map((it, ii) => ({ it, ii }))
                .filter(({ it }) => it.name.trim())
                .map(({ it, ii }) => ({
                  id: it.id,
                  label: itemLabel(b, bi, ii),
                  name: it.name.trim(),
                  key: exerciseKey(it),
                  rest: it.rest,
                  notes: it.notes,
                  prescriptions: Array.from({ length: weeks }, (_, w) => it.prescriptions[w] ?? ""),
                  done: Array.from({ length: weeks }, (_, w) => {
                    const log = logBy.get(`${w + 1}:${d.id}`);
                    const txt = log ? doneBy.get(`${log.id}:${it.id}`) ?? null : null;
                    if (txt) loggedWeeks.add(w);
                    return txt;
                  }),
                })),
      };
    }),
  }));
  return { id: program.id, title: program.title, weeks, start_date: program.start_date, days, loggedWeeks: [...loggedWeeks].sort((a, b) => a - b) };
}

/** Dove compare un esercizio nella fase: per la scheda "Stai scrivendo". */
export function findExercise(view: CompareView, key: string): Array<{ dayIndex: number; day: CompareDay; item: CompareItem }> {
  const out: Array<{ dayIndex: number; day: CompareDay; item: CompareItem }> = [];
  view.days.forEach((day, dayIndex) => {
    for (const b of day.blocks) for (const item of b.items) if (item.key === key) out.push({ dayIndex, day, item });
  });
  return out;
}
