"use client";

import { FormDraft } from "@/components/draft-note";
import { useActionState, useRef } from "react";
import { Field, Input, Textarea } from "@/components/ui";
import { ActionMessage, SubmitButton, type ActionState } from "@/components/form-bits";

export function ExerciseForm({
  action,
  values,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  values?: { name: string; video_url: string | null; description: string; category: string; archived: boolean };
}) {
  const [state, formAction] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <Field label="Nome"><Input name="name" defaultValue={values?.name} required /></Field>
      <Field label="Video" hint="link YouTube o di un'altra piattaforma"><Input name="video_url" type="url" defaultValue={values?.video_url ?? ""} placeholder="https://youtu.be/…" /></Field>
      <Field label="Descrizione" hint="la vede il cliente quando apre l'esercizio"><Textarea name="description" rows={4} defaultValue={values?.description} /></Field>
      <Field label="Categoria" hint="facoltativa: es. Dorso, Gambe, Core"><Input name="category" defaultValue={values?.category} /></Field>
      {values ? (
        <label className="flex items-center gap-3 text-[15px]">
          <input type="checkbox" name="archived" defaultChecked={values.archived} className="h-5 w-5 accent-[#1b1a17]" />
          Nascondi dalla scelta nei nuovi programmi
        </label>
      ) : null}
      <ActionMessage state={state} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2"><SubmitButton>Salva</SubmitButton><FormDraft form={formRef} name={values ? `esercizio-${values.name}` : "esercizio-nuovo"} /></div>
    </form>
  );
}
