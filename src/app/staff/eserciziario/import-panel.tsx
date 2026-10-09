"use client";

import { useActionState } from "react";
import { Field, Input } from "@/components/ui";
import { ActionMessage, SubmitButton, type ActionState } from "@/components/form-bits";

export function ImportPanel({
  csvAction,
  bundledAction,
  empty,
}: {
  csvAction: (s: ActionState, fd: FormData) => Promise<ActionState>;
  bundledAction: (s: ActionState) => Promise<ActionState>;
  empty: boolean;
}) {
  const [csvState, csvFormAction] = useActionState(csvAction, null);
  const [bState, bFormAction] = useActionState(bundledAction, null);
  return (
    <div className="flex flex-col gap-5">
      {empty ? (
        <form action={bFormAction} className="flex flex-col gap-3">
          <p className="text-[15px] text-muted">L&apos;eserciziario Otherise (circa 175 esercizi con video e indicazioni) è già incluso: importalo con un clic.</p>
          <div><SubmitButton pendingText="Importo…">Importa l&apos;eserciziario Otherise</SubmitButton></div>
          <ActionMessage state={bState} />
        </form>
      ) : null}
      <form action={csvFormAction} className="flex flex-col gap-3">
        <Field label="Importa da un file .csv" hint="colonne: Esercizio, Video, Note">
          <Input type="file" name="file" accept=".csv,text/csv" required />
        </Field>
        <p className="text-sm text-muted">Gli esercizi già presenti non vengono cambiati: si completano solo video o descrizione mancanti.</p>
        <div><SubmitButton variant="secondary" pendingText="Importo…">Importa file</SubmitButton></div>
        <ActionMessage state={csvState} />
      </form>
    </div>
  );
}
