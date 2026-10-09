"use client";

/**
 * Azioni rapide sui pagamenti: "Segna pagato" (registra il pagamento atteso
 * con un tocco, dopo conferma) e "WhatsApp" (apre la chat col promemoria già scritto).
 */
import { useState, useTransition } from "react";
import { quickPayment } from "@/app/staff/clienti/[id]/pagamenti/actions";
import { buttonClass, cx } from "./ui";
import { IconCheck, IconWhatsapp } from "./icons";
import { toast } from "./toaster";

export function QuickPay({ clientId, name, proposal, whatsapp, compact, label = "Pagato" }: { clientId: string; name: string; proposal: string | null; whatsapp: string | null; compact?: boolean; label?: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (msg?.ok) return <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink"><IconCheck size={16} /> {msg.text}</span>;
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      {whatsapp ? (
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={cx(buttonClass("secondary", "sm"), "!min-h-9 !px-3")} aria-label={`Promemoria WhatsApp a ${name}`}>
          <IconWhatsapp size={16} /> {compact ? "" : "WhatsApp"}
        </a>
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
                setMsg({ ok: true, text: r?.message ?? "Registrato" });
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
