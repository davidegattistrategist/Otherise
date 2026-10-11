"use client";

import { useActionState } from "react";
import { ActionMessage, ConfirmButton, SubmitButton } from "@/components/form-bits";
import { Card, Eyebrow } from "@/components/ui";
import { requestData, setInstagramConsent, withdrawConsent } from "./actions";

export function PrivacyCard({ consentLabel, instagramSince }: { consentLabel: string; instagramSince: string | null }) {
  const [copyState, copyAction] = useActionState(requestData.bind(null, "copy"), null);
  const [delState, delAction] = useActionState(requestData.bind(null, "delete"), null);
  return (
    <Card className="flex flex-col gap-4">
      <Eyebrow>Privacy</Eyebrow>
      <p className="text-sm leading-relaxed text-muted">
        {consentLabel} <a href="/privacy" className="font-semibold text-ink underline">Leggi l&apos;informativa</a>
      </p>
      <div className="flex flex-col gap-2 border-t border-sand-deep pt-3">
        <div className="text-[15px] font-semibold">Video sui social</div>
        <p className="text-sm leading-relaxed text-muted">
          {instagramSince
            ? `Ci hai dato il permesso di pubblicare su Instagram alcuni video delle sedute insieme (dal ${instagramSince}). Puoi toglierlo quando vuoi: vale per il futuro.`
            : "Non ci hai dato il permesso di pubblicare video delle sedute su Instagram: non pubblichiamo nulla di te. Se ti fa piacere comparire, puoi darlo qui."}
        </p>
        <form action={setInstagramConsent.bind(null, !instagramSince)}>
          {instagramSince ? (
            <ConfirmButton variant="secondary" message="Togliere il permesso di pubblicare i tuoi video su Instagram? Avvisiamo il tuo coach.">Togli il permesso</ConfirmButton>
          ) : (
            <ConfirmButton variant="secondary" message="Autorizzi a pubblicare gratuitamente su Instagram (e sugli altri social del brand) alcuni video e foto delle sedute di personal training fatte insieme? Puoi togliere il permesso quando vuoi.">Dai il permesso</ConfirmButton>
          )}
        </form>
      </div>
      <div className="flex flex-col gap-2 border-t border-sand-deep pt-3">
        <div className="text-[15px] font-semibold">I tuoi dati</div>
        <div className="flex flex-wrap gap-2">
          <form action={copyAction}><SubmitButton variant="secondary" size="sm" pendingText="…">Chiedi una copia</SubmitButton></form>
          <form action={delAction}><SubmitButton variant="secondary" size="sm" pendingText="…">Chiedi la cancellazione</SubmitButton></form>
        </div>
        <ActionMessage state={copyState ?? delState} />
      </div>
      <form action={withdrawConsent} className="border-t border-sand-deep pt-3">
        <ConfirmButton variant="ghost" className="!px-0" message="Revocare il consenso sui dati relativi alla salute? Avvisiamo il tuo coach e non potrai usare l'app finché non lo dai di nuovo.">Revoca il consenso</ConfirmButton>
      </form>
    </Card>
  );
}
