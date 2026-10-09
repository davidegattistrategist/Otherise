"use client";

/**
 * Messaggi brevi di conferma ("Registrato 480 €…") che restano visibili
 * anche quando la pagina si aggiorna. Si usa con toast("testo").
 */
import { useEffect, useState } from "react";
import { IconCheck } from "./icons";

const EVENT = "otherise:toast";

export function toast(text: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: text }));
}

export function Toaster() {
  const [items, setItems] = useState<Array<{ id: number; text: string }>>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const id = Date.now() + Math.random();
      setItems((cur) => [...cur, { id, text: (e as CustomEvent<string>).detail }]);
      setTimeout(() => setItems((cur) => cur.filter((i) => i.id !== id)), 4500);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  if (!items.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[70] flex flex-col items-center gap-2 px-4 lg:bottom-6" role="status" aria-live="polite">
      {items.map((i) => (
        <div key={i.id} className="pointer-events-auto flex max-w-md items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-card shadow-lg">
          <IconCheck size={16} /> {i.text}
        </div>
      ))}
    </div>
  );
}
