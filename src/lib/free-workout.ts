/**
 * Allenamento libero del cliente (fuori dal programma): cosa, quanto, com'era.
 * Etichette e controlli condivisi tra la pagina del cliente, le azioni e lo staff.
 */
export const FREE_KINDS = [
  { key: "pesi", label: "Pesi" },
  { key: "spinning", label: "Spinning" },
  { key: "corsa", label: "Corsa" },
  { key: "bici", label: "Bici" },
  { key: "camminata", label: "Camminata" },
  { key: "circuito", label: "Circuito" },
  { key: "nuoto", label: "Nuoto" },
  { key: "sport", label: "Sport" },
  { key: "yoga", label: "Yoga e mobilità" },
  { key: "altro", label: "Altro" },
] as const;
export type FreeKind = (typeof FREE_KINDS)[number]["key"];

export const FREE_MINUTES = [20, 30, 45, 60, 90] as const;

export const EFFORTS = [
  { value: 1, label: "Leggero" },
  { value: 2, label: "Medio" },
  { value: 3, label: "Duro" },
] as const;

export const isFreeKind = (k: unknown): k is FreeKind => FREE_KINDS.some((x) => x.key === k);
export const freeKindLabel = (k: string) => FREE_KINDS.find((x) => x.key === k)?.label ?? "Allenamento";
export const effortLabel = (e: number | null | undefined) => EFFORTS.find((x) => x.value === e)?.label ?? null;

/** "45 min · duro" (vuoto se non ci sono né minuti né fatica). */
export function freeWorkoutDetail(w: { minutes: number | null; effort: number | null }): string {
  return [w.minutes ? `${w.minutes} min` : null, effortLabel(w.effort)?.toLowerCase() ?? null].filter(Boolean).join(" · ");
}

/** L'ultima attività tra allenamenti del programma e allenamenti liberi. */
export function latestDate(...dates: Array<string | null | undefined>): string | null {
  return dates.filter((d): d is string => Boolean(d)).sort().at(-1) ?? null;
}
