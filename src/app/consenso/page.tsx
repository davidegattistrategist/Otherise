import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPrivacyOwner } from "@/lib/data/privacy";
import { healthConsentText, instagramConsentText, needsConsent, PRIVACY_VERSION } from "@/lib/privacy";
import { PrivacyNotice } from "@/components/privacy-notice";
import { Card } from "@/components/ui";
import { ConsentForm } from "./consent-form";

export const metadata: Metadata = { title: "Privacy" };

export default async function ConsentPage() {
  const me = await requireClient();
  const supabase = await createClient();
  const [{ data: c }, owner] = await Promise.all([
    supabase.from("clients").select("first_name, privacy_accepted_at, privacy_version, health_consent_at").eq("id", me.clientId).single(),
    getPrivacyOwner(),
  ]);
  if (!needsConsent(c)) redirect("/cliente");
  const updated = Boolean(c?.privacy_accepted_at && c.privacy_version && c.privacy_version !== PRIVACY_VERSION);
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-5 px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex items-center gap-2.5">
        <span className="h-3 w-3 rounded-full bg-accent" aria-hidden="true" />
        <span className="text-lg font-bold tracking-tight">{owner.businessName}</span>
      </div>
      <div>
        <h1 className="text-[30px] leading-tight font-normal tracking-tight">{updated ? "Abbiamo aggiornato l'informativa" : `Ciao ${c?.first_name ?? ""}, prima di iniziare`}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          Nell&apos;app registriamo anche dati sulla tua salute (misure, pliche, postura, come ti senti) e a volte foto e video degli allenamenti. Per legge ci serve il tuo consenso esplicito. In breve: i dati li vedete solo tu e chi ti allena, stanno su server nell&apos;Unione europea, non li vendiamo a nessuno e puoi chiederne copia o cancellazione quando vuoi. Pubblichiamo qualcosa sui social solo se ce lo permetti, con la seconda casella.
        </p>
      </div>
      <Card className="max-h-[46dvh] overflow-y-auto">
        <PrivacyNotice owner={owner} />
      </Card>
      <Card>
        <ConsentForm consentText={healthConsentText(owner)} instagramText={instagramConsentText(owner)} />
      </Card>
    </main>
  );
}
