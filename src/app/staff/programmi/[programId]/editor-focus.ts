/**
 * Dove stai scrivendo nell'editor (giorno ed esercizio), per il pannello
 * "Fase precedente". Niente stato React: l'editor non si ridisegna.
 */
export type EditorFocus = { key: string | null; name: string | null; dayIndex: number | null };

export const EDITOR_FOCUS_EVENT = "otherise:editor-focus";
let last: EditorFocus = { key: null, name: null, dayIndex: null };

export const lastEditorFocus = () => last;

/** Legge `data-ex` / `data-ex-name` / `data-day-index` intorno all'elemento (dopo il disegno). */
export function reportEditorFocus(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return;
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
