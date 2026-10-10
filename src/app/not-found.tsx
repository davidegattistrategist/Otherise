import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Pagina non trovata" };

/** Pagina inesistente o non più disponibile (per esempio un cliente eliminato). */
export default function NotFound() {
  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="eyebrow">Pagina non trovata</p>
      <h1 className="max-w-md text-[28px] leading-tight font-normal tracking-tight">Questa pagina non c&apos;è, o non è più disponibile.</h1>
      <p className="max-w-md text-[15px] text-muted">Può darsi che sia stata eliminata o che il link sia sbagliato.</p>
      <Link href="/" className="mt-2 flex min-h-11 items-center rounded-full bg-ink px-5 text-[15px] font-semibold text-card">Torna all&apos;inizio</Link>
    </main>
  );
}
