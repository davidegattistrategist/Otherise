"use client";

/**
 * Salvataggio automatico di quello che si sta scrivendo (check, programmi,
 * chat, note, diario…): a ogni lettera la bozza va nel telefono (subito) e,
 * dopo un attimo di pausa, sul server (tabella `drafts`, /api/bozze). Se si
 * chiude l'app, si cambia pagina o salta la rete non si perde niente: alla
 * riapertura il modulo riprende da lì, anche sull'altro dispositivo. Quando
 * il modulo viene salvato davvero la bozza si cancella.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { usePathname } from "next/navigation";

export type DraftState = { state: "idle" | "saving" | "saved" | "local"; at: number | null };

const LOCAL = "otherise:draft:";
const SERVER_DELAY = 700;
const POLL_MS = 4000;
/** dopo l'ultima lettera scritta qui, per un po' le modifiche dall'altro dispositivo aspettano */
const TYPING_GUARD = 2500;

type Stored<T> = { data: T; at: number };

function readLocal<T>(key: string): Stored<T> | null {
  try {
    const raw = localStorage.getItem(LOCAL + key);
    return raw ? (JSON.parse(raw) as Stored<T>) : null;
  } catch {
    return null;
  }
}

function writeLocal<T>(key: string, data: T) {
  try {
    localStorage.setItem(LOCAL + key, JSON.stringify({ data, at: Date.now() }));
  } catch {
    // spazio pieno o modalità privata: resta il server
  }
}

function removeLocal(key: string) {
  try {
    localStorage.removeItem(LOCAL + key);
  } catch {
    /* niente */
  }
}

async function readServer<T>(key: string): Promise<Stored<T> | null> {
  try {
    const r = await fetch(`/api/bozze?key=${encodeURIComponent(key)}`, { cache: "no-store" });
    if (!r.ok) return null;
    const d = (await r.json()) as { data: T; updated_at: string } | null;
    return d ? { data: d.data, at: new Date(d.updated_at).getTime() } : null;
  } catch {
    return null;
  }
}

/** La bozza più recente tra telefono e server (null se non ce n'è). */
export async function loadDraft<T>(key: string): Promise<Stored<T> | null> {
  const local = readLocal<T>(key);
  const server = await readServer<T>(key);
  if (!local) return server;
  if (!server) return local;
  return local.at > server.at ? local : server;
}

/** Cancella la bozza (dopo il salvataggio vero). */
export function clearDraft(key: string) {
  removeLocal(key);
  void fetch(`/api/bozze?key=${encodeURIComponent(key)}`, { method: "DELETE", keepalive: true }).catch(() => undefined);
}

/**
 * Tiene salvata la bozza di `value` sotto `key`. Con `live` controlla ogni
 * pochi secondi se l'altro dispositivo ha scritto qualcosa di nuovo e lo
 * passa a `onRemote` (solo se qui non stai scrivendo in quel momento).
 */
