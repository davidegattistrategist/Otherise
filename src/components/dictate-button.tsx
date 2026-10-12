"use client";

/**
 * Pulsante "Detta": scrive nella casella di testo quello che dici al
 * microfono (riconoscimento vocale del browser). Mentre parli mostra il testo
 * provvisorio; se il microfono non trascrive o dà errore si ferma e lo dice.
 * Su iPhone/iPad e nei browser che non lo supportano il pulsante non compare:
 * resta la dettatura della tastiera del telefono, che funziona sempre.
 */
import { type RefObject } from "react";
import { IconMic } from "./icons";
import { cx } from "./ui";
import { useDictation } from "./use-dictation";

/** Aggiunge il testo dettato in fondo alla casella e avvisa il form del cambiamento. */
function appendText(el: HTMLTextAreaElement | HTMLInputElement | null | undefined, text: string) {
  if (!el) return;
  el.value = el.value ? `${el.value.trimEnd()} ${text}` : text;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export function DictateButton({ target, onText, className }: { target?: RefObject<HTMLTextAreaElement | HTMLInputElement | null>; onText?: (t: string) => void; className?: string }) {
  const { supported, listening, interim, error, toggle } = useDictation((text) => {
    if (onText) onText(text);
    appendText(target?.current, text);
  });
  if (!supported) return null;

  return (
    <span className="inline-flex max-w-full flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={listening}
        className={cx(
          "mb-1.5 inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold",
          listening ? "bg-accent text-white" : "bg-sand-deep/70 text-ink hover:bg-sand-deep",
          className,
        )}
      >
        <IconMic size={16} /> {listening ? "Sto ascoltando… tocca per finire" : "Detta"}
      </button>
      {listening && interim ? <span className="max-w-xs text-right text-xs text-muted italic" aria-live="polite">{interim}…</span> : null}
      {error ? <span role="status" className="max-w-xs text-right text-xs text-accent">{error}</span> : null}
    </span>
  );
}
