"use client";

import { useActionState, useRef, useState } from "react";
import { ActionMessage, SubmitButton, type ActionState } from "@/components/form-bits";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { isPeriodic, METHOD_LABELS, METHODS, periodEnd, PLAN_KINDS, PLAN_LABELS, type PlanKind } from "@/lib/billing";
import { isISODate } from "@/lib/dates";

type Action = (s: ActionState, fd: FormData) => Promise<ActionState>;

export function PlanForm({
  action,
  values,
  today,
  submitLabel,
  editing = false,
}: {
  action: Action;
  values?: { kind: string; amount: number | string; method: string; start_date: string; package_sessions: number | null; notes: string };
  today: string;
  submitLabel: string;
  /** modifica di un piano esistente: si sceglie se vale da una data o se è una correzione */
  editing?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const [kind, setKind] = useState<PlanKind>((values?.kind as PlanKind) ?? "monthly");
  const [mode, setMode] = useState<"from" | "fix">("from");
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
        <Field label="In vigore dal" hint={kind === "package" ? "le sessioni PT da questa data scalano il pacchetto" : undefined}>
          <Input key={mode} name="start_date" type="date" defaultValue={editing && mode === "from" ? today : values?.start_date ?? today} required />
        </Field>
      </div>
      {editing ? (
        <fieldset className="flex flex-col gap-2 rounded-2xl bg-sand p-4">
          <legend className="sr-only">Come vale la modifica</legend>
          <label className="flex items-start gap-3 text-[15px]">
            <input type="radio" name="mode" value="from" checked={mode === "from"} onChange={() => setMode("from")} className="mt-1 h-5 w-5 accent-[#1b1a17]" />
            <span><strong>Cambia da una data</strong><span className="block text-sm text-muted">Per esempio un nuovo prezzo o un altro tipo di abbonamento. Il piano di prima resta nello storico con i suoi pagamenti.</span></span>
          </label>
          <label className="flex items-start gap-3 text-[15px]">
            <input type="radio" name="mode" value="fix" checked={mode === "fix"} onChange={() => setMode("fix")} className="mt-1 h-5 w-5 accent-[#1b1a17]" />
            <span><strong>Correggi un errore</strong><span className="block text-sm text-muted">Il piano era stato scritto male: la correzione vale anche per i pagamenti già registrati.</span></span>
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

export function PaymentForm({
  action,
  kind,
  defaults,
}: {
  action: Action;
  kind: PlanKind;
  defaults: { paid_on: string; amount: number | string; method: string; period_start: string | null; period_end: string | null; sessions: number | null };
}) {
  const [state, formAction] = useActionState(action, null);
  const [start, setStart] = useState(defaults.period_start ?? "");
  const [end, setEnd] = useState(defaults.period_end ?? "");
  // dopo un pagamento registrato il periodo proposto avanza: aggiorniamo i campi
  const [prevDefaults, setPrevDefaults] = useState(`${defaults.period_start}|${defaults.period_end}`);
  const currentDefaults = `${defaults.period_start}|${defaults.period_end}`;
  if (currentDefaults !== prevDefaults) {
    setPrevDefaults(currentDefaults);
    setStart(defaults.period_start ?? "");
    setEnd(defaults.period_end ?? "");
  }
  const formRef = useRef<HTMLFormElement>(null);
  const periodic = isPeriodic(kind);
  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Pagato il">
          <Input name="paid_on" type="date" defaultValue={defaults.paid_on} required />
        </Field>
        <Field label="Importo">
          <Input name="amount" inputMode="decimal" defaultValue={String(defaults.amount).replace(".", ",")} required />
        </Field>
        <Field label="Metodo">
          <Select name="method" defaultValue={defaults.method}>
            {METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
          </Select>
        </Field>
      </div>
      {periodic ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Copre dal">
            <Input
              name="period_start"
              type="date"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                if (isISODate(e.target.value)) setEnd(periodEnd(kind, e.target.value) ?? "");
              }}
              required
            />
          </Field>
          <Field label="Al" hint="calcolato in automatico">
            <Input name="period_end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </Field>
        </div>
      ) : (
        <Field label="Sessioni pagate">
          <Input name="sessions" type="number" min={1} defaultValue={defaults.sessions ?? 1} required className="max-w-40" />
        </Field>
      )}
      <Field label="Note" hint="facoltative">
        <Input name="notes" placeholder="Es. pagato metà, il resto a fine mese" />
      </Field>
      <ActionMessage state={state} />
      <div><SubmitButton>Registra il pagamento</SubmitButton></div>
    </form>
  );
}

/**
 * Pagamento fuori dal piano (sessioni PT in più, una consulenza…): entra negli
 * incassi ma non sposta la scadenza del piano e non tocca le sessioni del pacchetto.
 */
export function ExtraPaymentForm({ action, today, method, defaults, submitLabel = "Registra il pagamento extra" }: { action: Action; today: string; method: string; defaults?: { amount?: number | null; sessions?: number | null; notes?: string }; submitLabel?: string }) {
  const [state, formAction] = useActionState(action, null);
  // dopo un salvataggio riuscito i campi tornano vuoti (il form si ricrea)
  const [prev, setPrev] = useState(state);
  const [round, setRound] = useState(0);
  if (state !== prev) {
    setPrev(state);
    if (state && "ok" in state && state.ok) setRound((r) => r + 1);
  }
  return (
    <form key={round} action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Pagato il">
          <Input name="paid_on" type="date" defaultValue={today} required />
        </Field>
        <Field label="Importo">
          <Input name="amount" inputMode="decimal" placeholder="Es. 700" defaultValue={defaults?.amount ? String(defaults.amount).replace(".", ",") : undefined} required />
        </Field>
        <Field label="Metodo">
          <Select name="method" defaultValue={method}>
            {METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <Field label="Sessioni" hint="se le scrivi, scalano da sole">
          <Input name="sessions" type="number" min={1} placeholder="Es. 10" defaultValue={defaults?.sessions ?? undefined} />
        </Field>
        <Field label="Per cosa">
          <Input name="notes" defaultValue={defaults?.notes ?? "Sessioni PT extra"} required />
        </Field>
      </div>
      <ActionMessage state={state} />
      <div><SubmitButton variant="secondary">{submitLabel}</SubmitButton></div>
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

/** Prezzo di una sessione PT. */
export function PtPriceForm({ action, price }: { action: Action; price: number | null }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input name="price" inputMode="decimal" placeholder="Es. 45" defaultValue={price !== null ? String(price).replace(".", ",") : undefined} className="max-w-32" aria-label="Prezzo a sessione" />
        <SubmitButton variant="secondary" size="sm">Salva il prezzo</SubmitButton>
      </div>
      <ActionMessage state={state} />
    </form>
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
          <Field label="Al">
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
