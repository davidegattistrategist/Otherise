/**
 * "Ritocca da qui": l'AI propone modifiche a un pezzo del programma (un
 * esercizio, un giorno o tutto) per alcune settimane, il trainer le rivede
 * riga per riga e applica quelle che vuole. Funzioni pure: cosa può toccare
 * l'AI (`sanitizeChanges`), l'anteprima Prima → Dopo (`previewRows`) e
 * l'applicazione delle righe scelte (`applyChanges`). Le settimane fatte non
 * si toccano mai (vedi locks.ts).
 */
import { mergeSwaps } from "./locks";
import { itemLabel, swapFor, weeksLabel, type ItemSwap, type ProgramContent, type ProgramItem } from "./types";

export type RetouchScope = { kind: "program" } | { kind: "day"; dayId: string } | { kind: "item"; itemId: string };

/** Scorciatoie del "perché" (si aggiungono al testo del trainer). */
export const RETOUCH_REASONS = ["Troppo facile", "Troppo difficile", "Dolore o infortunio", "Manca un attrezzo", "Ha meno tempo"] as const;

export type RetouchSwap = { from: number; to: number; name: string; exerciseId: string | null; notes: string; reason: string };

export type RetouchChange = {
  itemId: string;
  /** prescrizioni nuove per settimana (1 = prima) */
  prescriptions: Array<{ week: number; text: string }>;
  /** recupero nuovo (null = invariato) */
  rest: string | null;
  /** indicazioni nuove (null = invariate) */
  notes: string | null;
  /** sostituto per alcune settimane (null = nessuno) */
  swap: RetouchSwap | null;
  /** perché, in una frase (lo legge il trainer) */
  reason: string;
};

export type RetouchProposal = { summary: string; changes: RetouchChange[] };

type Found = { item: ProgramItem; dayId: string; dayTitle: string; label: string };

/** Gli esercizi dentro il pezzo scelto, con giorno ed etichetta (A1, B…). */
export function scopeItems(content: ProgramContent, scope: RetouchScope): Found[] {
  const out: Found[] = [];
  for (const d of content.days) {
    if (scope.kind === "day" && d.id !== scope.dayId) continue;
    d.blocks.forEach((b, bi) => {
      if (b.kind === "text") return;
      b.items.forEach((it, ii) => {
        if (scope.kind === "item" && it.id !== scope.itemId) return;
        if (!it.name.trim()) return;
        out.push({ item: it, dayId: d.id, dayTitle: d.title, label: itemLabel(b, bi, ii) });
      });
    });
  }
  return out;
}

/** Descrizione del pezzo per il trainer e per l'AI: "Panca piana (Giorno 1)", "Giorno 2", "tutto il programma". */
export function scopeLabel(content: ProgramContent, scope: RetouchScope): string {
  if (scope.kind === "program") return "tutto il programma";
  if (scope.kind === "day") return content.days.find((d) => d.id === scope.dayId)?.title || "il giorno";
  const f = scopeItems(content, scope)[0];
  return f ? `${f.item.name} (${f.dayTitle})` : "l'esercizio";
}

/**
 * Tiene solo quello che l'AI può cambiare: esercizi del pezzo scelto, settimane
 * da `from` a `to` e dopo quelle fatte, niente righe uguali a prima. Il
 * sostituto si stringe alle stesse settimane.
 */
export function sanitizeChanges(
  content: ProgramContent,
  scope: RetouchScope,
  proposal: RetouchProposal,
  range: { from: number; to: number; done: number; weeks: number },
): RetouchChange[] {
  const allowed = new Map(scopeItems(content, scope).map((f) => [f.item.id, f.item]));
  const first = Math.max(range.from, range.done + 1, 1);
  const last = Math.min(range.to, range.weeks);
  const out: RetouchChange[] = [];
  const seen = new Set<string>();
  for (const c of proposal.changes) {
    const it = allowed.get(c.itemId);
    if (!it || seen.has(c.itemId)) continue;
    seen.add(c.itemId);
    const byWeek = new Map<number, string>();
    for (const p of c.prescriptions ?? []) {
      const w = Math.round(p.week);
      const text = (p.text ?? "").trim().slice(0, 200);
      if (w < first || w > last || !text) continue;
      if (text === (it.prescriptions[w - 1] ?? "").trim()) continue;
      byWeek.set(w, text);
    }
    const rest = c.rest !== null && c.rest !== undefined && c.rest.trim() !== it.rest.trim() ? c.rest.trim().slice(0, 100) : null;
    const notes = c.notes !== null && c.notes !== undefined && c.notes.trim() !== it.notes.trim() ? c.notes.trim().slice(0, 1000) : null;
    let swap: RetouchSwap | null = null;
    if (c.swap && c.swap.name.trim() && c.swap.name.trim().toLowerCase() !== it.name.trim().toLowerCase()) {
      const from = Math.max(Math.round(c.swap.from), first);
      const to = Math.min(Math.round(c.swap.to), last);
      if (from <= to) {
        const existing = swapFor(it, from);
        const same = existing && existing.from === from && existing.to === to && existing.name === c.swap.name.trim();
        if (!same) swap = { from, to, name: c.swap.name.trim().slice(0, 200), exerciseId: c.swap.exerciseId ?? null, notes: (c.swap.notes ?? "").trim().slice(0, 1000), reason: (c.swap.reason ?? "").trim().slice(0, 300) };
      }
    }
    const prescriptions = [...byWeek.entries()].sort((a, b) => a[0] - b[0]).map(([week, text]) => ({ week, text }));
    if (!prescriptions.length && rest === null && notes === null && !swap) continue;
    out.push({ itemId: c.itemId, prescriptions, rest, notes, swap, reason: (c.reason ?? "").trim().slice(0, 400) });
  }
  return out;
}

