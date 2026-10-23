"use client";

import { LiveForm } from "@/components/live-form";
import { useActionState, useState } from "react";
import { ActionMessage, SubmitButton, type ActionState } from "@/components/form-bits";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { METHOD_LABELS, METHODS, periodEnd, PLAN_KINDS, PLAN_LABELS, type PlanKind } from "@/lib/billing";
import { isISODate } from "@/lib/dates";

type Action = (s: ActionState, fd: FormData) => Promise<ActionState>;

export function PlanForm({
  action,
  values,
  today,
  submitLabel,
  editing = false,
  nextStart = null,
}: {
  action: Action;
  values?: { kind: string; amount: number | string; method: string; start_date: string; package_sessions: number | null; notes: string };
  today: string;
  submitLabel: string;
  /** modifica di un piano esistente: si sceglie se vale da una data o se è una correzione */
  editing?: boolean;
  /** coaching con periodi pagati: il giorno dopo l'ultimo periodo pagato (dal prossimo rinnovo) */
  nextStart?: string | null;
}) {
  const [state, formAction] = useActionState(action, null);
  const [kind, setKind] = useState<PlanKind>((values?.kind as PlanKind) ?? "monthly");
  // di partenza non si sposta il periodo: dal prossimo rinnovo, oppure correzione
  const [mode, setMode] = useState<"next" | "from" | "fix">(nextStart ? "next" : "fix");
  const fmtDay = (d: string) => new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo di piano">
          <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value as PlanKind)}>
            {PLAN_KINDS.map((k) => <option key={k} value={k}>{PLAN_LABELS[k]}</option>)}
          </Select>
        </Field>
        <Field label="Importo" hint={kind === "package" ? "per pacchetto" : kind === "single" ? "a sessione" : "a periodo"}>
          <Input name="amount" inputMode="decimal" defaultValue={values ? String(values.amount).replace(".", ",") : ""} placeholder="es. 240" required />
        </Field>
        {kind === "package" ? (
          <Field label="Sessioni nel pacchetto">
            <Input name="package_sessions" type="number" min={1} defaultValue={values?.package_sessions ?? 10} required />
          </Field>
        ) : null}
        <Field label="Metodo abituale">
          <Select name="method" defaultValue={values?.method ?? "transfer"}>
            {METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
          </Select>
        </Field>
        {editing && mode === "next" && nextStart ? (
          <input type="hidden" name="start_date" value={nextStart} />
        ) : (
          <Field label={editing && mode === "fix" ? "Inizio del piano" : "In vigore dal"} hint={editing && mode === "fix" ? "cambiala solo se era sbagliata: sposta i periodi" : kind === "package" ? "le sessioni PT da questa data scalano il pacchetto" : undefined}>
            <Input key={mode} name="start_date" type="date" defaultValue={editing && mode === "from" ? today : values?.start_date ?? today} required />
          </Field>
        )}
      </div>
      {editing ? (
        <fieldset className="flex flex-col gap-2 rounded-2xl bg-sand p-4">
          <legend className="sr-only">Come vale la modifica</legend>
          {nextStart ? (
            <label className="flex items-start gap-3 text-[15px]">
              <input type="radio" name="mode" value="next" checked={mode === "next"} onChange={() => setMode("next")} className="mt-1 h-5 w-5 accent-[#1b1a17]" />
              <span><strong>Dal prossimo rinnovo ({fmtDay(nextStart)})</strong><span className="block text-sm text-muted">Il periodo resta com&apos;è: il nuovo prezzo o il nuovo piano vale dal prossimo pagamento. Quello di prima resta nello storico.</span></span>
            </label>
          ) : null}
          <label className="flex items-start gap-3 text-[15px]">
            <input type="radio" name="mode" value="fix" checked={mode === "fix"} onChange={() => setMode("fix")} className="mt-1 h-5 w-5 accent-[#1b1a17]" />
            <span><strong>Correggi un errore</strong><span className="block text-sm text-muted">Il piano era scritto male (importo, metodo, note): si corregge e basta, date e periodi restano uguali.</span></span>
          </label>
          <label className="flex items-start gap-3 text-[15px]">
            <input type="radio" name="mode" value="from" checked={mode === "from"} onChange={() => setMode("from")} className="mt-1 h-5 w-5 accent-[#1b1a17]" />
            <span><strong>Cambia da una data che scegli</strong><span className="block text-sm text-muted">Il nuovo piano parte da quella data e i periodi ripartono da lì. Il piano di prima resta nello storico con i suoi pagamenti.</span></span>
          </label>
        </fieldset>
      ) : null}
      <Field label="Note" hint="facoltative">
        <Textarea name="notes" rows={2} defaultValue={values?.notes ?? ""} placeholder="Es. sconto amici, paga a inizio mese" />
      </Field>
      <ActionMessage state={state} />
      <div><SubmitButton>{submitLabel}</SubmitButton></div>
    </form>
  );
}

/**
 * Correzione del contatore delle sessioni PT: "oggi gliene restano N" oppure
 * "ne deve saldare N". Da quel momento si conta da solo.
 */
