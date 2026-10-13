"use client";

/**
 * Messaggi brevi di conferma ("Registrato 480 €…") che restano visibili
 * anche quando la pagina si aggiorna. Si usa con toast("testo").
 * Dopo un pagamento il messaggio porta anche "Modifica": la riga del cliente
 * può sparire dall'elenco (non c'è più niente da incassare), ma il pagamento
 * appena registrato si corregge lo stesso da qui.
 */
import { useEffect, useRef, useState } from "react";
import { IconCheck, IconX } from "./icons";
import { EditPaymentButton, type PaymentValues } from "./edit-payment-dialog";

const EVENT = "otherise:toast";
const SHORT_MS = 4500;
const WITH_EDIT_MS = 15000;

type Edit = { clientId: string; paymentId: string; name: string; values: PaymentValues };
type Item = { id: number; text: string; edit?: Edit };

export function toast(text: string, edit?: Edit) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { text, edit } }));
}

export function Toaster() {
  const [items, setItems] = useState<Item[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const remove = (id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((cur) => cur.filter((i) => i.id !== id));
  };
  const schedule = (id: number, ms: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(() => remove(id), ms));
  };
  useEffect(() => {
    const on = (e: Event) => {
      const { text, edit } = (e as CustomEvent<{ text: string; edit?: Edit }>).detail;
      const id = Date.now() + Math.random();
      setItems((cur) => [...cur, { id, text, edit }]);
      schedule(id, edit ? WITH_EDIT_MS : SHORT_MS);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!items.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--nav-space)+0.75rem)] z-[70] flex flex-col items-center gap-2 px-4 lg:bottom-6" role="status" aria-live="polite">
      {items.map((i) => (
        <div key={i.id} className="pointer-events-auto flex max-w-md items-center gap-2 rounded-full bg-ink py-2 pr-2 pl-4 text-sm font-semibold text-card shadow-lg">
          <IconCheck size={16} className="shrink-0" /> <span className="min-w-0">{i.text}</span>
          {i.edit ? (
            <>
              <EditPaymentButton
                {...i.edit}
                className="ml-1 shrink-0 rounded-full bg-card/15 px-3 !text-card no-underline"
                // finché la finestra è aperta il messaggio non sparisce
                onOpenChange={(open) => (open ? clearTimeout(timers.current.get(i.id)) : schedule(i.id, SHORT_MS))}
              />
              <button type="button" onClick={() => remove(i.id)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-card/15" aria-label="Chiudi il messaggio">
                <IconX size={16} />
              </button>
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
}
