"use client";

/**
 * Sul telefono si guarda un giorno del programma alla volta: aprendone uno
 * (un <details data-day-group="…">) gli altri dello stesso gruppo si chiudono.
 * Se chiudendo quelli sopra il giorno aperto è salito fuori dallo schermo, lo
 * riporta in vista. Sul computer restano aperti quanti ne vuoi.
 */
import { useEffect } from "react";

export const isPhone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;

/** Riporta in vista l'elemento se, dopo aver chiuso gli altri, è finito sopra lo schermo. */
export function keepInView(el: Element | null) {
  if (!el) return;
  requestAnimationFrame(() => {
    if (el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start" });
  });
}

export function OneDayOpen({ group }: { group: string }) {
  useEffect(() => {
    const onToggle = (e: Event) => {
      const el = e.target;
      if (!(el instanceof HTMLDetailsElement) || el.dataset.dayGroup !== group || !el.open || !isPhone()) return;
      let closed = false;
      document.querySelectorAll<HTMLDetailsElement>(`details[data-day-group="${group}"][open]`).forEach((other) => {
        if (other !== el) {
          other.open = false;
          closed = true;
        }
      });
      if (closed) keepInView(el.closest("[data-day-card]") ?? el);
    };
    // "toggle" non risale: lo prendo in cattura
    document.addEventListener("toggle", onToggle, true);
    return () => document.removeEventListener("toggle", onToggle, true);
  }, [group]);
  return null;
}
