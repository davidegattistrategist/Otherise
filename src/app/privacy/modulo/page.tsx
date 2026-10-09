import type { Metadata } from "next";
import { getPrivacyOwner } from "@/lib/data/privacy";
import { healthConsentText } from "@/lib/privacy";
import { PrivacyNotice } from "@/components/privacy-notice";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Modulo privacy da firmare" };

const line = "mt-1 h-8 border-b border-ink/60";

export default async function PrivacyFormPage() {
  const owner = await getPrivacyOwner();
  return (
    <main className="mx-auto max-w-[760px] bg-white px-6 py-8 text-ink print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-muted">Stampalo (o salvalo in PDF), fallo firmare e conservalo. Poi nella scheda del cliente premi &quot;Firmato su carta&quot;.</p>
        <PrintButton />
      </div>
      <div className="flex items-center gap-2.5">
        <span className="h-3 w-3 rounded-full bg-accent" aria-hidden="true" />
        <span className="text-lg font-bold tracking-tight">{owner.businessName}</span>
      </div>
      <h1 className="mt-3 text-2xl font-semibold">Informativa privacy e consenso al trattamento dei dati</h1>
      <div className="mt-4 text-[13.5px] [&_h2]:mt-4 [&_h2]:text-base">
        <PrivacyNotice owner={owner} />
      </div>
      <section className="mt-8 break-inside-avoid rounded-xl border border-ink/30 p-5 text-[14px] leading-relaxed">
        <h2 className="text-base font-semibold">Consenso</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>Nome e cognome<div className={line} /></div>
          <div>Data di nascita<div className={line} /></div>
        </div>
        <p className="mt-4">Dichiaro di aver ricevuto e letto l&apos;informativa qui sopra.</p>
        <p className="mt-3">{healthConsentText(owner)}</p>
        <p className="mt-2 flex gap-8"><span>☐ Do il consenso</span><span>☐ Non do il consenso</span></p>
        <p className="mt-4">Facoltativo: ☐ preferisco che l&apos;assistente AI non venga usato con i miei dati.</p>
        <p className="mt-4 text-[13px] text-muted">Se il cliente ha meno di 18 anni firma un genitore o chi ne fa le veci, indicando qui sotto il proprio nome.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>Luogo e data<div className={line} /></div>
          <div>Firma<div className={line} /></div>
        </div>
      </section>
    </main>
  );
}
