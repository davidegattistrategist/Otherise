"use client";

import { useEffect, useRef } from "react";

/**
 * Fila di pulsanti che scorre di lato (es. le settimane del programma): appena
 * si apre porta in vista quello attivo (`aria-current`), così in settimana 9 di
 * 12 non resta fuori dallo schermo.
 */
export function ScrollNav({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    const active = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el || !active) return;
    const left = active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2;
    el.scrollTo({ left: Math.max(0, left), behavior: "instant" as ScrollBehavior });
  });
  return (
    <nav ref={ref} aria-label={label} className={className}>
      {children}
    </nav>
  );
}
