"use client";

/**
 * Dettatura, usata dal pulsante "Detta" e dal pannello dell'assistente AI.
 *
 * Modo principale (uguale su iPhone, Android e computer): il telefono
 * REGISTRA la voce e il server la trascrive (/api/trascrivi, Groq Whisper,
 * lo stesso servizio dei vocali in chat). Il riconoscimento vocale del
 * browser su iPhone spesso non trascrive nulla, quindi non ci affidiamo a lui.
 *
 * Solo se la trascrizione non è attiva (manca GROQ_API_KEY) si usa il
 * riconoscimento del browser, dove funziona (non su iPhone/iPad):
 * - mostra il testo mentre parli (risultati provvisori);
 * - se non trascrive nulla entro pochi secondi, o dà errore, si ferma e lo
 *   dice in italiano.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useVoiceRecorder, voiceSupported } from "./chat/voice";

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

function useBrowserDictation(onFinal: (text: string) => void) {
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

/** Durata massima di una dettatura registrata (poi si ferma e trascrive). */
export const DICTATION_MAX_SECONDS = 4 * 60;

export function recordingErrorText(e: unknown): string {
  const name = (e as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Il microfono non è consentito. Su iPhone: Impostazioni → Safari (o l'app) → Microfono → Consenti. Su Android: tocca il lucchetto accanto all'indirizzo → Autorizzazioni → Microfono.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Non trovo il microfono. Controlla che sia collegato, oppure scrivi il testo.";
  if (name === "NotReadableError" || name === "AbortError") return "Il microfono è usato da un'altra app (una chiamata, un vocale?). Chiudila e riprova.";
  return "Non riesco ad accendere il microfono. Riprova, oppure scrivi il testo.";
}

// La trascrizione sul server è attiva? (una sola domanda per pagina)
let serverCheck: Promise<boolean> | null = null;
function serverTranscription(): Promise<boolean> {
  serverCheck ??= fetch("/api/trascrivi", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : { enabled: false }))
    .then((d: { enabled?: boolean }) => Boolean(d.enabled))
    .catch(() => {
      serverCheck = null; // offline: riprova alla prossima occasione
      return false;
    });
  return serverCheck;
}

async function transcribe(blob: Blob, type: string): Promise<string> {
  const form = new FormData();
  const ext = type.includes("webm") ? "webm" : type.includes("ogg") ? "ogg" : "m4a";
  form.append("audio", new File([blob], `dettatura.${ext}`, { type }));
  let res: Response;
  try {
    res = await fetch("/api/trascrivi", { method: "POST", body: form });
  } catch {
    throw new Error("Non c'è connessione: la trascrizione non è partita. Controlla la rete e riprova.");
  }
  const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!res.ok) throw new Error(data.error ?? "La trascrizione non è riuscita. Riprova.");
  return (data.text ?? "").trim();
}

/**
 * Dettatura: registra e trascrive sul server; se non è possibile, usa il
 * riconoscimento del browser. `stop()` restituisce il testo trascritto (che
 * arriva anche a `onFinal`), così chi sta per inviare può aspettarlo.
 */
export function useDictation(onFinal: (text: string) => void) {
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);
  const browser = useBrowserDictation((t) => onFinalRef.current(t));
  const [server, setServer] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<() => Promise<string | null>>(async () => null);
  // a DICTATION_MAX_SECONDS si ferma e trascrive da sola
  const voice = useVoiceRecorder(() => void stopRef.current(), DICTATION_MAX_SECONDS);

  useEffect(() => {
    let alive = true;
    if (voiceSupported()) void serverTranscription().then((on) => alive && setServer(on));
    return () => {
      alive = false;
    };
  }, []);

  const mode: "server" | "browser" | "none" = server ? "server" : browser.supported ? "browser" : "none";

  const stopping = useRef(false);
  const stopServer = useCallback(async (): Promise<string | null> => {
    if (stopping.current) return null;
    stopping.current = true;
    const rec = await voice.stop(true).finally(() => {
      stopping.current = false;
    });
    if (!rec || rec.seconds < 0.8 || rec.blob.size < 1500) {
      setError("Non ho sentito nulla. Tocca \"Detta\", parla e poi tocca di nuovo per finire.");
      return null;
    }
    setTranscribing(true);
    try {
      const text = await transcribe(rec.blob, rec.type);
      if (!text) {
        setError("Non ho capito le parole. Riprova parlando più vicino al telefono.");
        return null;
      }
      onFinalRef.current(text);
      return text;
    } catch (e) {
      setError(e instanceof Error ? e.message : "La trascrizione non è riuscita. Riprova.");
      return null;
    } finally {
      setTranscribing(false);
    }
  }, [voice]);
  useEffect(() => {
    stopRef.current = stopServer;
  }, [stopServer]);

  const start = useCallback(async () => {
    if (mode === "browser") return browser.start();
    if (mode !== "server" || transcribing) return;
    setError(null);
    try {
      await voice.start();
    } catch (e) {
      setError(recordingErrorText(e));
    }
  }, [mode, browser, voice, transcribing]);

  const stop = useCallback(async (): Promise<string | null> => {
    if (mode === "browser") {
      browser.stop();
      return null;
    }
    if (!voice.recording) return null;
    return stopServer();
  }, [mode, browser, voice.recording, stopServer]);

  const listening = mode === "browser" ? browser.listening : voice.recording;
  const toggle = useCallback(() => {
    if (listening) void stop();
    else void start();
  }, [listening, start, stop]);

  return {
    mode,
    supported: mode !== "none",
    listening,
    /** Il server sta trascrivendo la registrazione */
    transcribing,
    /** Secondi registrati (modo registrazione) */
    seconds: voice.seconds,
    interim: mode === "browser" ? browser.interim : "",
    error: mode === "browser" ? browser.error : error,
    start,
    stop,
    toggle,
    clearError: () => {
      setError(null);
      browser.clearError();
    },
  };
}
