"use client";

import { useActionState, useRef } from "react";
import { ActionMessage, SubmitButton, type ActionState } from "@/components/form-bits";
import { Field, Input, Label, Textarea } from "@/components/ui";
import { DictateButton } from "@/components/dictate-button";

type Action = (s: ActionState, fd: FormData) => Promise<ActionState>;

export function SettingsForm({ action, values }: { action: Action; values: { business_name: string; reminder_days: number; ai_monthly_budget_eur: number | string } }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Nome dell'attività" hint="compare nell'app e nelle email">
        <Input name="business_name" defaultValue={values.business_name} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Preavviso scadenze" hint="giorni">
          <Input name="reminder_days" type="number" min={1} max={30} defaultValue={values.reminder_days} required />
        </Field>
        <Field label="Tetto di spesa AI" hint="€ al mese">
          <Input name="ai_monthly_budget_eur" inputMode="decimal" defaultValue={String(values.ai_monthly_budget_eur).replace(".", ",")} required />
        </Field>
      </div>
      <ActionMessage state={state} />
      <div><SubmitButton>Salva</SubmitButton></div>
    </form>
  );
}

export function MethodForm({ action, value }: { action: Action; value: string }) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-2">
        <Label htmlFor="coaching_method">Il tuo metodo, in parole tue</Label>
        <DictateButton target={ref} />
      </div>
      <Textarea ref={ref} id="coaching_method" name="coaching_method" rows={22} defaultValue={value} className="font-[inherit] text-[15px]" />
      <ActionMessage state={state} />
      <div><SubmitButton>Salva il metodo</SubmitButton></div>
    </form>
  );
}
