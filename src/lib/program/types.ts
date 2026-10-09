/**
 * Struttura di un programma di allenamento (colonna programs.content).
 *
 * Programma → giorni → blocchi → esercizi → una prescrizione per settimana.
 * Ogni esercizio sta dentro un blocco: un blocco "single" contiene un solo
 * esercizio, una superserie o un circuito ne contengono più di uno.
 * Gli id sono stringhe brevi casuali e restano uguali quando si modifica
 * il programma: il logbook del cliente si aggancia a questi id.
 */
import { z } from "zod";
import { customAlphabet } from "nanoid";

export const newId = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 8);

export const BLOCK_KINDS = ["single", "superset", "circuit", "amrap", "emom", "interval", "text"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

export const BLOCK_KIND_LABELS: Record<BlockKind, string> = {
  single: "Esercizio singolo",
  superset: "Superserie",
  circuit: "Circuito",
  amrap: "AMRAP",
  emom: "EMOM",
  interval: "Intervalli",
  text: "Testo libero",
};

export const programItemSchema = z.object({
  id: z.string().min(1),
  exerciseId: z.string().uuid().nullish(),
  name: z.string(),
  /** Recupero, testo libero: "90\"", "60-90\" camminando" */
  rest: z.string().optional().default(""),
  /** Indicazioni dell'allenatore per questo esercizio */
  notes: z.string().optional().default(""),
  /** Una prescrizione per settimana: "4x8 65kg", "3x20\"", "5x800m" */
  prescriptions: z.array(z.string()).default([]),
});

export const programBlockSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(BLOCK_KINDS),
  title: z.string().optional().default(""),
  /** Giri per superserie e circuiti, oppure giri per gli intervalli */
  rounds: z.number().int().positive().nullish(),
  /** Durata totale in minuti (AMRAP, EMOM) */
  durationMin: z.number().positive().nullish(),
  /** Ogni quanti secondi parte un giro nell'EMOM (60 = EMOM, 120 = E2MOM…) */
  everySec: z.number().int().positive().nullish(),
  /** Intervalli: secondi di lavoro e di recupero */
  workSec: z.number().int().positive().nullish(),
  restSec: z.number().int().nonnegative().nullish(),
  /** Per i blocchi di testo libero è il contenuto; per gli altri una nota sul blocco */
  notes: z.string().optional().default(""),
  items: z.array(programItemSchema).default([]),
});

export const programDaySchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  notes: z.string().optional().default(""),
  blocks: z.array(programBlockSchema).default([]),
});

export const programContentSchema = z.object({
  days: z.array(programDaySchema).default([]),
});

export type ProgramItem = z.infer<typeof programItemSchema>;
export type ProgramBlock = z.infer<typeof programBlockSchema>;
export type ProgramDay = z.infer<typeof programDaySchema>;
export type ProgramContent = z.infer<typeof programContentSchema>;

/** Legge il contenuto dal database tollerando campi mancanti. */
export function parseContent(raw: unknown): ProgramContent {
  const res = programContentSchema.safeParse(raw ?? { days: [] });
  return res.success ? res.data : { days: [] };
}

/** Porta ogni esercizio ad avere esattamente `weeks` prescrizioni. */
export function normalizeWeeks(content: ProgramContent, weeks: number): ProgramContent {
  return {
    days: content.days.map((d) => ({
      ...d,
      blocks: d.blocks.map((b) => ({
        ...b,
        items: b.items.map((it) => ({
          ...it,
          prescriptions: Array.from({ length: weeks }, (_, i) => it.prescriptions[i] ?? ""),
        })),
      })),
    })),
  };
}