export function useDraft<T>(
  key: string | null,
  value: T,
  opts: { enabled?: boolean; live?: boolean; onRemote?: (data: T) => void; isEmpty?: (v: T) => boolean } = {},
) {
  const { enabled = true, live = false } = opts;
  const [status, setStatus] = useState<DraftState>({ state: "idle", at: null });
  const lastJson = useRef<string | null>(null);
  const lastTyped = useRef(0);
  const serverAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const cleared = useRef(false);
  const onRemote = useRef(opts.onRemote);
  const isEmpty = useRef(opts.isEmpty);
  useEffect(() => {
    onRemote.current = opts.onRemote;
    isEmpty.current = opts.isEmpty;
  });

  const send = useCallback(async (k: string, body: string) => {
    try {
      const r = await fetch("/api/bozze", { method: "POST", body: `{"key":${JSON.stringify(k)},"data":${body}}`, keepalive: body.length < 60_000 });
      if (!r.ok) throw new Error();
      const d = (await r.json()) as { updated_at: string };
      serverAt.current = new Date(d.updated_at).getTime();
      if (pending.current === body) pending.current = null;
      setStatus({ state: "saved", at: Date.now() });
    } catch {
      setStatus({ state: "local", at: Date.now() });
    }
  }, []);

  // la prima volta il valore di partenza non è una modifica
  useEffect(() => {
    if (lastJson.current === null) lastJson.current = JSON.stringify(value);
  }, [value]);

  useEffect(() => {
    if (!key || !enabled) return;
    const json = JSON.stringify(value);
    if (lastJson.current === null || json === lastJson.current) return;
    lastJson.current = json;
    cleared.current = false;
    lastTyped.current = Date.now();
    if (isEmpty.current?.(value)) {
      // modulo svuotato (o messaggio inviato): niente bozza
      pending.current = null;
      if (timer.current) clearTimeout(timer.current);
      clearDraft(key);
      setStatus({ state: "idle", at: null });
      return;
    }
    writeLocal(key, value);
    pending.current = json;
    setStatus((s) => (s.state === "local" ? s : { state: "saving", at: s.at }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void send(key, json), SERVER_DELAY);
  }, [key, value, enabled, send]);

  // uscita dalla pagina o app in secondo piano: la bozza parte subito
  useEffect(() => {
    if (!key) return;
    const flush = () => {
      if (!pending.current || cleared.current) return;
      const body = `{"key":${JSON.stringify(key)},"data":${pending.current}}`;
      if (navigator.sendBeacon?.("/api/bozze", new Blob([body], { type: "text/plain" }))) pending.current = null;
    };
    const onHidden = () => document.visibilityState === "hidden" && flush();
    const onOnline = () => pending.current && !cleared.current && void send(key, pending.current);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("online", onOnline);
    return () => {
      flush();
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("online", onOnline);
    };
  }, [key, send]);

  // dall'altro dispositivo (modalità check): le novità arrivano da sole
  useEffect(() => {
    if (!key || !live) return;
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible" || Date.now() - lastTyped.current < TYPING_GUARD || pending.current) return;
      const s = await readServer<T>(key);
      if (!s || s.at <= serverAt.current) return;
      serverAt.current = s.at;
      const json = JSON.stringify(s.data);
      if (json === lastJson.current) return;
      lastJson.current = json;
      writeLocal(key, s.data);
      onRemote.current?.(s.data);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [key, live]);

  const clear = useCallback(() => {
    if (!key) return;
    cleared.current = true;
    pending.current = null;
    if (timer.current) clearTimeout(timer.current);
    clearDraft(key);
    setStatus({ state: "idle", at: null });
  }, [key]);

  /** dopo aver ripreso una bozza: quel valore è il nuovo punto di partenza */
  const adopt = useCallback((v: T, at?: number) => {
    lastJson.current = JSON.stringify(v);
    if (at) serverAt.current = Math.max(serverAt.current, at);
  }, []);

  return { status, clear, adopt };
}

/** "Salvato in automatico alle 15:42" sotto il modulo. */
export function draftText(s: DraftState): string {
  const time = s.at ? new Date(s.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "";
  switch (s.state) {
    case "saving":
      return "Salvo…";
    case "saved":
      return `Salvato in automatico alle ${time}`;
    case "local":
      return "Senza rete: salvato su questo dispositivo, lo mando appena torna la connessione";
    default:
      return "";
  }
}

type FormValues = Record<string, string | boolean | string[]>;

/** Valori di un modulo (testi, scelte, spunte; non i file né i campi nascosti). */
function readForm(form: HTMLFormElement): FormValues {
  const out: FormValues = {};
  for (const el of Array.from(form.elements) as Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    if (!el.name || el.disabled || el.dataset.noDraft !== undefined) continue;
    const type = (el as HTMLInputElement).type;
    if (type === "file" || type === "hidden" || type === "submit" || type === "button" || type === "password") continue;
    if (type === "checkbox") out[el.name] = (el as HTMLInputElement).checked;
    else if (type === "radio") {
      if ((el as HTMLInputElement).checked) out[el.name] = el.value;
    } else out[el.name] = el.value;
  }
  return out;
}

function writeForm(form: HTMLFormElement, values: FormValues) {
  for (const el of Array.from(form.elements) as Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    if (!el.name || !(el.name in values) || el.dataset.noDraft !== undefined) continue;
    const v = values[el.name];
    const type = (el as HTMLInputElement).type;
    if (type === "file" || type === "hidden") continue;
    if (type === "checkbox") (el as HTMLInputElement).checked = Boolean(v);
    else if (type === "radio") (el as HTMLInputElement).checked = el.value === v;
    else if (typeof v === "string") el.value = v;
  }
}

/**
 * Salvataggio automatico per un modulo "semplice" (campi non controllati da
 * React): al primo caricamento riprende la bozza, poi la tiene salvata a ogni
 * lettera. `name` distingue i moduli della stessa pagina (la chiave è
 * pagina + nome). Quando il modulo viene inviato la bozza si cancella (se
 * manca la rete no: il salvataggio non partirebbe e la bozza serve ancora).
 */
export function useFormDraft(form: RefObject<HTMLFormElement | null>, name: string) {
  const pathname = usePathname();
  const key = `${pathname}#${name}`;
  const [values, setValues] = useState<FormValues | null>(null);
  const [restored, setRestored] = useState<number | null>(null);
  const draft = useDraft(key, values, { enabled: values !== null });
  const { adopt, clear } = draft;

  useEffect(() => {
    const f = form.current;
    if (!f) return;
    let alive = true;
    const start = readForm(f);
    void loadDraft<FormValues>(key).then((d) => {
      if (!alive) return;
      if (d && JSON.stringify(d.data) !== JSON.stringify(start)) {
        writeForm(f, d.data);
        setRestored(d.at);
      }
      const now = readForm(f);
      adopt(now, d?.at);
      setValues(now);
    });
    const onInput = () => setValues(readForm(f));
    const onSubmit = () => {
      if (navigator.onLine) {
        clear();
        setRestored(null);
      }
    };
    f.addEventListener("input", onInput);
    f.addEventListener("change", onInput);
    f.addEventListener("submit", onSubmit);
    return () => {
      alive = false;
      f.removeEventListener("input", onInput);
      f.removeEventListener("change", onInput);
      f.removeEventListener("submit", onSubmit);
    };
  }, [form, key, adopt, clear]);

  /** "Ricomincia da capo": il modulo torna com'era e la bozza sparisce. */
  const discard = () => {
    clear();
    const f = form.current;
    if (f) {
      f.reset();
      const now = readForm(f);
      adopt(now);
      setValues(now);
    }
    setRestored(null);
  };

  return { status: draft.status, restored, discard };
}
