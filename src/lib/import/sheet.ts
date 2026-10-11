/**
 * Import di un programma dai fogli Google usati finora.
 *
 * Come esportare: nel foglio del cliente apri la scheda del programma,
 * File → Scarica → Valori separati da virgola (.csv). Il file contiene solo
 * la scheda aperta.
 *
 * Struttura attesa (quella del template "BASE Programma"):
 *   riga di intestazione di ogni giorno: "Giorno N …", poi "Week 1", "Week 2"…,
 *     "Rest", "Indicazioni", "Video". Le colonne si leggono dall'intestazione,
 *     così vanno bene anche i fogli con una colonna in più o una settimana 7.
 *   colonna A  "Circuito" / "Superserie" (facoltativo, anche "Circuito 4 giri")
 *     sul primo esercizio di un gruppo
 *   colonna del giorno  nome esercizio oppure "Log"
 *   colonna dopo il nome  link al video
 *   righe "Log": quanto fatto dal cliente, settimana per settimana
 *
 * Regole:
 *   - un gruppo ("Circuito") va avanti fino all'esercizio che ha il recupero
 *     (compreso), al gruppo successivo o alla fine del giorno; "N giri" dà un
 *     circuito con N giri, altrimenti due esercizi sono una superserie e tre o
 *     più un circuito (senza indicazione dei giri, un gruppo si ferma a due
 *     esercizi se nessuno ha il recupero);
 *   - una settimana lasciata vuota ripete quella prima (nei fogli si scrive
 *     solo quando cambia);
 *   - un esercizio senza prescrizioni ma con indicazioni (es. "Posturale
 *     (leggi note)") diventa un blocco di testo.
 */
import { parseCsv } from "./csv";
import { newId, type ProgramBlock, type ProgramContent, type ProgramDay, type ProgramItem } from "../program/types";

const MAX_WEEKS = 12;

export type ImportedLog = { dayId: string; itemId: string; week: number; text: string };
export type ImportedVideo = { itemName: string; url: string };

export type SheetImport = {
  content: ProgramContent;
  weeks: number;
  logs: ImportedLog[];
  videos: ImportedVideo[];
  warnings: string[];
};

type Cols = { name: number; video: number; weeks: number[]; rest: number; notes: number; logWeeks: number[] };

const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
const looksLikeUrl = (s: string) => /^https?:\/\//i.test(s);
const isGroupMarker = (s: string) => /^(cir|cri|super|tri|giant)/i.test(s.trim());

const find = (r: string[], re: RegExp) => r.findIndex((c) => re.test((c ?? "").trim()));
const WEEK = /^(?:week|settimana|sett\.?|s)\s*(\d{1,2})$/i;

function numbered(r: string[], from: number, to: number): number[] {
  const out: number[] = [];
  r.forEach((c, i) => {
    if (i < from || i >= to) return;
    const m = WEEK.exec((c ?? "").trim());
    if (m && out[Number(m[1]) - 1] === undefined) out[Number(m[1]) - 1] = i;
  });
  return out.filter((x) => x !== undefined).slice(0, MAX_WEEKS);
}

/**
 * Riga di intestazione: colonne "Week 1"/"Settimana 1"/"S1"… (prescrizioni),
 * "Rest", "Indicazioni", "Video" e, nei fogli vecchi, di nuovo "Week 1"… a
 * destra (il logbook del cliente). Se prima delle settimane c'è un titolo
 * ("Giorno 1", "FORZA A") è l'inizio di un giorno; altrimenti è l'intestazione
 * unica del foglio e i giorni sono righe "Giorno N".
 */
