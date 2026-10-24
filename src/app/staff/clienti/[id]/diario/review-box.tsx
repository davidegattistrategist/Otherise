"use client";

/**
 * Risposta a un diario. Per i diari non ancora visti il modulo è aperto; per
 * quelli già visti si vede la risposta data e "Modifica" la riapre (così
 * aprendo la scheda non partono decine di bozze automatiche). Il pulsante dice
 * quello che succede: "Invia risposta" se hai scritto qualcosa (al cliente
 * arriva un avviso), "Segna come visto" se il campo è vuoto.
 */
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { FormDraft } from "@/components/draft-note";
import { SubmitButton } from "@/components/form-bits";

export function ReviewBox({
  action,
  name,
  reviewed,
  reply,
  reviewedLabel,
  children,
}: {
  action: (fd: FormData) => Promise<{ ok: boolean; error?: string } | void>;
  name: string;
  reviewed: boolean;
  reply: string;
  reviewedLabel?: string;
  /** etichetta, bozza dell'AI e casella (con name="coach_reply") */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(!reviewed);
  const form = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(async (_: { ok: boolean; error?: string } | null, fd: FormData) => (await action(fd)) ?? { ok: true }, null);
  const [hasText, setHasText] = useState(Boolean(reply.trim()));
  useEffect(() => {
    const f = form.current;
    if (!f) return;
    const read = () => setHasText(Boolean((f.elements.namedItem("coach_reply") as HTMLTextAreaElement | null)?.value.trim()));
    read();
    f.addEventListener("input", read);
    return () => f.removeEventListener("input", read);
  }, [open]);

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        {reply ? <p className="rounded-2xl bg-sand-deep/50 px-4 py-3 text-[15px] whitespace-pre-line"><span className="font-semibold">Hai risposto:</span> {reply}</p> : null}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold underline">{reply ? "Modifica la risposta" : "Rispondi"}</button>
          {reviewedLabel ? <span className="text-sm text-muted">{reviewedLabel}</span> : null}
        </div>
      </div>
    );
  }
  const label = reviewed ? (hasText ? "Aggiorna risposta" : "Salva") : hasText ? "Invia risposta" : "Segna come visto";
  return (
    <form ref={form} action={formAction} className="flex flex-col gap-2">
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton size="sm" variant={reviewed ? "secondary" : "primary"}>{label}</SubmitButton>
        {reviewedLabel ? <span className="text-sm text-muted">{reviewedLabel}</span> : null}
      </div>
      {state?.error ? <p role="alert" className="text-sm font-semibold text-accent-deep">{state.error}</p> : null}
      <FormDraft form={form} name={name} error={state?.error ?? null} saved={Boolean(state?.ok)} />
    </form>
  );
}
