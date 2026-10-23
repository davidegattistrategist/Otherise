"use client";

import { useActionState, useRef } from "react";
import { FormDraft } from "@/components/draft-note";
import { LiveForm } from "@/components/live-form";
import { ActionMessage, SubmitButton, type ActionState } from "@/components/form-bits";
import { Input, Label, Textarea } from "@/components/ui";
import { DictateButton } from "@/components/dictate-button";

type Values = { assessed_on: string; tight_muscles: string; what_works: string; posture_work: string; notes: string; visible_to_client: boolean };

const SECTIONS = [
  { key: "tight_muscles", label: "Muscoli rigidi / da allungare", placeholder: "Es. psoas e retto femorale a destra, pettorale minore, polpacci." },
  { key: "what_works", label: "Cosa funziona bene", placeholder: "Es. buona mobilità toracica, controllo del core nello stacco." },
  { key: "posture_work", label: "Lavori posturali da fare", placeholder: "Es. 90/90 breathing 2x5 respiri, dead bug, allungamento flessori d'anca a fine seduta." },
  { key: "notes", label: "Altre note", placeholder: "" },
] as const;

export function PostureForm({ action, values, today, postureId }: { action: (s: ActionState, fd: FormData) => Promise<ActionState>; values?: Values; today: string; postureId?: string }) {
  const refs = {
    tight_muscles: useRef<HTMLTextAreaElement>(null),
    what_works: useRef<HTMLTextAreaElement>(null),
    posture_work: useRef<HTMLTextAreaElement>(null),
    notes: useRef<HTMLTextAreaElement>(null),
  };
  const fields = (
    <>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label htmlFor="assessed_on">Data</Label>
          <Input id="assessed_on" type="date" name="assessed_on" defaultValue={values?.assessed_on ?? today} required className="w-auto" />
        </div>
        <label className="flex min-h-11 items-center gap-2 text-[15px]">
          <input type="checkbox" name="visible_to_client" defaultChecked={values?.visible_to_client ?? false} className="h-5 w-5 accent-[var(--color-accent)]" />
          Visibile al cliente
        </label>
      </div>
      {SECTIONS.map((s) => (
        <div key={s.key}>
          <div className="flex items-end justify-between gap-2">
            <Label htmlFor={s.key}>{s.label}</Label>
            <DictateButton target={refs[s.key]} />
          </div>
          <Textarea ref={refs[s.key]} id={s.key} name={s.key} rows={3} defaultValue={values?.[s.key] ?? ""} placeholder={s.placeholder} />
        </div>
      ))}
    </>
  );
  // valutazione già fatta: si salva da sola mentre scrivi
  if (values && postureId) {
    return (
      <LiveForm action={action} name={`posturale-${postureId}`} className="flex flex-col gap-4">
        {fields}
      </LiveForm>
    );
  }
  return <NewPosture action={action}>{fields}</NewPosture>;
}

function NewPosture({ action, children }: { action: (s: ActionState, fd: FormData) => Promise<ActionState>; children: React.ReactNode }) {
  const [state, formAction] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      {children}
      <ActionMessage state={state} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2"><SubmitButton>Salva la valutazione</SubmitButton><FormDraft form={formRef} name="posturale-nuova" /></div>
    </form>
  );
}
