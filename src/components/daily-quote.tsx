"use client";

/**
 * Frase del giorno nella home del cliente. La prima volta che apre l'app nella
 * giornata la frase compare a tutto schermo (bella da guardare e da salvare
 * con uno screenshot); poi resta come scheda nella home e si può riaprire.
 */
import "@fontsource-variable/fraunces";
import "@fontsource-variable/fraunces/wght-italic.css";
import { useEffect, useState } from "react";
import type { Quote } from "@/lib/quotes";
import { IconX } from "./icons";

const KEY = "otherise:quote-day";
const SERIF = { fontFamily: '"Fraunces Variable", Georgia, "Times New Roman", serif' } as const;

/** Grandezza del testo in base alla lunghezza, così ogni frase sta bene sullo schermo. */
const sizeFor = (t: string) => (t.length > 95 ? "clamp(27px, 7vw, 42px)" : t.length > 60 ? "clamp(31px, 8.2vw, 50px)" : "clamp(36px, 9.6vw, 58px)");

export function DailyQuote({ quote, today, dateLabel, brand }: { quote: Quote; today: string; dateLabel: string; brand: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(KEY);
    } catch {
      return; // senza memoria del browser non la apriamo da sola (eviteremmo di ripeterla a ogni visita)
    }
    if (seen === today || seen === "off") return;
    // la guida "Metti l'app sulla Home" (se c'è) compare dopo 600 ms e ha la precedenza:
    // in quel caso la frase aspetta la prossima apertura dell'app
    const t = setTimeout(() => {
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      setOpen(true);
      try {
        localStorage.setItem(KEY, today);
      } catch {}
    }, 1000);
    return () => clearTimeout(t);
  }, [today]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="quote-card group relative overflow-hidden rounded-[24px] bg-ink px-5 py-5 text-left text-card"
        aria-label="Apri la frase del giorno"
      >
        <span className="relative block text-[11px] font-semibold tracking-[0.14em] text-muted-dark uppercase">La frase del giorno</span>
        <span className="relative mt-2.5 block text-[21px] leading-[1.25] font-light text-balance" style={SERIF}>
          {quote.text}
        </span>
        {quote.author ? <span className="relative mt-2 block text-sm text-accent italic" style={SERIF}>{quote.author}</span> : null}
      </button>

      {open ? (
        <div role="dialog" aria-modal="true" aria-label="La frase del giorno" className="quote-stage fixed inset-0 z-[95] flex flex-col bg-ink text-card">
          <div className="quote-glow" aria-hidden="true" />
          <div className="quote-grain" aria-hidden="true" />
          <div className="relative mx-auto flex h-full w-full max-w-[720px] flex-col px-7 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.75rem+env(safe-area-inset-bottom))] sm:px-12">
            <div className="quote-in flex items-center justify-between gap-3" style={{ animationDelay: "0ms" }}>
              <span className="flex items-center gap-2.5 text-[15px] font-bold tracking-tight">
                <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden="true" />
                {brand}
              </span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Chiudi" className="flex h-11 w-11 items-center justify-center rounded-full text-muted-dark hover:text-card">
                <IconX size={20} />
              </button>
            </div>

            <div className="flex flex-1 flex-col justify-center py-8">
              <div className="quote-in text-[12px] font-semibold tracking-[0.2em] text-muted-dark uppercase" style={{ animationDelay: "120ms" }}>
                {dateLabel}
              </div>
              <div className="quote-in mt-6 h-[0.5em] text-[110px] leading-none text-accent select-none" style={{ ...SERIF, animationDelay: "220ms" }} aria-hidden="true">
                “
              </div>
              <blockquote className="quote-in mt-5 font-light tracking-[-0.015em] text-balance" style={{ ...SERIF, fontSize: sizeFor(quote.text), lineHeight: 1.1, animationDelay: "320ms" }}>
                {quote.text}
              </blockquote>
              {quote.author ? (
                <div className="quote-in mt-7 flex items-center gap-3" style={{ animationDelay: "520ms" }}>
                  <span className="h-px w-10 bg-accent" aria-hidden="true" />
                  <span className="text-xl text-accent italic" style={SERIF}>{quote.author}</span>
                </div>
              ) : null}
            </div>

            <div className="quote-in flex items-center justify-between gap-4" style={{ animationDelay: "700ms" }}>
              <span className="flex items-center gap-2.5 text-[16px] whitespace-nowrap text-muted-dark italic sm:text-[17px]" style={SERIF}>
                <span className="hidden h-px w-6 bg-accent sm:block" aria-hidden="true" />
                un giorno alla volta
              </span>
              <button type="button" onClick={() => setOpen(false)} className="min-h-12 shrink-0 rounded-full bg-card px-5 text-[15px] font-semibold whitespace-nowrap text-ink hover:bg-white sm:px-6">
                Inizia la giornata
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
