"use client";

import { useActionState, useEffect, useRef } from "react";
import { ActionMessage, SubmitButton, type ActionState } from "@/components/form-bits";
import { Field, Input } from "@/components/ui";

export function InviteForm({ action }: { action: (s: ActionState, fd: FormData) => Promise<ActionState> }) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome e cognome"><Input name="full_name" required autoComplete="off" /></Field>
        <Field label="Email"><Input name="email" type="email" required autoComplete="off" /></Field>
      </div>
      <p className="text-sm text-muted">Riceverà un&apos;email con il link per scegliere la password.</p>
      <ActionMessage state={state} />
      <div><SubmitButton pendingText="Invio…">Invia invito</SubmitButton></div>
    </form>
  );
}
