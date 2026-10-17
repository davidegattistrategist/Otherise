"use client";

/**
 * Copia e incolla di esercizi nell'editor (computer e telefono uguali).
 *
 * "Seleziona esercizi" mette una casella accanto a ogni esercizio o gruppo;
 * in basso una barra fissa con le azioni: Copia, Al posto di questi, Sopra
 * questi, Elimina, e "Annulla" dopo ogni modifica. Gli appunti restano sul
 * dispositivo (localStorage) anche cambiando programma o cliente, così si
 * copia il riscaldamento da una bozza e si incolla nelle altre.
 * Sul computer: Maiusc+clic seleziona un tratto, Ctrl/Cmd+C copia,
 * Ctrl/Cmd+V incolla al posto dei selezionati, Esc chiude.
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { parseClip, type ProgramClip } from "@/lib/program/clipboard";
import { IconCheck } from "@/components/icons";
import { cx } from "@/components/ui";

const KEY = "otherise:program-clip";
const EVENT = "otherise:program-clip";

const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
};
const readRaw = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/** Gli appunti del programma: restano finché non copi altro o li svuoti. */
export function useProgramClip() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const clip = useMemo(() => parseClip(raw), [raw]);
  const set = useCallback((c: ProgramClip | null) => {
    try {
      if (c) localStorage.setItem(KEY, JSON.stringify(c));
      else localStorage.removeItem(KEY);
    } catch {
      // spazio pieno o modalità privata: gli appunti valgono solo per questa pagina
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return { clip, setClip: set };
}

/** Casella di selezione di un esercizio o di un gruppo. */
export function SelectBox({ checked, label, onPick, id }: { checked: boolean; label: string; onPick: (shift: boolean) => void; id: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={`Seleziona ${label}`}
      data-select-block={id}
      onClick={(e) => onPick(e.shiftKey)}
      className="-m-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-sand"
    >
      <span className={cx("flex h-6 w-6 items-center justify-center rounded-md border-2", checked ? "border-ink bg-ink text-card" : "border-ink/40 bg-card")}>
        {checked ? <IconCheck size={16} /> : null}
      </span>
    </button>
  );
}

/** Pulsante della barra scura. */
export function BarButton({ children, onClick, primary, disabled, testId }: { children: React.ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={cx(
        "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold whitespace-nowrap disabled:pointer-events-none disabled:opacity-40",
        primary ? "bg-card text-ink hover:bg-white" : "text-card ring-1 ring-card/40 hover:bg-card/10",
      )}
    >
      {children}
    </button>
  );
}
