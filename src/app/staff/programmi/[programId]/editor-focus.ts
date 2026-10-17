/**
 * Dove stai scrivendo nell'editor (giorno ed esercizio), per il pannello
 * "Fase precedente". Niente stato React: l'editor non si ridisegna.
 */
export type EditorFocus = { key: string | null; name: string | null; dayIndex: number | null };

export const EDITOR_FOCUS_EVENT = "otherise:editor-focus";
let last: EditorFocus = { key: null, name: null, dayIndex: null };
// l'ultima riga toccata: aprendo e chiudendo il pannello la pagina si stringe e
// si riallarga, e quella riga deve restare allo stesso punto dello schermo
let lastRow: HTMLElement | null = null;

export const lastEditorFocus = () => last;

/** Fa `change` (che cambia la larghezza della pagina) tenendo ferma sullo schermo l'ultima riga toccata. */
export function keepEditorRowInPlace(change: () => void) {
  const row = lastRow && lastRow.isConnected ? lastRow : null;
  const top = row?.getBoundingClientRect().top;
  change();
  if (!row || top === undefined) return;
  const fix = () => {
    const now = row.getBoundingClientRect().top;
    if (Math.abs(now - top) > 1) window.scrollBy(0, now - top);
  };
  fix();
  // le caselle che vanno a capo si riadattano al disegno dopo (iPhone/Safari)
  requestAnimationFrame(() => requestAnimationFrame(fix));
}

/** Legge `data-ex` / `data-ex-name` / `data-day-index` intorno all'elemento (dopo il disegno). */
export function reportEditorFocus(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return;
  lastRow = target.closest<HTMLElement>("[data-ex], [data-day-index]") ?? target;
  requestAnimationFrame(() => {
    const ex = target.closest<HTMLElement>("[data-ex]");
    const day = target.closest<HTMLElement>("[data-day-index]");
    const next: EditorFocus = {
      // fuori da un esercizio (titolo, note…) resta l'ultimo
      key: ex ? ex.dataset.ex || null : last.key,
      name: ex ? ex.dataset.exName || null : last.name,
      dayIndex: day ? Number(day.dataset.dayIndex) : last.dayIndex,
    };
    if (next.key === last.key && next.dayIndex === last.dayIndex && next.name === last.name) return;
    last = next;
    window.dispatchEvent(new CustomEvent<EditorFocus>(EDITOR_FOCUS_EVENT, { detail: next }));
  });
}
