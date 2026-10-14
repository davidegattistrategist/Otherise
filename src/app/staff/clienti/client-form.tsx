"use client";

import { FormDraft } from "@/components/draft-note";
import { useActionState, useRef } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { ActionMessage, SubmitButton, type ActionState } from "@/components/form-bits";

export type ClientFormValues = {
  first_name?: string;
  last_name?: string;
  email?: string | null;
  phone?: string | null;
  sex?: string | null;
  birth_date?: string | null;
  goals?: string;
  start_date?: string;
  weekly_checkin?: boolean;
  phase_weeks?: number | null;
  coach_id?: string | null;
  status?: string;
  private_notes?: string;
};

export function ClientForm({
  action,
  values = {},
  coaches,
  isOwner,
  isNew,
}: {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>;
  values?: ClientFormValues;
  coaches: Array<{ id: string; full_name: string }>;
  isOwner: boolean;
  isNew?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome"><Input name="first_name" defaultValue={values.first_name} required autoComplete="off" /></Field>
        <Field label="Cognome"><Input name="last_name" defaultValue={values.last_name} autoComplete="off" /></Field>
        <Field label="Email" hint="serve per l'invito"><Input name="email" type="email" defaultValue={values.email ?? ""} autoComplete="off" /></Field>
        <Field label="Telefono"><Input name="phone" type="tel" defaultValue={values.phone ?? ""} autoComplete="off" /></Field>
        <Field label="Sesso" hint="serve per le pliche">
          <Select name="sex" defaultValue={values.sex ?? ""}>
            <option value="">Da decidere</option>
            <option value="F">Donna</option>
            <option value="M">Uomo</option>
          </Select>
        </Field>
        <Field label="Data di nascita" hint="serve per le formule"><Input name="birth_date" type="date" defaultValue={values.birth_date ?? ""} /></Field>
        <Field label="Inizio percorso"><Input name="start_date" type="date" defaultValue={values.start_date ?? ""} /></Field>
        <Field label="Durata delle fasi" hint="come il suo piano">
          <Select name="phase_weeks" defaultValue={values.phase_weeks ? String(values.phase_weeks) : ""}>
            <option value="">Da decidere (solo lezioni PT, cliente spot…)</option>
            <option value="4">4 settimane (check ogni 4)</option>
            <option value="6">6 settimane (check ogni 6)</option>
            {values.phase_weeks && ![4, 6].includes(values.phase_weeks) ? <option value={values.phase_weeks}>{values.phase_weeks} settimane</option> : null}
          </Select>
        </Field>
        {isOwner ? (
          <Field label="Segue il cliente">
            <Select name="coach_id" defaultValue={values.coach_id ?? ""}>
              <option value="">Solo il titolare</option>
              {coaches.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </Select>
          </Field>
        ) : null}
      </div>
      <Field label="Obiettivi" hint="li vede anche il cliente"><Textarea name="goals" defaultValue={values.goals} rows={3} /></Field>
      {!isNew ? (
        <Field label="Note riservate" hint="solo lo staff le vede"><Textarea name="private_notes" defaultValue={values.private_notes} rows={3} /></Field>
      ) : null}
      <label className="flex items-start gap-3 text-[15px]">
        <input type="checkbox" name="weekly_checkin" defaultChecked={values.weekly_checkin ?? false} className="mt-1 h-5 w-5 accent-[#1b1a17]" />
        <span><strong>Diario settimanale</strong><br /><span className="text-muted">Il cliente riceve il questionario da 3 minuti ogni fine settimana.</span></span>
      </label>
      {isNew ? (
        <label className="flex items-start gap-3 text-[15px]">
          <input type="checkbox" name="invite_now" className="mt-1 h-5 w-5 accent-[#1b1a17]" />
          <span><strong>Invia subito l&apos;invito</strong><br /><span className="text-muted">Il cliente riceve un&apos;email per scegliere la password ed entrare.</span></span>
        </label>
      ) : null}
      <ActionMessage state={state} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2"><SubmitButton>{isNew ? "Crea cliente" : "Salva"}</SubmitButton><FormDraft form={formRef} name={isNew ? "nuovo-cliente" : "dati-cliente"} /></div>
    </form>
  );
}