export function PtLeftForm({ action, left, price, first = false }: { action: Action; left: number | null; price: number | null; first?: boolean }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px]">Oggi</span>
        <Select key={`m${left}`} name="mode" defaultValue={left !== null && left < 0 ? "due" : "left"} className="w-auto" aria-label="Situazione">
          <option value="left">gliene restano</option>
          <option value="due">ne deve saldare</option>
        </Select>
        <Input key={`n${left}`} name="count" type="number" min={0} inputMode="numeric" defaultValue={left === null ? "" : Math.abs(left)} placeholder="0" className="max-w-20" aria-label="Numero di sessioni" />
        <span className="text-[15px]">sessioni</span>
      </div>
      {first ? (
        <Field label="Prezzo a sessione" hint="facoltativo, per l'importo da saldare">
          <Input name="price" inputMode="decimal" placeholder="Es. 45" defaultValue={price !== null ? String(price).replace(".", ",") : undefined} className="max-w-32" />
        </Field>
      ) : null}
      <ActionMessage state={state} />
      <div><SubmitButton variant="secondary" size="sm">{first ? "Inizia a contare" : "Salva la correzione"}</SubmitButton></div>
    </form>
  );
}

/** Correzione del credito: "ha un credito di X €" oppure "deve ancora X €". */
export function CreditFixForm({ action, credit }: { action: Action; credit: number }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px]">Oggi</span>
        <Select key={`m${credit}`} name="mode" defaultValue={credit < 0 ? "due" : "credit"} className="w-auto" aria-label="Situazione">
          <option value="credit">ha un credito di</option>
          <option value="due">deve ancora</option>
        </Select>
        <Input key={`c${credit}`} name="credit" inputMode="decimal" defaultValue={credit ? String(Math.abs(credit)).replace(".", ",") : "0"} className="max-w-28" aria-label="Importo in euro" />
        <span className="text-[15px]">€</span>
      </div>
      <ActionMessage state={state} />
      <div><SubmitButton variant="secondary" size="sm">Salva il credito</SubmitButton></div>
    </form>
  );
}

/** Sposta il periodo di coaching da pagare: si sceglie da quando parte, la fine si calcola da sola. */
export function NextPeriodForm({ action, kind, start }: { action: Action; kind: PlanKind; start: string }) {
  const [state, formAction] = useActionState(action, null);
  const [from, setFrom] = useState(start);
  const end = isISODate(from) ? periodEnd(kind, from) : null;
  const fmt = (d: string) => new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Field label="Il periodo da pagare parte dal">
        <Input name="start" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required className="max-w-56" />
      </Field>
      {end ? <p className="text-sm text-muted">Sarà dal {fmt(from)} al {fmt(end)}. L&apos;ultimo periodo pagato arriva fino al giorno prima, così un eventuale stop resta coperto e non risulta da pagare.</p> : null}
      <ActionMessage state={state} />
      <div><SubmitButton variant="secondary" size="sm">Sposta il periodo</SubmitButton></div>
    </form>
  );
}

/** Prezzo di una sessione PT. */
export function PtPriceForm({ action, price }: { action: Action; price: number | null }) {
  // si salva da solo mentre scrivi
  return (
    <LiveForm action={action} name="prezzo-pt" className="flex flex-col gap-2">
      <Input name="price" inputMode="decimal" placeholder="Es. 45" defaultValue={price !== null ? String(price).replace(".", ",") : undefined} className="max-w-32" aria-label="Prezzo a sessione" />
    </LiveForm>
  );
}

export function ReminderButton({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div><SubmitButton variant="secondary" size="sm" pendingText="Invio…">Manda come notifica</SubmitButton></div>
      <ActionMessage state={state} />
    </form>
  );
}

/** Correzione di un pagamento già registrato: data, importo, metodo, periodo coperto o sessioni, note. */
export function EditPaymentForm({
  action,
  values,
}: {
  action: Action;
  values: { paid_on: string; amount: number; method: string; period_start: string | null; period_end: string | null; sessions: number | null; notes: string; extra: boolean };
}) {
  const [state, formAction] = useActionState(action, null);
  const periodic = Boolean(values.period_start && values.period_end);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Pagato il">
          <Input name="paid_on" type="date" defaultValue={values.paid_on} required />
        </Field>
        <Field label="Importo">
          <Input name="amount" inputMode="decimal" defaultValue={String(values.amount).replace(".", ",")} required />
        </Field>
        <Field label="Metodo">
          <Select name="method" defaultValue={values.method}>
            {METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
          </Select>
        </Field>
      </div>
      {periodic ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Copre dal">
            <Input name="period_start" type="date" defaultValue={values.period_start ?? ""} required />
          </Field>
          <Field label="Al" hint="spostala per allungare o accorciare la scadenza">
            <Input name="period_end" type="date" defaultValue={values.period_end ?? ""} required />
          </Field>
        </div>
      ) : values.sessions !== null || values.extra ? (
        <Field label="Sessioni pagate" hint={values.extra ? "facoltative" : undefined}>
          <Input name="sessions" type="number" min={values.extra ? 0 : 1} defaultValue={values.sessions ?? ""} className="max-w-40" />
        </Field>
      ) : null}
      <Field label="Note" hint="facoltative">
        <Input name="notes" defaultValue={values.notes} />
      </Field>
      <ActionMessage state={state} />
      <div><SubmitButton size="sm">Salva le modifiche</SubmitButton></div>
    </form>
  );
}
