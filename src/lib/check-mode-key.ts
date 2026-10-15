/** Chiave della riga in `drafts` con lo stato della modalità check (la scrive solo il server). */
export const CHECK_MODE_KEY = "modalita-check";

export type CheckMode = {
  clientId: string;
  /** check già salvato che si sta correggendo (null = check nuovo) */
  checkId: string | null;
  /** check nuovo: l'id che avrà una volta salvato (le foto si caricano prima, in quella cartella) */
  newId?: string;
  clientName: string;
  startedAt: string;
  /** "Chiudi per ora": la modalità resta, ma nessun dispositivo ci entra da solo */
  paused: boolean;
};

const UUID = /^[0-9a-f-]{36}$/i;

/** Solo una modalità check ben fatta: un dato strano vale "nessuna modalità" invece di rompere le pagine. */
export function parseCheckMode(raw: unknown): CheckMode | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.clientId !== "string" || !UUID.test(d.clientId)) return null;
  if (d.checkId !== null && d.checkId !== undefined && (typeof d.checkId !== "string" || !UUID.test(d.checkId))) return null;
  if (d.newId !== undefined && (typeof d.newId !== "string" || !UUID.test(d.newId))) return null;
  return {
    clientId: d.clientId,
    checkId: (d.checkId as string | null | undefined) ?? null,
    ...(typeof d.newId === "string" ? { newId: d.newId } : {}),
    clientName: typeof d.clientName === "string" ? d.clientName.slice(0, 200) : "",
    startedAt: typeof d.startedAt === "string" ? d.startedAt : "",
    paused: d.paused === true,
  };
}
