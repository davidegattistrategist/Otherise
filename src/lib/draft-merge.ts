/**
 * Unione delle bozze tra due dispositivi (modalità check: telefono e computer
 * scrivono sullo stesso check). Invece di mandare tutto il modulo, ognuno
 * manda solo i campi che ha cambiato (`diffDraft`) e il server li applica
 * sopra l'ultima versione (`applyPatch`): così se sul telefono scrivi le
 * pliche e sul computer il peso, restano tutti e due. Se lo stesso campo
 * cambia su entrambi vince l'ultimo che scrive.
 */
export type DraftJson = null | boolean | number | string | DraftJson[] | { [k: string]: DraftJson };
export type DraftPath = Array<string | number>;
/** `value` assente = campo tolto */
export type DraftPatch = Array<{ path: DraftPath; value?: DraftJson }>;

const isObj = (v: unknown): v is Record<string, DraftJson> => typeof v === "object" && v !== null && !Array.isArray(v);

export function sameDraft(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** I campi cambiati da `base` a `next` (gli elenchi della stessa lunghezza voce per voce). */
export function diffDraft(base: unknown, next: unknown, path: DraftPath = [], out: DraftPatch = []): DraftPatch {
  if (sameDraft(base, next)) return out;
  if (isObj(base) && isObj(next)) {
    for (const k of new Set([...Object.keys(base), ...Object.keys(next)])) diffDraft(base[k], next[k], [...path, k], out);
  } else if (Array.isArray(base) && Array.isArray(next) && base.length === next.length) {
    next.forEach((v, i) => diffDraft(base[i], v, [...path, i], out));
  } else {
    out.push(next === undefined ? { path } : { path, value: next as DraftJson });
  }
  return out;
}

function setIn(target: DraftJson | undefined, path: DraftPath, value: DraftJson | undefined): DraftJson | undefined {
  if (!path.length) return value;
  const [head, ...rest] = path;
  if (typeof head === "number" && Array.isArray(target)) {
    const copy = target.slice();
    const v = setIn(copy[head], rest, value);
    copy[head] = v === undefined ? null : v;
    return copy;
  }
  const obj: Record<string, DraftJson> = isObj(target) ? { ...target } : {};
  const v = setIn(obj[String(head)], rest, value);
  if (v === undefined) delete obj[String(head)];
  else obj[String(head)] = v;
  return obj;
}

/** Applica i campi cambiati sopra `target` (senza modificarlo). */
export function applyPatch<T>(target: T, patch: DraftPatch): T {
  let out = target as unknown as DraftJson | undefined;
  for (const p of patch) out = setIn(out, p.path, p.value);
  return (out ?? null) as unknown as T;
}

/** Le modifiche fatte qui (da `base` a `local`) sopra quello che è arrivato dall'altro dispositivo. */
export function mergeDraft<T>(base: unknown, local: T, remote: T): T {
  return applyPatch(remote, diffDraft(base ?? {}, local));
}

/** Controllo di quello che arriva dal browser. */
export function isDraftPatch(v: unknown): v is DraftPatch {
  return (
    Array.isArray(v) &&
    v.length <= 5000 &&
    v.every(
      (p) =>
        isObj(p) &&
        Array.isArray(p.path) &&
        p.path.length <= 12 &&
        (p.path as unknown[]).every((s) => (typeof s === "string" && s.length <= 100 && s !== "__proto__") || (Number.isInteger(s) && (s as number) >= 0 && (s as number) < 1000)),
    )
  );
}

/**
 * Bozza cancellata: al posto della riga resta per un giorno un segno con l'ora
 * della cancellazione (`{"__deleted": ms}`), così un salvataggio partito prima
 * (rete lenta, pagina chiusa al volo) non la fa tornare.
 */
export const draftTombstone = (t: number) => ({ __deleted: t });
export function deletedAt(data: unknown): number | null {
  return typeof data === "object" && data !== null && !Array.isArray(data) && typeof (data as { __deleted?: unknown }).__deleted === "number" ? (data as { __deleted: number }).__deleted : null;
}
