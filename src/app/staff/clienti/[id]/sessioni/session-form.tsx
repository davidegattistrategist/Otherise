"use client";

import { useActionState, useEffect, useRef } from "react";
import { ActionMessage, SubmitButton, type ActionState } from "@/components/form-bits";
import { Input, Label, Textarea } from "@/components/ui";
import { DictateButton } from "@/components/dictate-button";

export function SessionForm({
  action,
  values,
  today,
  compact,
  showPackage = true,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  values?: { session_date: string; notes: string; counts_toward_package: boolean };
  today: string;
  compact?: boolean;
  showPackage?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (state?.ok && !values) formRef.current?.reset();
  }, [state, values]);
  const uid = values ? values.session_date + values.notes.length : "nuova";
  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor={`d-${uid}`}>Data</Label>
          <Input id={`d-${uid}`} type="date" name="session_date" defaultValue={values?.session_date ?? today} required className="w-auto" />
        </div>
        {showPackage ? (
          <label className="flex min-h-11 items-center gap-2 text-[15px]">
            <input type="checkbox" name="counts_toward_package" defaultChecked={values?.counts_toward_package ?? true} className="h-5 w-5 accent-[var(--color-accent)]" />
            Conta nel pacchetto
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
        <Textarea ref={notesRef} id={`n-${uid}`} name="notes" rows={compact ? 3 : 5} defaultValue={values?.notes ?? ""} placeholder="Es. Squat 4x6 a 80 kg, ginocchio sinistro ok. Da rivedere lo stacco: schiena che si arrotonda all'ultima ripetizione." />
      </div>
      <ActionMessage state={state} />
      <div><SubmitButton size={compact ? "sm" : "md"}>{values ? "Salva modifiche" : "Salva la sessione"}</SubmitButton></div>
    </form>
  );
}
