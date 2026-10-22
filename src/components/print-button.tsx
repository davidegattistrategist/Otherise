"use client";

import { IconDownload } from "./icons";

/** Apre la stampa del browser: da lì si stampa o si salva in PDF (anche dal telefono). */
export function PrintButton({ label = "Stampa o salva in PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-card" data-print-button>
      <IconDownload size={16} /> {label}
    </button>
  );
}
