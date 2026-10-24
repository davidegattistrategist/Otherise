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
import { diffDraft, mergeDraft, sameDraft } from "@/lib/draft-merge";

export type DraftState = { state: "idle" | "saving" | "saved" | "local"; at: number | null };

const LOCAL = "otherise:draft:";
const SERVER_DELAY = 700;
/** modalità check: quello che scrivi arriva subito sull'altro dispositivo */
const LIVE_DELAY = 250;
const LIVE_POLL_MS = 1500;

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

/** Bozza cancellata sul server (con l'ora della cancellazione). */
type Gone = { deleted: number };
const isGone = (v: unknown): v is Gone => typeof v === "object" && v !== null && "deleted" in v;

/**
 * La bozza sul server; con `since` solo se è più nuova (altrimenti "same").
 * "failed" = non si è riusciti a leggere (rete, errore): diverso da "non c'è".
 */
async function readServer<T>(key: string, since = 0): Promise<Stored<T> | Gone | null | "same" | "failed"> {
  try {
    const r = await fetch(`/api/bozze?key=${encodeURIComponent(key)}${since ? `&since=${since}` : ""}`, { cache: "no-store" });
    if (r.status === 204) return "same";
    if (!r.ok) return "failed";
    const d = (await r.json()) as { data: T; updated_at: string } | Gone | null;
    if (!d) return null;
    if (isGone(d)) return d;
    return { data: d.data, at: new Date(d.updated_at).getTime() };
  } catch {
    return "failed";
  }
}

/**
 * La bozza più recente tra telefono e server (null se non ce n'è). Se sul
 * server la bozza è stata cancellata (salvata davvero, o annullata, anche
 * dall'altro dispositivo) la copia del telefono va via: non deve tornare nel
 * modulo settimane dopo.
 */
export async function loadDraft<T>(key: string): Promise<Stored<T> | null> {
  const local = readLocal<T>(key);
  const s = await readServer<T>(key);
  if (isGone(s)) {
    removeLocal(key);
    return null;
  }
  const server = s === "same" || s === "failed" ? null : s;
  if (!local) return server;
  if (!server) return local;
  return local.at > server.at ? local : server;
}

/** Cancella la bozza (dopo il salvataggio vero). */
export function clearDraft(key: string) {
  removeLocal(key);
  void fetch(`/api/bozze?key=${encodeURIComponent(key)}&t=${Date.now()}`, { method: "DELETE", keepalive: true }).catch(() => undefined);
}

/**
 * Tiene salvata la bozza di `value` sotto `key`. Con `live` (modalità check,
 * due dispositivi sullo stesso modulo) manda solo i campi cambiati, controlla
 * ogni secondo e mezzo se l'altro dispositivo ha scritto qualcosa e lo unisce
 * a quello che c'è qui (`onRemote` riceve il modulo unito): non si perde
 * niente nemmeno se si scrive su tutti e due insieme.
 */
