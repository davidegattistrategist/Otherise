"use client";

/**
 * Dettatura con il riconoscimento vocale del browser, usata dal pulsante
 * "Detta" e dal pannello dell'assistente AI.
 *
 * - Mostra il testo mentre parli (risultati provvisori), così si vede subito
 *   che funziona.
 * - Se il microfono non trascrive nulla entro pochi secondi, o il browser dà
 *   errore (permesso negato, niente rete…), si ferma e lo dice in italiano:
 *   niente più "Sto ascoltando…" che resta acceso per sempre.
 * - Su iPhone e iPad non si usa: lì il riconoscimento del browser è
 *   inaffidabile (nelle app sulla schermata Home spesso non trascrive nulla).
 *   La dettatura della tastiera (il microfono sulla tastiera) funziona sempre.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

type SpeechResult = ArrayLike<{ transcript: string }> & { isFinal: boolean };
type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<SpeechResult> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
};

/** Secondi di silenzio del riconoscimento (nessun risultato) prima di arrendersi. */
export const DICTATION_WATCHDOG_MS = 8000;

export function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function getSpeech(): (new () => SpeechRec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Il pulsante "Detta" va mostrato? (no su iPhone/iPad, no se il browser non lo supporta) */
export function dictationAvailable(): boolean {
  return getSpeech() !== null && !isAppleMobile();
}

export function dictationErrorText(code: string | undefined): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Il microfono non è consentito per questo sito. Consentilo nelle impostazioni del browser, oppure usa il microfono della tastiera.";
    case "no-speech":
      return "Non ho sentito nulla. Riprova, oppure usa il microfono della tastiera.";
    case "network":
      return "Per dettare serve la connessione internet. Controllala, oppure usa il microfono della tastiera.";
    case "audio-capture":
      return "Non trovo il microfono. Controlla che sia collegato, oppure scrivi il testo.";
    case "watchdog":
      return "Il riconoscimento vocale non sta trascrivendo su questo dispositivo. Usa il microfono della tastiera: il testo detto finisce comunque nella casella.";
    default:
      return "La dettatura si è interrotta. Riprova, oppure usa il microfono della tastiera.";
  }
}

const noop = () => () => {};

export function useDictation(onFinal: (text: string) => void) {
  const supported = useSyncExternalStore(noop, dictationAvailable, () => false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<SpeechRec | null>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef("");
  const stoppedByUser = useRef(false);
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  const clearWatchdog = () => {
    if (watchdog.current) clearTimeout(watchdog.current);
    watchdog.current = null;
  };

  /** Il testo provvisorio non ancora confermato diventa definitivo (fine dettatura). */
  const flush = useCallback(() => {
    const text = pending.current.trim();
    pending.current = "";
    setInterim("");
    if (text) onFinalRef.current(text);
  }, []);

  const stop = useCallback(() => {
    stoppedByUser.current = true;
    clearWatchdog();
    try {
      rec.current?.stop();
    } catch {}
  }, []);

  useEffect(
    () => () => {
      clearWatchdog();
      try {
        rec.current?.abort();
      } catch {}
    },
    [],
  );

  const start = useCallback(() => {
    const Ctor = getSpeech();
    if (!Ctor) return;
    setError(null);
    stoppedByUser.current = false;
    const r = new Ctor();
    r.lang = "it-IT";
    r.continuous = true;
    r.interimResults = true;
    let heard = false;
    let failed = false;
    r.onresult = (e) => {
      heard = true;
      clearWatchdog();
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0]?.transcript ?? "";
        if (e.results[i].isFinal) finalText += t;
        else interimText += t;
      }
      if (finalText.trim()) onFinalRef.current(finalText.trim());
      pending.current = interimText;
      setInterim(interimText.trim());
    };
    r.onerror = (e) => {
      failed = true;
      clearWatchdog();
      // "aborted" arriva quando lo fermiamo noi: non è un errore
      if (e?.error !== "aborted") setError(dictationErrorText(e?.error));
    };
    r.onend = () => {
      clearWatchdog();
      flush();
      setListening(false);
      rec.current = null;
      if (!heard && !failed && !stoppedByUser.current) setError(dictationErrorText("watchdog"));
    };
    rec.current = r;
    try {
      r.start();
    } catch {
      setError(dictationErrorText(undefined));
      return;
    }
    setListening(true);
    // se entro qualche secondo non arriva niente, il riconoscimento è bloccato: fermiamo tutto
    watchdog.current = setTimeout(() => {
      if (!heard) {
        failed = true;
        setError(dictationErrorText("watchdog"));
        try {
          r.abort();
        } catch {}
        setListening(false);
      }
    }, DICTATION_WATCHDOG_MS);
  }, [flush]);

  const toggle = useCallback(() => (listening ? stop() : start()), [listening, start, stop]);

  return { supported, listening, interim, error, start, stop, toggle, clearError: () => setError(null) };
}
