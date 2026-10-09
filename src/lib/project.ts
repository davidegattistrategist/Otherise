/**
 * Progetto annuale del cliente (lo "studio progettuale"): per ogni mese la fase
 * prevista, quanto spingere ogni stimolo (0 assente → 3 alto) e una nota
 * (gara, vacanza, obiettivo). Lo scrive il trainer, il cliente lo vede come
 * timeline e l'assistente AI lo usa per le bozze dei programmi.
 */
import { z } from "zod";
import { addMonths, type ISODate } from "./dates";

export const PROJECT_PHASES = [
  { key: "start", label: "Start", short: "Start", color: "#8a8376" },
  { key: "volume", label: "Volumizzazione", short: "Volume", color: "#3f6f8f" },
  { key: "intensity", label: "Intensificazione", short: "Intensità", color: "#e2622a" },
  { key: "transition", label: "Transizione", short: "Transiz.", color: "#b8a98f" },
  { key: "reset", label: "Reset", short: "Reset", color: "#6f8a5f" },
  { key: "deload", label: "Scarico", short: "Scarico", color: "#9fb4a0" },
  { key: "free", label: "Libero / estivo", short: "Libero", color: "#d6a64a" },
  { key: "race", label: "Gara", short: "Gara", color: "#1b1a17" },
  { key: "pause", label: "Pausa", short: "Pausa", color: "#d9d1c4" },
] as const;
export type ProjectPhase = (typeof PROJECT_PHASES)[number]["key"];
export const PHASE_BY_KEY = new Map(PROJECT_PHASES.map((p) => [p.key as string, p]));

export const TRAINING_LEVELS = ["Assente", "Mantenimento", "Medio", "Alto"] as const;
export const NUTRITION_LEVELS = ["Non trattata", "Deficit", "Normocalorica", "Surplus"] as const;

export const DEFAULT_ROWS: Array<{ label: string; kind: "training" | "nutrition" }> = [
  { label: "Posturale", kind: "training" },
  { label: "Forza massima", kind: "training" },
  { label: "Forza resistente", kind: "training" },
  { label: "Massa magra", kind: "training" },
  { label: "Aerobico", kind: "training" },
  { label: "Vo2Max", kind: "training" },
  { label: "Alimentazione", kind: "nutrition" },
];

export const MONTHS = 12;

const rowSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().trim().max(60),
  kind: z.enum(["training", "nutrition"]),
  values: z.array(z.number().int().min(0).max(3)).length(MONTHS),
});

export const projectSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}$/, "Mese di inizio non valido"),
  goal: z.string().max(1000).default(""),
  phases: z.array(z.string().max(20)).length(MONTHS),
  notes: z.array(z.string().max(120)).length(MONTHS),
  rows: z.array(rowSchema).max(16),
});
export type Project = z.infer<typeof projectSchema>;

let counter = 0;
export const rowId = () => `r${Date.now().toString(36)}${(counter++).toString(36)}`;

export function emptyProject(startMonth: string): Project {
  return {
    start: startMonth,
    goal: "",
    phases: Array(MONTHS).fill(""),
    notes: Array(MONTHS).fill(""),
    rows: DEFAULT_ROWS.map((r, i) => ({ id: `d${i}`, label: r.label, kind: r.kind, values: Array(MONTHS).fill(0) })),
  };
}

/** Il progetto salvato, oppure null se manca o non è valido. */
export function parseProject(raw: unknown): Project | null {
  const r = projectSchema.safeParse(raw);
  return r.success ? r.data : null;
}

const MONTH_NAMES = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** "2026-10" + i mesi → { key: "2026-11", short: "nov", long: "novembre 2026" } */
export function projectMonths(start: string) {
  return Array.from({ length: MONTHS }, (_, i) => {
    const d = addMonths(`${start}-01` as ISODate, i);
    const m = Number(d.slice(5, 7)) - 1;
    return { key: d.slice(0, 7), short: MONTH_NAMES[m].slice(0, 3), long: `${MONTH_NAMES[m]} ${d.slice(0, 4)}`, year: d.slice(0, 4) };
  });
}

export function levelLabel(kind: "training" | "nutrition", v: number): string {
  return (kind === "nutrition" ? NUTRITION_LEVELS : TRAINING_LEVELS)[Math.max(0, Math.min(3, v))];
}

/** Indice del mese di `today` nel progetto (-1 se fuori). */
export function monthIndex(project: Project, today: ISODate): number {
  return projectMonths(project.start).findIndex((m) => m.key === today.slice(0, 7));
}

/** Testo per l'assistente AI: obiettivo, mese corrente e i tre successivi. */
export function projectForAI(project: Project, today: ISODate): string {
  const months = projectMonths(project.start);
  const from = Math.max(0, monthIndex(project, today));
  const lines: string[] = [];
  if (project.goal.trim()) lines.push(`Obiettivo: ${project.goal.trim()}`);
  for (let i = from; i < Math.min(MONTHS, from + 4); i++) {
    const phase = PHASE_BY_KEY.get(project.phases[i])?.label ?? "non indicata";
    const stim = project.rows.filter((r) => r.label.trim()).map((r) => `${r.label} ${levelLabel(r.kind, r.values[i]).toLowerCase()}`).join(", ");
    lines.push(`- ${months[i].long}${i === from ? " (adesso)" : ""}: fase ${phase}. ${stim}.${project.notes[i]?.trim() ? ` Nota: ${project.notes[i].trim()}` : ""}`);
  }
  return lines.join("\n");
}

/** Mese di partenza consigliato per un progetto nuovo: quello corrente. */
export function defaultStart(today: ISODate): string {
  return today.slice(0, 7);
}

/** "Adesso volumizzazione fino a novembre, poi transizione da dicembre" */
export function projectNowText(project: Project, today: ISODate): string | null {
  const months = projectMonths(project.start);
  const i = monthIndex(project, today);
  if (i < 0 || !project.phases[i]) return null;
  let end = i;
  while (end + 1 < MONTHS && project.phases[end + 1] === project.phases[i]) end++;
  const now = PHASE_BY_KEY.get(project.phases[i])?.label.toLowerCase();
  const nextKey = end + 1 < MONTHS ? project.phases[end + 1] : "";
  const next = nextKey ? PHASE_BY_KEY.get(nextKey)?.label.toLowerCase() : null;
  const until = end > i ? ` fino a ${months[end].long.split(" ")[0]}` : " questo mese";
  return `Adesso ${now}${until}${next ? `, poi ${next} da ${months[end + 1].long.split(" ")[0]}` : ""}.`;
}
