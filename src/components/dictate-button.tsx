"use client";

/**
 * Pulsante "Detta": registri la voce (un tocco per iniziare, uno per finire)
 * e il testo trascritto finisce in fondo alla casella. Funziona su iPhone,
 * Android e computer (vedi use-dictation.ts). Se la trascrizione non è
 * attiva e il browser non sa riconoscere la voce, il pulsante non compare.
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

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function DictateButton({
  target,
  targetId,
  onText,
  className,
}: {
  /** La casella dove scrivere (oppure il suo id, comodo nelle pagine del server) */
  target?: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  targetId?: string;
  /** Per le caselle gestite da React (value + onChange): riceve il testo da aggiungere */
  onText?: (t: string) => void;
  className?: string;
}) {
  const { supported, listening, transcribing, seconds, mode, interim, error, toggle } = useDictation((text) => {
    if (onText) return onText(text);
    appendText(target?.current ?? (targetId ? (document.getElementById(targetId) as HTMLTextAreaElement | HTMLInputElement | null) : null), text);
  });
  if (!supported) return null;

  return (
    <span className="inline-flex max-w-full flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={transcribing}
        aria-pressed={listening}
        className={cx(
          "mb-1.5 inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold disabled:opacity-70",
          listening ? "bg-accent text-white" : "bg-sand-deep/70 text-ink hover:bg-sand-deep",
          className,
        )}
      >
        <IconMic size={16} />{" "}
        {transcribing ? "Trascrivo…" : listening ? (mode === "server" ? `${clock(seconds)} · tocca per finire` : "Sto ascoltando… tocca per finire") : "Detta"}
      </button>
      {listening && interim ? <span className="max-w-xs text-right text-xs text-muted italic" aria-live="polite">{interim}…</span> : null}
      {error ? <span role="status" className="max-w-xs text-right text-xs text-accent">{error}</span> : null}
    </span>
  );
}
