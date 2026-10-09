"use client";

import { useActionState } from "react";
import { Field, Input } from "@/components/ui";
import { ActionMessage, SubmitButton, type ActionState } from "@/components/form-bits";

export function ImportForm({ action }: { action: (s: ActionState, fd: FormData) => Promise<ActionState> }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <ol className="list-decimal pl-5 text-[15px] leading-relaxed text-muted">
        <li>Apri il foglio Google del cliente e la scheda del programma.</li>
        <li>File → Scarica → Valori separati da virgola (.csv).</li>
        <li>Carica qui il file: diventa una bozza da controllare.</li>
      </ol>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="File .csv"><Input type="file" name="file" accept=".csv,text/csv" required /></Field>
        <Field label="Nome della fase"><Input name="title" placeholder="Es. 06 Intensificazione 2" /></Field>
        <Field label="Data di inizio"><Input type="date" name="start_date" /></Field>
      </div>
      <label className="flex items-start gap-3 text-[15px]">
        <input type="checkbox" name="as_history" className="mt-1 h-5 w-5 accent-[#1b1a17]" />
        <span>
          <strong>È una fase passata</strong>
          <br />
          <span className="text-muted">Va nello storico (archiviata) insieme a quanto scritto nelle righe “Log”: l&apos;assistente AI lo userà come storico del cliente. Serve la data di inizio.</span>
        </span>
      </label>
      <ActionMessage state={state} />
      <div><SubmitButton pendingText="Import in corso…" variant="secondary">Importa</SubmitButton></div>
    </form>
  );
}
