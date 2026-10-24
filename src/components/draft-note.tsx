"use client";

/**
 * Riga accanto al pulsante dei moduli con la bozza automatica. Deve dire chiaro
 * che la bozza NON è ancora salvata: prima diceva "Salvato in automatico" e,
 * per esempio, una data di nascita scritta nei Dati restava solo nella bozza
 * perché sembrava già salvata. `confirm` = il pulsante da premere.
 */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useFormDraft, type DraftState } from "./use-draft";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const hm = (at: number | null) => (at ? new Date(at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "");

export function DraftNote({ status, restored, onDiscard, className, dark, confirm = "Salva" }: { status: DraftState; restored?: number | null; onDiscard?: () => void; className?: string; dark?: boolean; confirm?: string }) {
  const time = restored ? new Date(restored).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
  const text =
    status.state === "saving"
      ? "Tengo la bozza…"
      : status.state === "saved"
        ? `Non ancora salvato: la bozza è al sicuro (${hm(status.at)}), premi «${confirm}» per salvare`
        : status.state === "local"
          ? `Senza rete: la bozza resta su questo dispositivo, premi «${confirm}» quando torna la connessione`
          : "";
  if (!text && !restored) return null;
  return (
    <div className={cx("flex flex-wrap items-center gap-x-3 gap-y-1 text-sm", dark ? "text-muted-dark" : "text-muted", className)} aria-live="polite" data-draft-note>
      {restored ? (
        <span className={cx("rounded-full px-3 py-1", dark ? "bg-line-dark text-card" : "bg-accent-soft text-ink")} data-draft-restored>
          Ci sono modifiche non ancora salvate ({time}): controllale e premi «{confirm}».
          {onDiscard ? (
            <button type="button" onClick={onDiscard} className="ml-2 underline">Annulla le modifiche</button>
          ) : null}
        </span>
      ) : null}
      {text ? <span className={cx(status.state !== "saving" && !dark && "font-semibold text-accent-deep")} data-draft-status>{text}</span> : null}
    </div>
  );
}

/**
 * Salvataggio automatico di un modulo semplice: basta mettere questo
 * componente dentro (o accanto) al modulo con il suo ref.
 */
export function FormDraft({
  form,
  name,
  className,
  error,
  saved,
}: {
  form: RefObject<HTMLFormElement | null>;
  name: string;
  className?: string;
  /** l'azione ha risposto con un errore: React 19 svuota il modulo, qui si rimette quello che avevi scritto */
  error?: string | null;
  /** l'azione è riuscita senza cambiare pagina: la bozza non serve più */
  saved?: boolean;
}) {
  const d = useFormDraft(form, name);
  const { markSaved } = d;
  const restoreRef = useRef(d.restoreTyped);
  useEffect(() => {
    restoreRef.current = d.restoreTyped;
  });
  const pathname = usePathname();
  useEffect(() => {
    if (!error) return;
    const id = requestAnimationFrame(() => restoreRef.current());
    return () => cancelAnimationFrame(id);
  }, [error]);
  useEffect(() => {
    if (saved) markSaved();
  }, [saved, markSaved]);
  // il nome del pulsante del modulo ("Salva", "Salva la sessione"…), così la riga dice cosa premere
  const [confirm, setConfirm] = useState("Salva");
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const label = form.current?.querySelector<HTMLButtonElement>('button[type="submit"], button:not([type])')?.textContent?.trim();
      if (label) setConfirm(label);
    });
    return () => cancelAnimationFrame(id);
  }, [form]);
  // bozza ripresa: l'avviso anche in cima al modulo (i campi sembrano già salvati, il pulsante è in fondo)
  const [top, setTop] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const f = form.current;
    if (!d.restored || !f) return;
    const box = document.createElement("div");
    f.prepend(box);
    const id = requestAnimationFrame(() => setTop(box));
    return () => {
      cancelAnimationFrame(id);
      box.remove();
      setTop(null);
    };
  }, [form, d.restored]);
  return (
    <>
      {/* l'azione, se riesce, cancella la bozza sul server (clearFormDraft) anche cambiando pagina */}
      <input type="hidden" name="__draft_key" value={`${pathname}#${name}`} />
      <DraftNote status={d.status} restored={d.restored} onDiscard={d.discard} className={className} confirm={confirm} />
      {top && d.restored
        ? createPortal(
            <p className="rounded-2xl bg-accent-soft px-4 py-3 text-[15px] leading-relaxed" role="status" data-draft-top>
              <strong>Modifiche non ancora salvate.</strong> Qui sotto c&apos;è quello che avevi scritto e non avevi salvato: controllalo e premi «{confirm}» in fondo.
            </p>,
            top,
          )
        : null}
    </>
  );
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
