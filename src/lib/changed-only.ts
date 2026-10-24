/**
 * Salvataggio live (LiveForm): il modulo manda in `__changed` i nomi dei campi
 * cambiati su QUESTO dispositivo dall'ultimo salvataggio. L'azione aggiorna
 * solo quelle colonne: una pagina rimasta aperta a lungo non riscrive quello
 * che intanto è cambiato altrove (telefono, altro collaboratore, AI).
 * Senza `__changed` (modulo con pulsante) si salva tutto, come prima.
 */
export function changedFields(fd: FormData): Set<string> | null {
  const raw = fd.get("__changed");
  if (typeof raw !== "string") return null;
  return new Set(raw.split(",").filter(Boolean));
}

/** Solo le colonne di `row` il cui campo del modulo (`fields[col]`, o il nome della colonna) è cambiato qui. */
export function changedOnly<T extends Record<string, unknown>>(fd: FormData, row: T, fields: Partial<Record<keyof T, string>> = {}): Partial<T> {
  const changed = changedFields(fd);
  if (!changed) return row;
  const out: Partial<T> = {};
  for (const k of Object.keys(row) as Array<keyof T>) {
    const field = fields[k] ?? String(k);
    if (changed.has(field)) out[k] = row[k];
  }
  return out;
}