export function useDraft<T>(
  key: string | null,
  value: T,
  opts: { enabled?: boolean; live?: boolean; onRemote?: (data: T) => void; isEmpty?: (v: T) => boolean } = {},
) {
  const { enabled = true, live = false } = opts;
  const [status, setStatus] = useState<DraftState>({ state: "idle", at: null });
  const lastJson = useRef<string | null>(null);
  const valueRef = useRef(value);
  /** l'ultima versione uguale qui e sul server (base per unire le modifiche) */
  const synced = useRef<unknown>(null);
  const serverAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  /** quando è stato scritto quello che sta per partire (per non far tornare una bozza cancellata dopo) */
  const pendingAt = useRef(0);
  const sending = useRef(false);
  const again = useRef(false);
  const cleared = useRef(false);
  /** svuotato mentre una bozza stava partendo: appena arriva, si cancella di nuovo */
  const wantClear = useRef<string | null>(null);
  const onRemote = useRef(opts.onRemote);
  const isEmpty = useRef(opts.isEmpty);
  const liveRef = useRef(live);
  useEffect(() => {
    onRemote.current = opts.onRemote;
    isEmpty.current = opts.isEmpty;
    liveRef.current = live;
    valueRef.current = value;
  });

  /** quello che è arrivato (dal server o dall'altro dispositivo) diventa il modulo, con le modifiche fatte qui nel frattempo */
  const takeRemote = useCallback((base: unknown, remote: T): boolean => {
    const local = valueRef.current;
    const merged = mergeDraft(base, local, remote);
    synced.current = remote;
    if (!sameDraft(merged, local)) {
      lastJson.current = JSON.stringify(merged);
      valueRef.current = merged;
      onRemote.current?.(merged);
    }
    return !sameDraft(merged, remote);
  }, []);

  const send = useCallback(
    async (k: string) => {
      if (sending.current) {
        again.current = true;
        return;
      }
      if (!pending.current || cleared.current) return;
      sending.current = true;
      const body = pending.current;
      const sent = JSON.parse(body) as T;
      const isLive = liveRef.current;
      const t = pendingAt.current || Date.now();
      try {
        const payload = isLive
          ? JSON.stringify({ key: k, data: sent, patch: diffDraft(synced.current ?? {}, sent), t })
          : `{"key":${JSON.stringify(k)},"t":${t},"data":${body}}`;
        const r = await fetch("/api/bozze", { method: "POST", body: payload, keepalive: payload.length < 60_000 });
        if (!r.ok) throw new Error();
        const d = (await r.json()) as { updated_at: string; data?: T; ignored?: boolean };
        serverAt.current = Math.max(serverAt.current, new Date(d.updated_at).getTime());
        if (pending.current === body) pending.current = null;
        if (d.ignored) {
          // il server l'ha scartata (bozza cancellata nel frattempo): niente "Salvato"
          setStatus({ state: "idle", at: null });
          return;
        }
        if (isLive && d.data !== undefined && !cleared.current) {
          // il server ha unito anche le modifiche dell'altro dispositivo
          if (takeRemote(sent, d.data)) {
            pending.current = JSON.stringify(valueRef.current);
            // stessa ora dell'ultima modifica scritta qui: se nel frattempo la bozza è stata
            // cancellata ("Annulla il check", check salvato), questo rinvio non la fa tornare
            pendingAt.current = Math.max(pendingAt.current, t);
            again.current = true;
          }
        } else synced.current = sent;
        setStatus({ state: "saved", at: Date.now() });
      } catch {
        setStatus({ state: "local", at: Date.now() });
      } finally {
        sending.current = false;
        if (wantClear.current) {
          clearDraft(wantClear.current);
          wantClear.current = null;
        }
        if (again.current) {
          again.current = false;
          if (pending.current) void sendAgain.current(k);
        }
      }
    },
    [takeRemote],
  );
  const sendAgain = useRef<(k: string) => Promise<void>>(async () => undefined);
  useEffect(() => {
    sendAgain.current = send;
  }, [send]);

  // la prima volta il valore di partenza non è una modifica
  useEffect(() => {
    if (lastJson.current === null) {
      lastJson.current = JSON.stringify(value);
      synced.current = value;
    }
  }, [value]);

  useEffect(() => {
    if (!key || !enabled) return;
    const json = JSON.stringify(value);
    if (lastJson.current === null || json === lastJson.current) return;
    lastJson.current = json;
    cleared.current = false;
    wantClear.current = null;
    if (isEmpty.current?.(value)) {
      // modulo svuotato (o messaggio inviato): niente bozza
      pending.current = null;
      if (timer.current) clearTimeout(timer.current);
      clearDraft(key);
      if (sending.current) wantClear.current = key;
      setStatus({ state: "idle", at: null });
      return;
    }
    writeLocal(key, value);
    pending.current = json;
    pendingAt.current = Date.now();
    setStatus((s) => (s.state === "local" ? s : { state: "saving", at: s.at }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void send(key), live ? LIVE_DELAY : SERVER_DELAY);
  }, [key, value, enabled, live, send]);

  // uscita dalla pagina o app in secondo piano: la bozza parte subito
  useEffect(() => {
    if (!key) return;
    const flush = () => {
      if (!pending.current || cleared.current) return;
      const data = JSON.parse(pending.current) as T;
      const t = pendingAt.current || Date.now();
      const body = liveRef.current
        ? JSON.stringify({ key, data, patch: diffDraft(synced.current ?? {}, data), t })
        : `{"key":${JSON.stringify(key)},"t":${t},"data":${pending.current}}`;
      if (navigator.sendBeacon?.("/api/bozze", new Blob([body], { type: "text/plain" }))) {
        pending.current = null;
        // da qui in poi quello che è partito è la base per unire con l'altro dispositivo
        if (liveRef.current) synced.current = data;
      }
    };
    const onHidden = () => document.visibilityState === "hidden" && flush();
    const onOnline = () => pending.current && !cleared.current && void send(key);
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

  // dall'altro dispositivo (modalità check): le novità arrivano da sole e si uniscono
  useEffect(() => {
    if (!key || !live) return;
    let busy = false;
    const poll = async () => {
      if (busy || sending.current || cleared.current || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const s = await readServer<T>(key, serverAt.current);
        if (!s || s === "same" || s === "failed" || isGone(s) || s.at <= serverAt.current || sending.current || cleared.current) return;
        serverAt.current = s.at;
        writeLocal(key, s.data);
        if (takeRemote(synced.current, s.data)) {
          // qui c'era qualcosa di non ancora mandato: parte unito
          pending.current = JSON.stringify(valueRef.current);
          pendingAt.current = pendingAt.current || Date.now();
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void send(key), LIVE_DELAY);
        } else if (pending.current && sameDraft(JSON.parse(pending.current), s.data)) pending.current = null;
      } finally {
        busy = false;
      }
    };
    const t = setInterval(poll, LIVE_POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key, live, send, takeRemote]);

  const clear = useCallback(() => {
    if (!key) return;
    cleared.current = true;
    pending.current = null;
    if (timer.current) clearTimeout(timer.current);
    clearDraft(key);
    if (sending.current) wantClear.current = key;
    setStatus({ state: "idle", at: null });
  }, [key]);

  /**
   * Dopo `clear` fatto in anticipo (es. la bozza del messaggio si cancella appena
   * tocchi Invia, così chiudendo l'app subito dopo non torna): se poi l'invio non
   * riesce, il testo che è ancora nella casella torna a essere salvato come bozza.
   */
  const keep = useCallback(() => {
    if (!key) return;
    cleared.current = false;
    wantClear.current = null;
    const v = valueRef.current;
    if (isEmpty.current?.(v)) return;
    const json = JSON.stringify(v);
    lastJson.current = json;
    writeLocal(key, v);
    pending.current = json;
    pendingAt.current = Date.now();
    setStatus((s) => (s.state === "local" ? s : { state: "saving", at: s.at }));
    void send(key);
  }, [key, send]);

  /** dopo aver ripreso una bozza: quel valore è il nuovo punto di partenza */
  const adopt = useCallback((v: T, at?: number) => {
    lastJson.current = JSON.stringify(v);
    valueRef.current = v;
    synced.current = v;
    if (at) serverAt.current = Math.max(serverAt.current, at);
  }, []);

  /**
   * Prima di salvare per davvero (modalità check): manda subito quello che c'è
   * qui e prende quello che ha scritto l'altro dispositivo, unito. Così "Check
   * finito" su un telefono appena ripreso in mano non salva una versione
   * vecchia. Torna true se il modulo qui è cambiato (va ridisegnato).
   */
  const syncNow = useCallback(async (): Promise<"changed" | "same" | "failed" | "gone"> => {
    if (!key || cleared.current) return "same";
    if (timer.current) clearTimeout(timer.current);
    // aspetta un invio in corso (massimo 5 secondi)
    for (let i = 0; i < 50 && sending.current; i++) await new Promise((r) => setTimeout(r, 100));
    if (pending.current) await send(key);
    const before = JSON.stringify(valueRef.current);
    const s = await readServer<T>(key, 0);
    // non si è letto l'altro dispositivo: meglio fermarsi che salvare una versione vecchia
    if (s === "failed") return "failed";
    // la bozza è stata chiusa (salvata o annullata) dall'altro dispositivo
    if (isGone(s)) return "gone";
    if (s && s !== "same" && !cleared.current) {
      serverAt.current = Math.max(serverAt.current, s.at);
      writeLocal(key, s.data);
      if (takeRemote(synced.current, s.data)) {
        pending.current = JSON.stringify(valueRef.current);
        pendingAt.current = pendingAt.current || Date.now();
        await send(key);
      }
    }
    return JSON.stringify(valueRef.current) !== before ? "changed" : "same";
  }, [key, send, takeRemote]);

  return { status, clear, keep, adopt, syncNow };
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

export type FormValues = Record<string, string | boolean | string[]>;
/** Bozza di un modulo: i valori e com'era il modulo quando è stato aperto. */
export type FormDraftData = { data: FormValues; base: FormValues | null };
const isFormDraftData = (v: unknown): v is FormDraftData =>
  typeof v === "object" && v !== null && "data" in v && "base" in v && typeof (v as FormDraftData).data === "object";

/** Valori di un modulo (testi, scelte, spunte; non i file né i campi nascosti). */
export function readForm(form: HTMLFormElement): FormValues {
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

/** I valori con cui il modulo è arrivato dal server (prima di qualsiasi lettera). */
export function readFormDefaults(form: HTMLFormElement): FormValues {
  const out: FormValues = {};
  for (const el of Array.from(form.elements) as Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    if (!el.name || el.disabled || el.dataset.noDraft !== undefined) continue;
    const type = (el as HTMLInputElement).type;
    if (type === "file" || type === "hidden" || type === "submit" || type === "button" || type === "password") continue;
    if (type === "checkbox") out[el.name] = (el as HTMLInputElement).defaultChecked;
    else if (type === "radio") {
      if ((el as HTMLInputElement).defaultChecked) out[el.name] = el.value;
    } else if (el instanceof HTMLSelectElement) {
      const opt = Array.from(el.options).find((o) => o.defaultSelected) ?? el.options[0];
      out[el.name] = opt ? opt.value : "";
    } else out[el.name] = (el as HTMLInputElement | HTMLTextAreaElement).defaultValue;
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
  const [values, setValues] = useState<FormDraftData | null>(null);
  const [restored, setRestored] = useState<number | null>(null);
  const draft = useDraft(key, values, { enabled: values !== null });
  const { adopt, clear } = draft;

  useEffect(() => {
    const f = form.current;
    if (!f) return;
    let alive = true;
    // com'è arrivato dal server: la bozza ricorda da dove si partiva (`base`), così alla
    // ripresa si applicano solo i campi che avevi cambiato TU e che il server non ha
    // cambiato nel frattempo. Prima tornava tutto il modulo di allora, anche i campi
    // mai toccati, sopra valori più nuovi (23/10: lezioni dell'AI svuotate).
    const base = readFormDefaults(f);
    const start = readForm(f);
    void loadDraft<FormDraftData | FormValues>(key).then((d) => {
      if (!alive) return;
      if (d) {
        const stored = isFormDraftData(d.data) ? d.data : { data: d.data as FormValues, base: null };
        const typed = readForm(f);
        const keep: FormValues = {};
        for (const [k, v] of Object.entries(stored.data)) {
          if (!(k in start)) continue;
          // intanto hai già scritto qui: quello che hai scritto vale di più
          if (typed[k] !== start[k]) continue;
          if (stored.base) {
            // non era cambiato nella bozza, o il server l'ha cambiato dopo: resta com'è
            if (stored.base[k] === v || stored.base[k] !== start[k]) continue;
          } else {
            // bozza di prima di questa regola: solo un testo scritto in un campo vuoto
            const now = start[k];
            if (typeof v !== "string" || !v.trim() || (typeof now === "string" && now.trim()) || typeof now !== "string") continue;
          }
          if (v !== start[k]) keep[k] = v;
        }
        if (Object.keys(keep).length) {
          writeForm(f, keep);
          setRestored(d.at);
        } else if (!sameDraft(stored.data, readForm(f))) {
          // niente da riprendere: la bozza è vecchia o uguale, via
          clear();
        }
      }
      const now = readForm(f);
      adopt({ data: now, base }, d?.at);
      setValues({ data: now, base });
    });
    const onInput = () => setValues({ data: readForm(f), base });
    f.addEventListener("input", onInput);
    f.addEventListener("change", onInput);
    // all'invio la bozza NON si cancella: resta finché il salvataggio non è riuscito
    // davvero (markSaved), così un errore del server o della rete non perde il testo
    return () => {
      alive = false;
      f.removeEventListener("input", onInput);
      f.removeEventListener("change", onInput);
    };
  }, [form, key, adopt, clear]);

  /** "Annulla le modifiche": il modulo torna com'era e la bozza sparisce. */
  const discard = () => {
    clear();
    const f = form.current;
    if (f) {
      f.reset();
      const now = readForm(f);
      adopt({ data: now, base: readFormDefaults(f) });
      setValues({ data: now, base: readFormDefaults(f) });
    }
    setRestored(null);
  };

  /** Salvato davvero (salvataggio automatico sul server, o azione riuscita): la bozza non serve più. */
  const markSaved = useCallback(() => {
    clear();
    setRestored(null);
  }, [clear]);

  /** Dopo un errore dell'azione (React 19 svuota il modulo): rimette quello che avevi scritto. */
  const restoreTyped = () => {
    const f = form.current;
    const v = values?.data;
    if (f && v) writeForm(f, v);
  };

  return { status: draft.status, restored, discard, markSaved, restoreTyped };
}
