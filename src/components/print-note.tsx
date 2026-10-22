"use client";

import { useState } from "react";

/**
 * Nota libera per un foglio da stampare: sullo schermo è una casella, sul
 * foglio diventa testo normale (le caselle in stampa si possono tagliare).
 * Non si salva: serve solo per il foglio di adesso.
 */
export function PrintNote({ label, placeholder }: { label: string; placeholder: string }) {
  const [text, setText] = useState("");
  return (
    <section className={text.trim() ? "flex flex-col gap-2" : "flex flex-col gap-2 print:hidden"}>
      <h2 className="text-[17px] font-semibold">Note</h2>
      <textarea
        aria-label={label}
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-sand-deep bg-sand/40 px-3 py-2.5 text-[15px] leading-relaxed print:hidden"
      />
      <p className="hidden text-[15px] leading-relaxed whitespace-pre-wrap print:block" data-print-note>{text}</p>
    </section>
  );
}
