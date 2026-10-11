/**
 * Cosa ha corretto il trainer in una bozza dell'AI prima di pubblicarla:
 * righe aggiunte, tolte, sostituite e prescrizioni cambiate. Serve all'AI per
 * imparare (src/lib/ai/learn.ts) e al trainer per vedere se le correzioni calano.
 */
import type { ProgramContent, ProgramItem } from "./types";

export type ProgramDiff = { total: number; changed: number; lines: string[] };

type Row = { item: ProgramItem; day: string };

function rows(content: ProgramContent): Map<string, Row> {
  const out = new Map<string, Row>();
  for (const d of content.days) for (const b of d.blocks) for (const it of b.items) if (it.name.trim()) out.set(it.id, { item: it, day: d.title });
  return out;
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const weeksText = (p: string[]) => p.map((x) => x.trim() || "—").join(" | ");

/** Confronta la bozza dell'AI con il programma finale del trainer. */
export function diffPrograms(ai: ProgramContent, final: ProgramContent): ProgramDiff {
  const a = rows(ai);
  const f = rows(final);
  const lines: string[] = [];
  let changed = 0;
  // stesso esercizio con id diverso (riga rifatta da zero): abbina per nome nella stessa giornata
  const aByName = new Map<string, string>();
  for (const [id, r] of a) aByName.set(`${norm(r.day)}|${norm(r.item.name)}`, id);
  const matched = new Set<string>();

  for (const [id, r] of f) {
    const aid = a.has(id) ? id : aByName.get(`${norm(r.day)}|${norm(r.item.name)}`);
    const prev = aid ? a.get(aid) : undefined;
    if (!prev) {
      changed++;
      lines.push(`+ ${r.day}: aggiunto "${r.item.name}" ${weeksText(r.item.prescriptions)}${r.item.rest ? ` rec ${r.item.rest}` : ""}`);
      continue;
    }
    matched.add(aid!);
    const parts: string[] = [];
    if (norm(prev.item.name) !== norm(r.item.name)) parts.push(`esercizio "${prev.item.name}" → "${r.item.name}"`);
    if (prev.item.prescriptions.map(norm).join("|") !== r.item.prescriptions.map(norm).join("|")) {
      parts.push(`prescrizioni ${weeksText(prev.item.prescriptions)} → ${weeksText(r.item.prescriptions)}`);
    }
    if (norm(prev.item.rest) !== norm(r.item.rest)) parts.push(`recupero "${prev.item.rest || "—"}" → "${r.item.rest || "—"}"`);
    if (norm(prev.item.notes) !== norm(r.item.notes)) parts.push(`indicazioni "${prev.item.notes.slice(0, 80) || "—"}" → "${r.item.notes.slice(0, 120) || "—"}"`);
    if (parts.length) {
      changed++;
      lines.push(`~ ${r.day}: ${r.item.name}: ${parts.join("; ")}`);
    }
  }
  for (const [id, r] of a) {
    if (f.has(id) || matched.has(id)) continue;
    changed++;
    lines.push(`- ${r.day}: tolto "${r.item.name}" ${weeksText(r.item.prescriptions)}`);
  }
  const aDays = ai.days.length;
  const fDays = final.days.length;
  if (aDays !== fDays) lines.unshift(`Giornate: ${aDays} → ${fDays}`);
  return { total: Math.max(f.size, a.size), changed, lines };
}

/** Testo compatto (con un tetto di lunghezza) per l'AI. */
export function diffText(d: ProgramDiff, max = 2500): string {
  if (!d.lines.length) return "Nessuna correzione: bozza pubblicata così com'era.";
  let out = `${d.changed} righe corrette su ${d.total}:\n`;
  for (const l of d.lines) {
    if (out.length + l.length > max) {
      out += "…";
      break;
    }
    out += `${l}\n`;
  }
  return out.trim();
}