function parseHeader(r: string[]): { cols: Cols; title: string | null } | null {
  const rest = find(r, /^(rest|recupero)$/i);
  const notes = find(r, /^indicazioni$/i);
  const end = rest >= 0 ? rest : notes;
  if (end < 0) return null;
  const weeks = numbered(r, 0, end);
  if (weeks.length === 0) return null;
  const after = Math.max(rest, notes, find(r, /^video$/i));
  const logWeeks = numbered(r, after + 1, r.length);
  const nameIdx = r.slice(0, weeks[0]).findIndex((c) => (c ?? "").trim() !== "");
  const base = { weeks, rest, notes, logWeeks };
  if (nameIdx >= 0) return { cols: { ...base, name: nameIdx, video: nameIdx + 1 }, title: cell(r, nameIdx) };
  return { cols: { ...base, name: 1, video: 2 }, title: null };
}

function groupRounds(marker: string): number | null {
  const m = /(\d{1,2})\s*(giri|round)/i.exec(marker);
  return m ? Number(m[1]) : null;
}

export function parseProgramSheet(csvText: string, matchExercise?: (name: string) => string | null): SheetImport {
  const rows = parseCsv(csvText);
  const warnings: string[] = [];
  const days: ProgramDay[] = [];
  const logs: ImportedLog[] = [];
  const videos: ImportedVideo[] = [];
  let day: ProgramDay | null = null;
  let cols: Cols | null = null;
  let global: Cols | null = null;
  let lastItem: ProgramItem | null = null;
  let group: { block: ProgramBlock; withRounds: boolean; closed: boolean } | null = null;
  let maxWeek = 0;

  const closeGroup = () => {
    if (group) group.closed = true;
    group = null;
  };

  for (const r of rows) {
    const h = parseHeader(r);
    if (h && h.title === null) {
      global = h.cols;
      continue;
    }
    const header = h?.cols ?? (global ? dayFromGlobal(r, global) : null);
    if (header) {
      cols = header;
      day = { id: newId(), title: cell(r, header.name), notes: "", blocks: [] };
      days.push(day);
      lastItem = null;
      closeGroup();
      continue;
    }
    if (!day || !cols) continue;

    const name = cell(r, cols.name);
    if (/^log$/i.test(name)) {
      if (!lastItem) continue;
      cols.weeks.forEach((c, w) => {
        const text = cell(r, c);
        if (text && !looksLikeUrl(text)) logs.push({ dayId: day!.id, itemId: lastItem!.id, week: w + 1, text });
      });
      continue;
    }
    if (!name) continue;

    const prescriptions = cols.weeks.map((c) => cell(r, c));
    prescriptions.forEach((v, w) => {
      if (v) maxWeek = Math.max(maxWeek, w + 1);
    });
    const restRaw = cell(r, cols.rest);
    const rest = restRaw === "-" ? "" : restRaw;
    const video = cell(r, cols.video);
    const notes = cell(r, cols.notes);
    if (looksLikeUrl(video)) videos.push({ itemName: name, url: video });
    // fogli vecchi: il logbook è sulla stessa riga, nelle colonne "Week N" a destra
    const inlineLogs = cols.logWeeks.map((c, w) => ({ w, text: cell(r, c) })).filter((l) => l.text && !looksLikeUrl(l.text));

    // esercizio senza prescrizioni ma con indicazioni: è un testo (es. routine posturale)
    if (prescriptions.every((p) => !p) && notes) {
      closeGroup();
      day.blocks.push({ id: newId(), kind: "text", title: name, notes, items: [] });
      lastItem = null;
      continue;
    }

    const item: ProgramItem = { id: newId(), exerciseId: matchExercise?.(name) ?? null, name, rest, notes, prescriptions };
    lastItem = item;
    for (const l of inlineLogs) logs.push({ dayId: day.id, itemId: item.id, week: l.w + 1, text: l.text });
    const before = r.slice(0, cols.name).map((c) => (c ?? "").trim()).filter(Boolean);
    const marker = before.find(isGroupMarker) ?? "";
    // indicazioni scritte nelle colonne a sinistra (es. "Falli uno dietro l'altro senza recupero")
    const sideNote = before.filter((t) => t !== marker && t.length > 3).join(" ");
    if (sideNote) item.notes = item.notes ? `${sideNote}. ${item.notes}` : sideNote;

    if (isGroupMarker(marker)) {
      closeGroup();
      const rounds = groupRounds(marker);
      const block: ProgramBlock = { id: newId(), kind: "superset", title: "", notes: "", rounds, items: [item] };
      day.blocks.push(block);
      group = { block, withRounds: rounds !== null, closed: false };
      if (rest) closeGroup();
      continue;
    }
    if (group && !group.closed) {
      group.block.items.push(item);
      // il recupero chiude il gruppo; senza giri indicati un gruppo resta di due esercizi
      if (rest || (!group.withRounds && group.block.items.length >= 2 && !nextHasRestSoon(rows, r, cols))) closeGroup();
      continue;
    }
    day.blocks.push({ id: newId(), kind: "single", title: "", notes: "", items: [item] });
  }

  for (const d of days) {
    for (const b of d.blocks) {
      if (b.kind !== "superset") continue;
      if (b.items.length < 2) {
        b.kind = "single";
        b.rounds = null;
      } else if (b.items.length > 2 || b.rounds) {
        b.kind = "circuit";
      }
    }
  }
  const nonEmptyDays = days.filter((d) => d.blocks.length > 0);
  if (nonEmptyDays.length === 0) warnings.push("Non ho trovato giorni con esercizi: controlla di aver esportato la scheda del programma.");
  if (nonEmptyDays.some((d) => d.blocks.some((b) => b.kind === "superset" || b.kind === "circuit"))) {
    warnings.push("Le righe \"Circuito\" sono diventate superserie o circuiti: controlla i gruppi nell'anteprima.");
  }

  const weeks = Math.max(1, Math.min(MAX_WEEKS, maxWeek));
  // una settimana vuota ripete quella prima
  // nei fogli vecchi le settimane dopo la prima riportano spesso solo il carico ("40kg"):
  // serie e ripetizioni restano quelle della settimana prima
  const LOAD_ONLY = /^\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?\s*kg$/i;
  const SCHEME = /^\d{1,2}\s*[x×]\s*\d/i;
  const fill = (p: string[]) => {
    const out = p.slice(0, weeks);
    while (out.length < weeks) out.push("");
    for (let w = 1; w < out.length; w++) {
      if (!out[w] && out[w - 1]) out[w] = out[w - 1];
      else if (LOAD_ONLY.test(out[w]) && SCHEME.test(out[w - 1])) {
        const scheme = out[w - 1].replace(/\s*\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?\s*kg\b/i, "").trim();
        out[w] = `${scheme} ${out[w].replace(/\s+/g, "")}`;
      }
    }
    return out;
  };
  const content: ProgramContent = {
    days: nonEmptyDays.map((d) => ({
      ...d,
      blocks: d.blocks.map((b) => ({ ...b, items: b.items.map((it) => ({ ...it, prescriptions: fill(it.prescriptions) })) })),
    })),
  };
  return { content, weeks, logs: logs.filter((l) => l.week <= weeks), videos, warnings };
}

/** Riga "Giorno N" nei fogli vecchi: la colonna del nome è quella del "Giorno". */
function dayFromGlobal(r: string[], g: Cols): Cols | null {
  const limit = g.weeks[0] ?? 4;
  for (let i = 0; i < limit; i++) if (/^giorno\b/i.test((r[i] ?? "").trim())) return { ...g, name: i, video: i + 1 };
  return null;
}

/** Un gruppo senza giri si allunga a tre esercizi solo se il terzo chiude con il recupero (triserie). */
function nextHasRestSoon(rows: string[][], current: string[], cols: Cols): boolean {
  const i = rows.indexOf(current);
  for (let j = i + 1; j < rows.length; j++) {
    const r = rows[j];
    if (parseHeader(r)) return false;
    const name = cell(r, cols.name);
    if (!name || /^log$/i.test(name)) continue;
    if (r.slice(0, cols.name).some((c) => isGroupMarker(c ?? ""))) return false;
    // conta solo il primo esercizio dopo
    const rest = cell(r, cols.rest);
    return Boolean(rest && rest !== "-");
  }
  return false;
}
