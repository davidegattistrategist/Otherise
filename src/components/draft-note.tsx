"use client";

/** Riga sotto i moduli con il salvataggio automatico e, se è stata ripresa una bozza, "Svuota il modulo". */
import { useRef, type ReactNode, type RefObject } from "react";
import { draftText, useFormDraft, type DraftState } from "./use-draft";
import { cx } from "./ui";

export function DraftNote({ status, restored, onDiscard, className, dark }: { status: DraftState; restored?: number | null; onDiscard?: () => void; className?: string; dark?: boolean }) {
  const text = draftText(status);
  const time = restored ? new Date(restored).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
  if (!text && !restored) return null;
  return (
    <div className={cx("flex flex-wrap items-center gap-x-3 gap-y-1 text-sm", dark ? "text-muted-dark" : "text-muted", className)} aria-live="polite">
      {restored ? (
        <span className={cx("rounded-full px-3 py-1", dark ? "bg-line-dark text-card" : "bg-sand-deep text-ink")}>
          Non si è perso niente: sei ripartito da dove eri rimasto ({time}).
          {onDiscard ? (
            <button type="button" onClick={onDiscard} className="ml-2 text-muted underline">Svuota il modulo</button>
          ) : null}
        </span>
      ) : null}
      {text ? <span>{text}</span> : null}
    </div>
  );
}

/**
 * Salvataggio automatico di un modulo semplice: basta mettere questo
 * componente dentro (o accanto) al modulo con il suo ref.
 */
export function FormDraft({ form, name, className }: { form: RefObject<HTMLFormElement | null>; name: string; className?: string }) {
  const d = useFormDraft(form, name);
  return <DraftNote status={d.status} restored={d.restored} onDiscard={d.discard} className={className} />;
}

/** Modulo di una pagina del server con il salvataggio automatico (es. risposta al diario). */
export function AutosaveForm({ action, name, className, children }: { action: (fd: FormData) => void | Promise<void>; name: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={action} className={className}>
      {children}
      <FormDraft form={ref} name={name} />
    </form>
  );
}
