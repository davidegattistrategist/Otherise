"use client";

import { IconDownload } from "./icons";

/** Apre la stampa del browser (sul computer). Nelle app sulla Home dell'iPhone la stampa non c'è: lì serve `SheetPdfButton`. */
export function PrintButton({ label = "Stampa o salva in PDF", variant = "button" }: { label?: string; variant?: "button" | "link" }) {
  if (variant === "link")
    return (
      <button type="button" onClick={() => window.print()} className="font-semibold text-ink underline" data-print-button>
        {label}
      </button>
    );
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-card" data-print-button>
      <IconDownload size={16} /> {label}
    </button>
  );
}