/** Etichette A, B, C… per i blocchi e A1, A2… per gli esercizi dei blocchi multipli. */
export function blockLetter(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export function itemLabel(block: ProgramBlock, blockIndex: number, itemIndex: number): string {
  const letter = blockLetter(blockIndex);
  return block.items.length > 1 ? `${letter}${itemIndex + 1}` : letter;
}

/** Riassunto leggibile del formato di un blocco: "4 giri", "AMRAP 12 min", "EMOM 10 min"… */
export function blockSummary(b: ProgramBlock): string {
  switch (b.kind) {
    case "superset":
    case "circuit":
      return b.rounds ? `${b.rounds} giri` : "";
    case "amrap":
      return b.durationMin ? `AMRAP ${b.durationMin} min` : "AMRAP";
    case "emom": {
      const every = b.everySec ?? 60;
      const label = every === 60 ? "EMOM" : every % 60 === 0 ? `E${every / 60}MOM` : `ogni ${every}"`;
      return b.durationMin ? `${label} ${b.durationMin} min` : label;
    }
    case "interval": {
      const parts = [];
      if (b.workSec) parts.push(`${b.workSec}" lavoro`);
      if (b.restSec !== null && b.restSec !== undefined) parts.push(`${b.restSec}" recupero`);
      if (b.rounds) parts.push(`${b.rounds} giri`);
      return parts.join(" · ");
    }
    default:
      return "";
  }
}

export function emptyItem(weeks: number, name = ""): ProgramItem {
  return { id: newId(), exerciseId: null, name, rest: "", notes: "", prescriptions: Array(weeks).fill("") };
}

export function emptyBlock(weeks: number, kind: BlockKind = "single"): ProgramBlock {
  return {
    id: newId(),
    kind,
    title: "",
    notes: "",
    rounds: kind === "superset" || kind === "circuit" ? 3 : null,
    durationMin: kind === "amrap" || kind === "emom" ? 10 : null,
    everySec: kind === "emom" ? 60 : null,
    workSec: kind === "interval" ? 40 : null,
    restSec: kind === "interval" ? 20 : null,
    items: kind === "text" ? [] : [emptyItem(weeks)],
  };
}

export function emptyDay(weeks: number, index: number): ProgramDay {
  return { id: newId(), title: `Giorno ${index + 1}`, notes: "", blocks: [emptyBlock(weeks)] };
}

/** Tutti gli esercizi del programma, in ordine, con giorno e blocco. */
export function flattenItems(content: ProgramContent) {
  const out: Array<{ day: ProgramDay; dayIndex: number; block: ProgramBlock; blockIndex: number; item: ProgramItem; itemIndex: number; label: string }> = [];
  content.days.forEach((day, dayIndex) =>
    day.blocks.forEach((block, blockIndex) =>
      block.items.forEach((item, itemIndex) =>
        out.push({ day, dayIndex, block, blockIndex, item, itemIndex, label: itemLabel(block, blockIndex, itemIndex) }),
      ),
    ),
  );
  return out;
}

/** Copia profonda con id nuovi (per i modelli assegnati e le copie). */
export function cloneWithNewIds(content: ProgramContent): ProgramContent {
  return {
    days: content.days.map((d) => ({
      ...d,
      id: newId(),
      blocks: d.blocks.map((b) => ({
        ...b,
        id: newId(),
        items: b.items.map((it) => ({ ...it, id: newId(), prescriptions: [...it.prescriptions] })),
      })),
    })),
  };
}

/** Titolo e dettaglio di un blocco senza ripetizioni ("AMRAP" + "10 min", non "AMRAP AMRAP 10 min"). */
export function blockHeading(b: ProgramBlock): { title: string; detail: string } {
  const label = BLOCK_KIND_LABELS[b.kind];
  const summary = blockSummary(b);
  if (b.title) return { title: b.title, detail: summary };
  if (summary.startsWith(label)) return { title: label, detail: summary.slice(label.length).trim() };
  if (b.kind === "emom" && summary) {
    const [first, ...rest] = summary.split(" ");
    if (/^E\d*MOM$/.test(first)) return { title: first, detail: rest.join(" ") };
  }
  return { title: label, detail: summary };
}
