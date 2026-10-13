"use client";

/**
 * Azioni rapide sui pagamenti: "Segna pagato" (registra il pagamento atteso
 * con un tocco, dopo conferma) e "Promemoria" (apre la chat dell'app col
 * promemoria già scritto: lo controlli e premi invio).
 */
import Link from "next/link";
import { useState, useTransition } from "react";
import { quickPayment } from "@/app/staff/clienti/[id]/pagamenti/actions";
import { buttonClass, cx } from "./ui";
import { IconChat, IconCheck } from "./icons";
import { toast } from "./toaster";
import { EditPaymentButton, type PaymentValues } from "./edit-payment-dialog";

export function QuickPay({ clientId, name, proposal, reminder, compact, label = "Pagato" }: { clientId: string; name: string; proposal: string | null; reminder: string | null; compact?: boolean; label?: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string; payment?: { id: string; values: PaymentValues } } | null>(null);
  if (msg?.ok) {
    return (
      <span className="inline-flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm font-semibold text-ink">
        <span className="inline-flex items-center gap-1.5"><IconCheck size={16} /> {msg.text}</span>
        {msg.payment ? <EditPaymentButton clientId={clientId} paymentId={msg.payment.id} name={name} values={msg.payment.values} /> : null}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      {reminder ? (
        <Link href={reminder} className={cx(buttonClass("secondary", "sm"), "!min-h-9 !px-3")} aria-label={`Promemoria in chat a ${name}`}>
          <IconChat size={16} /> {compact ? "" : "Promemoria"}
        </Link>
      ) : null}
      {proposal ? (
        <button
          type="button"
          disabled={pending}
          className={cx(buttonClass(label === "Pagato" ? "primary" : "secondary", "sm"), "!min-h-9 !px-3")}
          onClick={() => {
            if (!window.confirm(`Registrare il pagamento di ${name}?\n${proposal}`)) return;
            start(async () => {
              const r = await quickPayment(clientId);
              if (r?.error) setMsg({ ok: false, text: r.error });
              else {
                toast(`${name}: ${r?.message ?? "registrato"}`);
                const pay = r && "payment" in r ? r.payment : undefined;
                setMsg({
                  ok: true,
                  text: r?.message ?? "Registrato",
                  payment: pay ? { id: pay.id, values: { paid_on: pay.paid_on, amount: pay.amount, method: pay.method, period_start: pay.period_start, period_end: pay.period_end, sessions: pay.sessions, notes: "", extra: false } } : undefined,
                });
              }
            });
          }}
        >
          {pending ? "…" : label}
        </button>
      ) : null}
      {msg && !msg.ok ? <span className="w-full text-right text-sm text-accent-deep">{msg.text}</span> : null}
    </span>
  );
}
