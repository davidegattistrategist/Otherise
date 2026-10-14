"use client";

/**
 * Giorni del programma apribili e chiudibili: di partenza chiusi (si vede il
 * nome del giorno e gli esercizi in una riga), aperti solo quelli ancora
 * vuoti. Si aprono e chiudono a piacimento, uno alla volta o tutti insieme.
 * `localStorage otherise:days-open = "all"` li apre tutti di partenza (lo usano
 * i test che modificano i programmi).
 */
import { useCallback, useState, useSyncExternalStore } from "react";

const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};
const read = () => {
  try {
    return localStorage.getItem("otherise:days-open");
  } catch {
    return null;
  }
};

/** `initialOpen`: i giorni aperti di partenza (es. quelli ancora vuoti). */
export function useOpenDays(initialOpen: () => string[] = () => []) {
  const all = useSyncExternalStore(subscribe, read, () => null) === "all";
  const [toggled, setToggled] = useState<Record<string, boolean>>(() => Object.fromEntries(initialOpen().map((id) => [id, true])));
  const isOpen = useCallback((id: string) => toggled[id] ?? all, [toggled, all]);
  const toggle = useCallback((id: string) => setToggled((t) => ({ ...t, [id]: !(t[id] ?? all) })), [all]);
  const setOpen = useCallback((id: string, open = true) => setToggled((t) => ({ ...t, [id]: open })), []);
  const setAll = useCallback((ids: string[], open: boolean) => setToggled(Object.fromEntries(ids.map((id) => [id, open]))), []);
  return { isOpen, toggle, setOpen, setAll };
}