export type PreviewRow = {
  /** chiave della riga da spuntare */
  key: string;
  itemId: string;
  label: string;
  name: string;
  dayTitle: string;
  what: string;
  before: string;
  after: string;
};

export type PreviewGroup = { itemId: string; label: string; name: string; dayTitle: string; reason: string; rows: PreviewRow[] };

/** Anteprima Prima → Dopo, raggruppata per esercizio. */
export function previewRows(content: ProgramContent, changes: RetouchChange[]): PreviewGroup[] {
  const found = new Map(scopeItems(content, { kind: "program" }).map((f) => [f.item.id, f]));
  const groups: PreviewGroup[] = [];
  for (const c of changes) {
    const f = found.get(c.itemId);
    if (!f) continue;
    const base = { itemId: c.itemId, label: f.label, name: f.item.name, dayTitle: f.dayTitle };
    const rows: PreviewRow[] = [];
    if (c.swap) {
      const cur = swapFor(f.item, c.swap.from);
      rows.push({ ...base, key: `${c.itemId}:swap`, what: `Sostituto · ${weeksLabel(c.swap.from, c.swap.to)}`, before: cur ? cur.name : f.item.name, after: `${c.swap.name}${c.swap.reason ? ` (${c.swap.reason})` : ""}` });
    }
    for (const p of c.prescriptions) rows.push({ ...base, key: `${c.itemId}:w${p.week}`, what: `Settimana ${p.week}`, before: f.item.prescriptions[p.week - 1] || "—", after: p.text });
    if (c.rest !== null) rows.push({ ...base, key: `${c.itemId}:rest`, what: "Recupero", before: f.item.rest || "—", after: c.rest || "—" });
    if (c.notes !== null) rows.push({ ...base, key: `${c.itemId}:notes`, what: "Indicazioni", before: f.item.notes || "—", after: c.notes || "—" });
    if (rows.length) groups.push({ ...base, reason: c.reason, rows });
  }
  return groups;
}

/** Tutte le chiavi delle righe (di partenza sono tutte spuntate). */
export function allRowKeys(groups: PreviewGroup[]): string[] {
  return groups.flatMap((g) => g.rows.map((r) => r.key));
}

/** Mette il sostituto nelle sue settimane, togliendo da quelle settimane i sostituti di prima. */
export function placeSwap(swaps: ItemSwap[] | undefined, s: RetouchSwap): ItemSwap[] {
  const kept: ItemSwap[] = [];
  for (const old of swaps ?? []) {
    if (old.to < s.from || old.from > s.to) kept.push(old);
    else {
      if (old.from < s.from) kept.push({ ...old, to: s.from - 1 });
      if (old.to > s.to) kept.push({ ...old, from: s.to + 1 });
    }
  }
  return mergeSwaps([...kept, { from: s.from, to: s.to, name: s.name, exerciseId: s.exerciseId, notes: s.notes, reason: s.reason }]);
}

/** Applica solo le righe spuntate. Restituisce un programma nuovo (quello di partenza non cambia). */
export function applyChanges(content: ProgramContent, changes: RetouchChange[], accepted: ReadonlySet<string>): ProgramContent {
  const byItem = new Map(changes.map((c) => [c.itemId, c]));
  return {
    days: content.days.map((d) => ({
      ...d,
      blocks: d.blocks.map((b) => ({
        ...b,
        items: b.items.map((it) => {
          const c = byItem.get(it.id);
          if (!c) return it;
          const next: ProgramItem = { ...it, prescriptions: [...it.prescriptions] };
          for (const p of c.prescriptions) if (accepted.has(`${it.id}:w${p.week}`) && p.week >= 1 && p.week <= next.prescriptions.length) next.prescriptions[p.week - 1] = p.text;
          if (c.rest !== null && accepted.has(`${it.id}:rest`)) next.rest = c.rest;
          if (c.notes !== null && accepted.has(`${it.id}:notes`)) next.notes = c.notes;
          if (c.swap && accepted.has(`${it.id}:swap`)) next.swaps = placeSwap(it.swaps, c.swap);
          return next;
        }),
      })),
    })),
  };
}
