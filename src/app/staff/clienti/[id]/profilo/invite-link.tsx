"use client";

/**
 * "Link per entrare": alternativa all'email d'invito, da copiare e mandare al
 * cliente (WhatsApp, SMS). Vale per un solo accesso e scade come l'invito.
 */
import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/form-bits";
import type { InviteLinkState } from "../../actions";
import { TypedEmail } from "./typed-email";

export function InviteLink({ action, name }: { action: (s: InviteLinkState, fd: FormData) => Promise<InviteLinkState>; name: string }) {
  const [state, formAction] = useActionState(action, null);
  const [copied, setCopied] = useState(false);
  const text = state?.link ? `Ciao ${name}! Ecco il link per entrare nell'app e scegliere la tua password: ${state.link}` : "";
  return (
    <div className="flex flex-col gap-2 border-t border-sand-deep pt-3">
      <p className="text-sm leading-relaxed text-muted">L&apos;email non arriva? Prepara un link da mandargli tu, per esempio su WhatsApp. Vale per un solo accesso.</p>
      <form action={formAction}>
        <TypedEmail />
        <SubmitButton variant="secondary" size="sm" pendingText="Preparo…">Prepara il link per entrare</SubmitButton>
      </form>
      {state?.error ? <p role="alert" className="text-sm text-accent-deep">{state.error}</p> : null}
      {state?.link ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-sand p-3">
          <p className="text-sm break-all">{text}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => setCopied(false))}
              className="min-h-9 rounded-full bg-ink px-4 text-sm font-semibold text-card"
            >
              {copied ? "Copiato" : "Copia il messaggio"}
            </button>
            {typeof navigator !== "undefined" && "share" in navigator ? (
              <button type="button" onClick={() => void navigator.share({ text }).catch(() => undefined)} className="min-h-9 rounded-full px-4 text-sm font-semibold ring-1 ring-sand-deep">
                Condividi
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
