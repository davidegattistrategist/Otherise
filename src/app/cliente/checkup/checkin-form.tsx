"use client";

import { useActionState } from "react";
import { CHECKIN_QUESTIONS, SCORE_LABELS } from "@/lib/checkin";
import { ActionMessage, SubmitButton } from "@/components/form-bits";
import { Label, Textarea } from "@/components/ui";
import { submitCheckin } from "./actions";

type Values = Partial<Record<(typeof CHECKIN_QUESTIONS)[number]["key"], number>> & { issues?: string; request?: string };

export function CheckinForm({ values, coach }: { values?: Values; coach: string }) {
  const [state, action] = useActionState(submitCheckin, null);
  return (
    <form action={action} className="flex flex-col gap-6">
      {CHECKIN_QUESTIONS.map((q) => (
        <fieldset key={q.key} className="flex flex-col gap-2.5">
          <legend className="mb-2.5 text-[17px] leading-snug font-semibold">{q.label}</legend>
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
        <Label htmlFor="issues" hint="facoltativo">Dolori, fastidi o imprevisti</Label>
        <Textarea id="issues" name="issues" rows={2} defaultValue={values?.issues ?? ""} placeholder="Es. fastidio alla spalla destra nelle distensioni" />
      </div>
      <div>
        <Label htmlFor="request" hint="facoltativo">Vuoi chiedere qualcosa a {coach}?</Label>
        <Textarea id="request" name="request" rows={2} defaultValue={values?.request ?? ""} placeholder="Se scrivi qui, ricevi una risposta" />
      </div>
      <ActionMessage state={state} />
      <SubmitButton className="w-full" pendingText="Invio…">{values ? "Aggiorna il check-up" : "Invia il check-up"}</SubmitButton>
    </form>
  );
}
