"use client";

/** Errore imprevisto in una pagina: messaggio in italiano e possibilità di riprovare. */
import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="eyebrow">Qualcosa non ha funzionato</p>
      <h1 className="max-w-md text-[28px] leading-tight font-normal tracking-tight">Non siamo riusciti a caricare questa pagina.</h1>
      <p className="max-w-md text-[15px] text-muted">Controlla la connessione e riprova. Se succede di nuovo, aspetta qualche minuto{error.digest ? ` (codice ${error.digest})` : ""}.</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => retry()} className="flex min-h-11 items-center rounded-full bg-ink px-5 text-[15px] font-semibold text-card">Riprova</button>
        <Link href="/" className="flex min-h-11 items-center rounded-full bg-card px-5 text-[15px] font-semibold text-ink">Torna all&apos;inizio</Link>
      </div>
    </main>
  );
}
