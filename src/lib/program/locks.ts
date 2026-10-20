/**
 * Settimane fatte di un programma in corso: restano come le ha viste il
 * cliente (e come le ha registrate nel logbook). Qualsiasi modifica, a mano,
 * con le progressioni, con il copia e incolla o con l'AI, cambia solo le
 * settimane dopo; per correggere un errore il trainer le sblocca.
 */
import { nextWorkout, type LoggedDay } from "./schedule";
import type { ItemSwap, ProgramContent, ProgramItem } from "./types";

/**
 * Quante settimane sono fatte: quelle prima della settimana del prossimo
 * allenamento in sequenza (0 = nessuna; tutte se la fase è finita).
 */
export function doneWeeks(content: ProgramContent, weeks: number, logs: LoggedDay[]): number {
  if (!content.days.length || !logs.some((l) => l.completed)) return 0;
  const next = nextWorkout(content, weeks, logs);
  return next ? next.week - 1 : weeks;
}

const clip = (s: ItemSwap, from: number, to: number): ItemSwap | null => {
  const f = Math.max(s.from, from);
  const t = Math.min(s.to, to);
  return f <= t ? { ...s, from: f, to: t } : null;
};

/** Unisce i pezzi contigui dello stesso sostituto (es. 2–2 bloccato + 3–4 nuovo = 2–4). */
export function mergeSwaps(list: ItemSwap[]): ItemSwap[] {
  const sorted = [...list].sort((a, b) => a.from - b.from);
  const out: ItemSwap[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && last.to + 1 >= s.from && last.name === s.name && (last.exerciseId ?? null) === (s.exerciseId ?? null) && (last.notes ?? "") === (s.notes ?? "")) {
      out[out.length - 1] = { ...last, to: Math.max(last.to, s.to) };
    } else if (!last || s.from > last.to) out.push(s);
    // sovrapposto a uno precedente (non dovrebbe succedere): vince il primo
    else if (s.to > last.to) out.push({ ...s, from: last.to + 1 });
  }
  return out;
}

function lockedSwaps(base: ProgramItem | undefined, next: ProgramItem, through: number, weeks: number): ItemSwap[] | undefined {
  const kept = (base?.swaps ?? []).map((s) => clip(s, 1, through)).filter((s): s is ItemSwap => Boolean(s));
  const open = (next.swaps ?? []).map((s) => clip(s, through + 1, weeks)).filter((s): s is ItemSwap => Boolean(s));
  const all = mergeSwaps([...kept, ...open]);
  return all.length ? all : undefined;
}

/**
 * Riporta le settimane fatte (da 1 a `through`) com'erano in `base`:
 * prescrizioni e sostituzioni. Un esercizio nuovo nelle settimane fatte resta
 * vuoto (non l'ha fatto). Tutto il resto (nomi, recuperi, settimane dopo) è
 * quello di `next`.
 */
export function keepLockedWeeks(next: ProgramContent, base: ProgramContent, through: number): ProgramContent {
  if (through <= 0) return next;
  const before = new Map(base.days.flatMap((d) => d.blocks.flatMap((b) => b.items.map((it) => [it.id, it] as const))));
  let changed = false;
  const days = next.days.map((d) => ({
    ...d,
    blocks: d.blocks.map((b) => ({
      ...b,
      items: b.items.map((it) => {
        const old = before.get(it.id);
        const weeks = it.prescriptions.length;
        const prescriptions = it.prescriptions.map((p, w) => (w < through ? old?.prescriptions[w] ?? "" : p));
        const swaps = lockedSwaps(old, it, through, Math.max(weeks, 1));
        const same = prescriptions.every((p, w) => p === it.prescriptions[w]) && JSON.stringify(swaps ?? null) === JSON.stringify(it.swaps?.length ? it.swaps : null);
        if (same) return it;
        changed = true;
        const out: ProgramItem = { ...it, prescriptions };
        if (swaps) out.swaps = swaps;
        else delete out.swaps;
        return out;
      }),
    })),
  }));
  return changed ? { days } : next;
}

/** Le settimane fatte sono diverse tra le due versioni (per riprendere una bozza con le settimane sbloccate). */
export function lockedWeeksDiffer(a: ProgramContent, b: ProgramContent, through: number): boolean {
  return keepLockedWeeks(a, b, through) !== a;
}

/**
 * Le sostituzioni temporanee del programma di partenza restano sugli
 * esercizi che la bozza dell'AI tiene (stesso id): l'AI riscrive le
 * prescrizioni, non deve far sparire un sostituto deciso dal trainer.
 */
export function carrySwaps(next: ProgramContent, prev: ProgramContent): ProgramContent {
  const swaps = new Map(prev.days.flatMap((d) => d.blocks.flatMap((b) => b.items.filter((it) => it.swaps?.length).map((it) => [it.id, it.swaps!] as const))));
  if (!swaps.size) return next;
  return {
    days: next.days.map((d) => ({
      ...d,
      blocks: d.blocks.map((b) => ({ ...b, items: b.items.map((it) => (swaps.has(it.id) && !it.swaps?.length ? { ...it, swaps: swaps.get(it.id)! } : it)) })),
    })),
  };
}
