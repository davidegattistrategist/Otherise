"use client";

import { FormDraft } from "@/components/draft-note";
import { LiveForm } from "@/components/live-form";
import { useActionState, useEffect, useRef } from "react";
import { ActionMessage, SubmitButton, type ActionState } from "@/components/form-bits";
import { Input, Label } from "@/components/ui";
import { NoteArea } from "@/components/note-area";
import { DictateButton } from "@/components/dictate-button";

export function SessionForm({
  action,
  values,
  today,
  compact,
  showPackage = true,
  packageLabel = "Conta nel pacchetto",
  sessionId,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  values?: { session_date: string; notes: string; counts_toward_package: boolean };
  today: string;
  compact?: boolean;
  showPackage?: boolean;
  packageLabel?: string;
  /** sessione già registrata: si salva da sola mentre scrivi */
  sessionId?: string;
}) {
  const uid = sessionId ?? "nuova";
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const fields = (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor={`d-${uid}`}>Data</Label>
          <Input id={`d-${uid}`} type="date" name="session_date" defaultValue={values?.session_date ?? today} required className="w-auto" />
        </div>
        {showPackage ? (
          <label className="flex min-h-11 items-center gap-2 text-[15px]">
            <input type="checkbox" name="counts_toward_package" defaultChecked={values?.counts_toward_package ?? true} className="h-5 w-5 accent-[var(--color-accent)]" />
            {packageLabel}
          </label>
        ) : values && !values.counts_toward_package ? null : (
          <input type="hidden" name="counts_toward_package" value="on" />
        )}
      </div>
      <div>
        <div className="flex items-end justify-between gap-2">
          <Label htmlFor={`n-${uid}`} hint="cosa avete fatto, come stava, cosa ricordare">Note</Label>
          <DictateButton target={notesRef} />
        </div>
        <NoteArea title="Note della sessione" ref={notesRef} id={`n-${uid}`} name="notes" rows={compact ? 3 : 5} defaultValue={values?.notes ?? ""} placeholder="Es. Squat 4x6 a 80 kg, ginocchio sinistro ok. Da rivedere lo stacco: schiena che si arrotonda all'ultima ripetizione." />
      </div>
    </>
  );
  if (values && sessionId) {
    return (
      <LiveForm action={action} name={`sessione-${sessionId}`} className="flex flex-col gap-3">
        {fields}
      </LiveForm>
    );
  }
  return <NewSession action={action} compact={compact} hasValues={Boolean(values)} draftName={`sessione-${uid}`}>{fields}</NewSession>;
}

function NewSession({ action, compact, hasValues, draftName, children }: { action: (s: ActionState, fd: FormData) => Promise<ActionState>; compact?: boolean; hasValues: boolean; draftName: string; children: React.ReactNode }) {
  const [state, formAction] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && !hasValues) formRef.current?.reset();
  }, [state, hasValues]);
  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      {children}
      <ActionMessage state={state} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2"><SubmitButton size={compact ? "sm" : "md"}>Registra la sessione</SubmitButton><FormDraft form={formRef} name={draftName} error={state?.error ?? null} saved={Boolean(state?.ok)} /></div>
    </form>
  );
}
