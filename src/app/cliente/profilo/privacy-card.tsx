"use client";

import { useActionState } from "react";
import { ActionMessage, ConfirmButton, SubmitButton } from "@/components/form-bits";
import { Card, Eyebrow } from "@/components/ui";
import { requestData, setAiPreference, withdrawConsent } from "./actions";

export function PrivacyCard({ consentLabel, aiOptOut }: { consentLabel: string; aiOptOut: boolean }) {
  const [copyState, copyAction] = useActionState(requestData.bind(null, "copy"), null);
  const [delState, delAction] = useActionState(requestData.bind(null, "delete"), null);
  return (
    <Card className="flex flex-col gap-4">
      <Eyebrow>Privacy</Eyebrow>
      <p className="text-sm leading-relaxed text-muted">
        {consentLabel} <a href="/privacy" className="font-semibold text-ink underline">Leggi l&apos;informativa</a>
      </p>
      <form action={setAiPreference.bind(null, !aiOptOut)} className="flex flex-col gap-2 border-t border-sand-deep pt-3">
        <div className="text-[15px] font-semibold">Assistente AI {aiOptOut ? "disattivato" : "attivo"}</div>
        <p className="text-sm leading-relaxed text-muted">
          {aiOptOut
            ? "Il tuo coach non usa l'assistente AI con i tuoi dati."
            : "Il tuo coach può farsi aiutare dall'AI a preparare i programmi, senza mai mandare nome e contatti. Decide sempre lui."}
        </p>
        <div><SubmitButton variant="secondary" size="sm" pendingText="…">{aiOptOut ? "Riattiva l'assistente AI" : "Non usare l'AI con i miei dati"}</SubmitButton></div>
      </form>
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
