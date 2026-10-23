"use client";

import { FormDraft } from "@/components/draft-note";
import { LiveForm } from "@/components/live-form";
import { useActionState, useRef, useState } from "react";
import { Field, Input, Textarea } from "@/components/ui";
import { ActionMessage, SubmitButton, type ActionState } from "@/components/form-bits";

export function ExerciseForm({
  action,
  values,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  values?: { name: string; video_url: string | null; description: string; category: string; archived: boolean };
}) {
  // nome della bozza fisso anche se rinomini l'esercizio mentre scrivi
  const [draftName] = useState(() => `esercizio-${values?.name ?? "nuovo"}`);
  const fields = (
    <>
      <Field label="Nome"><Input name="name" defaultValue={values?.name} required /></Field>
      <Field label="Video" hint="link YouTube o di un'altra piattaforma"><Input name="video_url" type="url" defaultValue={values?.video_url ?? ""} placeholder="https://youtu.be/…" data-save-on-blur /></Field>
      <Field label="Descrizione" hint="la vede il cliente quando apre l'esercizio"><Textarea name="description" rows={4} defaultValue={values?.description} /></Field>
      <Field label="Categoria" hint="facoltativa: es. Dorso, Gambe, Core"><Input name="category" defaultValue={values?.category} /></Field>
      {values ? (
        <label className="flex items-center gap-3 text-[15px]">
          <input type="checkbox" name="archived" defaultChecked={values.archived} className="h-5 w-5 accent-[#1b1a17]" />
          Nascondi dalla scelta nei nuovi programmi
        </label>
      ) : null}
    </>
  );
  // esercizio che c'è già: si salva da solo mentre scrivi
  if (values) {
    return (
      <LiveForm action={action} name={draftName} className="flex flex-col gap-4">
        {fields}
      </LiveForm>
    );
  }
  return <NewExercise action={action}>{fields}</NewExercise>;
}

function NewExercise({ action, children }: { action: (s: ActionState, fd: FormData) => Promise<ActionState>; children: React.ReactNode }) {
  const [state, formAction] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      {children}
      <ActionMessage state={state} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2"><SubmitButton>Aggiungi l&apos;esercizio</SubmitButton><FormDraft form={formRef} name="esercizio-nuovo" /></div>
    </form>
  );
}
