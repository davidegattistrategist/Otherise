import type { Metadata } from "next";
import { getPrivacyOwner } from "@/lib/data/privacy";
import { BrandName } from "@/components/brand";

export const metadata: Metadata = { title: "Entra nell'app" };

/**
 * Pagina d'arrivo dei link per entrare (mandati a mano dal trainer o nelle email di invito e di nuova password): il link vero (che vale
 * una volta sola) parte solo toccando il pulsante, così le anteprime di
 * WhatsApp e degli altri messaggi non lo consumano.
 */
export default async function EnterPage({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string }> }) {
  const sp = await searchParams;
  const owner = await getPrivacyOwner();
  const type = sp.type === "recovery" ? "recovery" : "invite";
  const ok = Boolean(sp.token_hash && /^[A-Za-z0-9_-]{10,200}$/.test(sp.token_hash));
  const href = ok ? `/auth/confirm?token_hash=${encodeURIComponent(sp.token_hash!)}&type=${type}&next=/imposta-password` : "/login";
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div className="flex items-center gap-2.5">
        <span className="h-3 w-3 rounded-full bg-accent" aria-hidden="true" />
        <BrandName name={owner.businessName} className="text-lg font-bold tracking-tight" />
      </div>
      <div>
        <h1 className="text-[32px] leading-tight font-normal tracking-tight">{type === "recovery" ? "Nuova password" : "Benvenuto"}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          {ok ? (type === "recovery" ? "Tocca il pulsante per scegliere una nuova password. Il link vale per un solo accesso." : "Tocca il pulsante per entrare e scegliere la tua password. Il link vale per un solo accesso.") : "Il link non è completo. Chiedi al tuo coach di mandartene uno nuovo."}
        </p>
      </div>
      <a href={href} className="flex min-h-12 items-center justify-center rounded-full bg-ink px-6 text-[15px] font-semibold text-card">
        {ok ? (type === "recovery" ? "Scegli la nuova password" : "Entra e scegli la password") : "Vai all'accesso"}
      </a>
    </main>
  );
}
