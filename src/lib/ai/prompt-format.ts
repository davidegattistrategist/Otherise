/** Formati compatti per i messaggi all'AI (funzioni pure, testate in lib.test.ts). */
import type { ProgramContent } from "../program/types";

/** Codici corti per gli esercizi ("E12") al posto degli id lunghi: costano molto meno all'AI. */
export function exerciseCodes(exercises: Array<{ id: string; name: string }>) {
  const codeById = new Map<string, string>();
  const idByCode = new Map<string, string>();
  exercises.forEach((e, i) => {
    const code = `E${i + 1}`;
    codeById.set(e.id, code);
    idByCode.set(code, e.id);
  });
  return { codeById, idByCode };
}

/** Programma in JSON compatto: niente campi vuoti, esercizi con il codice corto. */
export function compactProgram(current: { title: string; description: string; weeks: number; content: ProgramContent }, codeById: Map<string, string>) {
  const clean = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)));
  return JSON.stringify(
    clean({
      title: current.title,
      description: current.description,
      weeks: current.weeks,
      days: current.content.days.map((d) =>
        clean({
          id: d.id,
          title: d.title,
          notes: d.notes,
          blocks: d.blocks.map((b) =>
            clean({ ...b, items: b.items.map((it) => clean({ ...it, exerciseId: it.exerciseId ? codeById.get(it.exerciseId) ?? null : null })) }),
          ),
        }),
      ),
    }),
  );
}

