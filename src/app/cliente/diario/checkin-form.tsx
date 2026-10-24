"use client";

import { DictateButton } from "@/components/dictate-button";
import { useActionState, useRef, useState } from "react";
import { FormDraft } from "@/components/draft-note";
import { CHECKIN_QUESTIONS, SCORE_LABELS, checkinWeekFor } from "@/lib/checkin";
import { todayISO } from "@/lib/dates";
import { ActionMessage, SubmitButton } from "@/components/form-bits";
import { Label, Textarea } from "@/components/ui";
import { submitCheckin } from "./actions";

type Values = Partial<Record<(typeof CHECKIN_QUESTIONS)[number]["key"], number>> & { issues?: string; request?: string };

export function CheckinForm({ values, coach }: { values?: Values; coach: string }) {
  const [state, action] = useActionState(submitCheckin, null);
  const [missing, setMissing] = useState<string[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  // controllo nostro (non quello del browser): porta alla prima domanda senza risposta
  const check = (e: React.FormEvent<HTMLFormElement>) => {
    const fd = new FormData(e.currentTarget);
    const empty = CHECKIN_QUESTIONS.filter((q) => !fd.get(q.key)).map((q) => q.key);
    setMissing(empty);
    if (empty.length) {
      e.preventDefault();
      document.getElementById(`q-${empty[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };
  return (
    <form ref={formRef} action={action} onSubmit={check} noValidate className="flex flex-col gap-6">
      {CHECKIN_QUESTIONS.map((q) => (
        <fieldset key={q.key} id={`q-${q.key}`} onChange={() => setMissing((m) => m.filter((k) => k !== q.key))} className="flex flex-col gap-2.5">
          <legend className="mb-2.5 text-[17px] leading-snug font-semibold">{q.label}</legend>
          {missing.includes(q.key) ? <p role="alert" className="-mt-1 text-sm font-semibold text-accent-deep">Scegli un voto da 1 a 5</p> : null}
          <div className="grid grid-cols-5 gap-1.5">
            {[1, 2, 3, 4, 5].map((v) => (
              <label key={v} className="group relative">
                <input type="radio" name={q.key} value={v} defaultChecked={values?.[q.key] === v} required className="peer sr-only" />
                <span className="flex h-16 cursor-pointer flex-col items-center justify-center rounded-2xl bg-sand-deep/60 text-center peer-checked:bg-ink peer-checked:text-card peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
                  <span className="text-xl font-semibold tabular">{v}</span>
                  <span className="text-[10px] leading-tight opacity-80">{SCORE_LABELS[v]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <div>
        <div className="flex items-end justify-between gap-2"><Label htmlFor="issues" hint="facoltativo">Dolori, fastidi o imprevisti</Label><DictateButton targetId="issues" /></div>
        <Textarea id="issues" name="issues" rows={2} defaultValue={values?.issues ?? ""} placeholder="Es. fastidio alla spalla destra nelle distensioni" />
      </div>
      <div>
        <div className="flex items-end justify-between gap-2"><Label htmlFor="request" hint="facoltativo">Vuoi chiedere qualcosa a {coach}?</Label><DictateButton targetId="request" /></div>
        <Textarea id="request" name="request" rows={2} defaultValue={values?.request ?? ""} placeholder="Se scrivi qui, ricevi una risposta" />
      </div>
      {missing.length ? <p role="alert" className="rounded-xl bg-accent-soft px-3 py-2 text-sm">{missing.length === 1 ? "Manca la risposta a una domanda." : `Mancano le risposte a ${missing.length} domande.`}</p> : null}
      <ActionMessage state={state} />
      {/* una bozza per settimana: quella lasciata a metà non ricompare nel diario della settimana dopo */}
      <FormDraft form={formRef} name={`diario-${checkinWeekFor(todayISO()) ?? "oggi"}`} error={state?.error ?? null} />
      <SubmitButton className="w-full" pendingText="Invio…">{values ? "Aggiorna il diario" : "Invia il diario"}</SubmitButton>
    </form>
  );
}
