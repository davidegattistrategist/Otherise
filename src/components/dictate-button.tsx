"use client";

/**
 * Pulsante "Detta": scrive nella casella di testo quello che dici al
 * microfono (riconoscimento vocale del browser, funziona su Chrome, Edge e
 * Safari). Se il browser non lo supporta il pulsante non compare: resta la
 * dettatura della tastiera del telefono.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { IconMic } from "./icons";
import { cx } from "./ui";

type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function getSpeech(): (new () => SpeechRec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noop = () => () => {};

export function DictateButton({ target, onText, className }: { target?: RefObject<HTMLTextAreaElement | HTMLInputElement | null>; onText?: (t: string) => void; className?: string }) {
  const supported = useSyncExternalStore(noop, () => getSpeech() !== null, () => false);
  const [listening, setListening] = useState(false);
  const rec = useRef<SpeechRec | null>(null);
  useEffect(() => () => rec.current?.stop(), []);
  if (!supported) return null;

  const toggle = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const Ctor = getSpeech();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "it-IT";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) text += e.results[i][0].transcript;
      text = text.trim();
      if (!text) return;
      if (onText) onText(text);
      const el = target?.current;
      if (el) {
        el.value = el.value ? `${el.value.trimEnd()} ${text}` : text;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  };

  return (
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
  );
}
