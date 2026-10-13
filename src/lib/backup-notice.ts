/**
 * Conferma del backup notturno (registro `backup_runs`, scritto dal backup su
 * GitHub): al mattino il titolare riceve una notifica con l'esito e lo spazio
 * usato da database e file rispetto ai limiti del piano gratuito di Supabase.
 * Funzioni pure (testate in lib.test.ts).
 */

/** Limiti del piano gratuito di Supabase: database 500 MB (poi sola lettura), file 1 GB. */
export const FREE_DB_BYTES = 500 * 1024 * 1024;
export const FREE_FILES_BYTES = 1024 * 1024 * 1024;
/** Oltre questa quota del limite gratuito si avvisa che è ora di passare a Pro. */
export const SPACE_WARNING = 0.8;
/** Un backup più vecchio di così non è "di stanotte". */
export const BACKUP_FRESH_HOURS = 30;

export type BackupRun = { finished_at: string; ok: boolean; tables: number | null; db_bytes: number | null; files_bytes: number | null; message: string };

export type BackupNotice = { title: string; body: string; /** anche sul telefono (problemi), altrimenti solo nell'app */ urgent: boolean; key: string };

export function formatBytes(n: number): string {
  const mb = n / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toLocaleString("it-IT", { maximumFractionDigits: 1 })} GB`;
  if (mb >= 10) return `${Math.round(mb)} MB`;
  return `${mb.toLocaleString("it-IT", { maximumFractionDigits: 1 })} MB`;
}

/** "Database 45 MB su 500 MB · foto e video 320 MB su 1 GB" e l'eventuale avviso sullo spazio. */
export function spaceSummary(run: Pick<BackupRun, "db_bytes" | "files_bytes">): { text: string; warning: string | null } {
  const parts: string[] = [];
  const full: string[] = [];
  if (run.db_bytes !== null) {
    parts.push(`database ${formatBytes(run.db_bytes)} su ${formatBytes(FREE_DB_BYTES)}`);
    if (run.db_bytes >= FREE_DB_BYTES * SPACE_WARNING) full.push("il database");
  }
  if (run.files_bytes !== null) {
    parts.push(`foto e video ${formatBytes(run.files_bytes)} su ${formatBytes(FREE_FILES_BYTES)}`);
    if (run.files_bytes >= FREE_FILES_BYTES * SPACE_WARNING) full.push("lo spazio per foto e video");
  }
  const text = parts.length ? `Spazio del piano gratuito: ${parts.join(", ")}.` : "";
  const warning = full.length
    ? `Attenzione: ${full.join(" e ")} ${full.length > 1 ? "sono" : "è"} oltre l'80% del piano gratuito. Se sei sul piano gratuito di Supabase, è il momento di passare a Pro.`
    : null;
  return { text, warning };
}

/**
 * La notifica del mattino, oppure null se non c'è niente da dire (backup mai
 * configurato: nessuna riga nel registro).
 */
export function backupNotice(last: BackupRun | null, now: Date): BackupNotice | null {
  if (!last) return null;
  const day = now.toISOString().slice(0, 10);
  const ageHours = (now.getTime() - new Date(last.finished_at).getTime()) / 3_600_000;
  if (ageHours > BACKUP_FRESH_HOURS) {
    return {
      title: "Il backup di stanotte non risulta",
      body: "Stanotte non è arrivata la conferma del backup dei dati. Controlla su GitHub, nel tuo progetto: Actions, Backup notturno. Se serve, chiedi a Claude di guardarci.",
      urgent: true,
      key: `backup:missing:${day}`,
    };
  }
  if (!last.ok) {
    return {
      title: "Il backup di stanotte non è riuscito",
      body: `${last.message || "Il backup si è fermato prima della fine."} I dati nell'app sono al sicuro, manca solo la copia di stanotte: se succede di nuovo, chiedi a Claude di guardarci.`,
      urgent: true,
      key: `backup:failed:${day}`,
    };
  }
  const { text, warning } = spaceSummary(last);
  const copied = last.tables ? `Tutto copiato e verificato (${last.tables} tabelle).` : "Tutto copiato e verificato.";
  return {
    title: "Backup di stanotte riuscito",
    body: [copied, text, warning].filter(Boolean).join(" "),
    urgent: Boolean(warning),
    key: `backup:ok:${day}`,
  };
}
