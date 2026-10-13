"use client";

/**
 * "Modifica" su un pagamento già registrato, da qualsiasi elenco (Tutti i
 * pagamenti, incassi del mese, subito dopo "Pagato"): apre una finestra con
 * il modulo di correzione (data, importo, metodo, periodo o sessioni, note)
 * e la possibilità di eliminarlo, senza dover aprire la scheda del cliente.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { deletePayment, updatePayment } from "@/app/staff/clienti/[id]/pagamenti/actions";
import { EditPaymentForm } from "@/app/staff/clienti/[id]/pagamenti/forms";
import { IconX } from "./icons";
import { cx } from "./ui";

export type PaymentValues = {
  paid_on: string;
  amount: number;
  method: string;
  period_start: string | null;
  period_end: string | null;
  sessions: number | null;
  notes: string;
  extra: boolean;
};

export function EditPaymentButton({
  clientId,
  paymentId,
  name,
  values,
  label = "Modifica",
  className,
  onOpenChange,
}: {
  clientId: string;
  paymentId: string;
  name: string;
  values: PaymentValues;
  label?: string;
  className?: string;
  /** avvisa chi contiene il pulsante quando la finestra si apre o si chiude */
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpenState] = useState(false);
  const notify = useRef(onOpenChange);
  useEffect(() => {
    notify.current = onOpenChange;
  });
  const setOpen = (v: boolean) => {
    setOpenState(v);
    notify.current?.(v);
  };
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpenState(false);
      notify.current?.(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (deleted) return <span className="text-sm text-muted">Eliminato</span>;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setConfirmDelete(false);
          setOpen(true);
        }}
        className={cx("inline-flex min-h-9 items-center text-sm font-semibold text-ink-soft underline", className)}
        aria-label={`${label}: pagamento di ${name}`}
      >
        {label}
      </button>
      {open ? createPortal(
        <div
          className="fixed inset-0 z-[95] flex items-end justify-center bg-ink/40 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={`Correggi il pagamento di ${name}`}
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-card px-5 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-left sm:rounded-[28px] sm:px-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="eyebrow">Correggi il pagamento</div>
                <h2 className="mt-1 text-[20px] leading-tight font-semibold">{name}</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-ink/5" aria-label="Chiudi">
                <IconX size={20} />
              </button>
            </div>
            <EditPaymentForm action={updatePayment.bind(null, clientId, paymentId)} values={values} />
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-sand-deep pt-4">
              {confirmDelete ? (
                <>
                  <span className="text-sm">Eliminare questo pagamento?</span>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() =>
                      startDelete(async () => {
                        await deletePayment(clientId, paymentId);
                        setOpen(false);
                        setDeleted(true);
                      })
                    }
                    className="min-h-10 rounded-full border-[1.5px] border-accent-deep px-4 text-sm font-semibold text-accent-deep disabled:opacity-60"
                  >
                    {deleting ? "Elimino…" : "Sì, elimina"}
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="min-h-10 px-2 text-sm font-semibold text-muted underline">No</button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} className="min-h-10 text-sm font-semibold text-accent-deep underline">Elimina il pagamento</button>
              )}
              <button type="button" onClick={() => setOpen(false)} className="ml-auto min-h-10 px-2 text-sm font-semibold underline">Chiudi</button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
