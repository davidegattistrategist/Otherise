"use client";

import { useRef } from "react";
import type { ActionState } from "@/components/form-bits";
import { LiveForm } from "@/components/live-form";
import { Field, Input, Label, Textarea } from "@/components/ui";
import { DictateButton } from "@/components/dictate-button";

type Action = (s: ActionState, fd: FormData) => Promise<ActionState>;

export function SettingsForm({ action, values, defaultMessage }: { action: Action; values: { business_name: string; reminder_days: number; ai_monthly_budget_eur: number | string; payment_message: string }; defaultMessage: string }) {
  return (
    <LiveForm action={action} name="impostazioni" className="flex flex-col gap-4">
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
      <Field label="Messaggio di promemoria per i rinnovi" hint="{nome} {situazione} {importo} {scadenza}">
        <Textarea name="payment_message" rows={3} defaultValue={values.payment_message} placeholder={defaultMessage} />
      </Field>
    </LiveForm>
  );
}

export function MethodForm({ action, value }: { action: Action; value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <LiveForm action={action} name="metodo" className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-2">
        <Label htmlFor="coaching_method">Il tuo metodo, in parole tue</Label>
        <DictateButton target={ref} />
      </div>
      <Textarea ref={ref} id="coaching_method" name="coaching_method" rows={22} defaultValue={value} className="font-[inherit] text-[15px]" />
    </LiveForm>
  );
}

export function PrivacyForm({ action, values }: { action: Action; values: { legal_name: string; legal_address: string; legal_tax_id: string; privacy_email: string; privacy_pec?: string } }) {
  return (
    <LiveForm action={action} name="privacy" className="flex flex-col gap-4">
      <Field label="Titolare" hint="nome e cognome, o ragione sociale">
        <Input name="legal_name" defaultValue={values.legal_name} placeholder="Mario Rossi" />
      </Field>
      <Field label="Indirizzo" hint="sede o residenza fiscale">
        <Input name="legal_address" defaultValue={values.legal_address} placeholder="Via Roma 1, 20100 Milano" />
      </Field>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]">
        <Field label="Codice fiscale o P. IVA">
          <Input name="legal_tax_id" defaultValue={values.legal_tax_id} />
        </Field>
        <Field label="Email per la privacy">
          <Input name="privacy_email" type="email" defaultValue={values.privacy_email} data-save-on-blur />
        </Field>
        <Field label="PEC" hint="facoltativa">
          <Input name="privacy_pec" type="email" defaultValue={values.privacy_pec ?? ""} data-save-on-blur />
        </Field>
      </div>
    </LiveForm>
  );
}

/** Lezioni imparate dall'AI: il titolare le può correggere o cancellare. */
export function ReplyLessonsForm({ action, value }: { action: Action; value: string }) {
  return (
    <LiveForm action={action} name="abitudini" className="flex flex-col gap-3">
      <Label htmlFor="ai_reply_lessons" hint="una per riga, puoi correggerle o cancellarle">Abitudini nelle risposte</Label>
      <Textarea id="ai_reply_lessons" name="ai_reply_lessons" rows={6} defaultValue={value} placeholder="Ancora niente: arrivano quando correggi una bozza di risposta prima di mandarla." className="font-[inherit] text-[15px]" />
    </LiveForm>
  );
}

export function LessonsForm({ action, value }: { action: Action; value: string }) {
  return (
    <LiveForm action={action} name="lezioni" className="flex flex-col gap-3">
      <Label htmlFor="ai_lessons" hint="una per riga, puoi correggerle o cancellarle">Lezioni</Label>
      <Textarea id="ai_lessons" name="ai_lessons" rows={8} defaultValue={value} placeholder="Ancora niente: le lezioni arrivano quando pubblichi una bozza dell'AI dopo averla corretta." className="font-[inherit] text-[15px]" />
    </LiveForm>
  );
}

export function EmailForm({ action, values }: { action: Action; values: { staff_emails: boolean; client_emails: boolean } }) {
  return (
    <LiveForm action={action} name="email" className="flex flex-col gap-3" hint="Si salva da solo appena tocchi.">
      <label className="flex min-h-11 items-start gap-3 text-[15px]">
        <input type="checkbox" name="staff_emails" defaultChecked={values.staff_emails} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-accent)]" />
        <span>
          <span className="font-semibold">Email a te e ai collaboratori</span>
          <span className="block text-sm text-muted">Di serie no: vedi tutto nell&apos;app, in Oggi e con le notifiche sul telefono.</span>
        </span>
      </label>
      <label className="flex min-h-11 items-start gap-3 text-[15px]">
        <input type="checkbox" name="client_emails" defaultChecked={values.client_emails} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-accent)]" />
        <span>
          <span className="font-semibold">Email ai clienti</span>
          <span className="block text-sm text-muted">Per chi non ha attivato le notifiche sul telefono: le novità non ancora lette nell&apos;app (messaggi, programma pronto, promemoria).</span>
        </span>
      </label>
      <p className="text-sm text-muted">In ogni caso le email sono il meno possibile: niente a chi ha le notifiche attive sul telefono, niente per quello che è già stato letto nell&apos;app, e al massimo una al giorno a persona con tutte le novità insieme. Le email per entrare (invito e nuova password) partono sempre.</p>
    </LiveForm>
  );
}
