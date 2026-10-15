/**
 * Import dell'eserciziario da CSV con colonne: Esercizio, Video, Note
 * (la scheda "Eserciziario" dei fogli, esportata come .csv).
 */
import { parseCsv } from "./csv";

export type ExerciseRow = { name: string; video_url: string | null; description: string };

export function parseExerciseCsv(text: string): { rows: ExerciseRow[]; duplicates: string[] } {
  const all = parseCsv(text);
  if (all.length === 0) return { rows: [], duplicates: [] };
  const header = all[0].map((h) => h.trim().toLowerCase());
  const hasHeader = header.includes("esercizio") || header.includes("nome") || header.includes("name");
  const idx = (names: string[], fallback: number) => {
    const i = header.findIndex((h) => names.includes(h));
    return hasHeader && i >= 0 ? i : fallback;
  };
  const iName = idx(["esercizio", "nome", "name"], 0);
  const iVideo = idx(["video", "link", "url"], 1);
  const iNotes = idx(["note", "descrizione", "description", "notes"], 2);
  const seen = new Map<string, ExerciseRow>();
  const duplicates: string[] = [];
  for (const r of all.slice(hasHeader ? 1 : 0)) {
    const name = (r[iName] ?? "").trim().replace(/\s+/g, " ");
    if (!name) continue;
    const key = name.toLowerCase();
    const video = (r[iVideo] ?? "").trim();
    const row: ExerciseRow = {
      name,
      video_url: /^https?:\/\//i.test(video) ? video : null,
      description: (r[iNotes] ?? "").trim(),
    };
    if (seen.has(key)) {
      duplicates.push(name);
      // tiene la versione più completa
      const prev = seen.get(key)!;
      if (!prev.video_url && row.video_url) prev.video_url = row.video_url;
      if (!prev.description && row.description) prev.description = row.description;
      continue;
    }
    seen.set(key, row);
  }
  return { rows: [...seen.values()], duplicates };
}

export { youtubeId, youtubeThumb } from "../youtube";
