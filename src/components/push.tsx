"use client";

/**
 * Notifiche push: attivazione, stato e invito ad attivarle.
 * Il server le manda (src/lib/push.ts), il service worker le mostra (public/sw.js).
 */
import { useEffect, useState } from "react";
import { getPushKey, removePushSubscription, savePushSubscription, sendTestPush } from "@/app/push/actions";
import { isInstalled, platform, pushSupport, readLocal, writeLocal } from "@/lib/device";
import { openInstallGuide } from "./install-guide";
import { Button, Card, Eyebrow } from "./ui";
import { IconBell, IconX } from "./icons";

type State = "loading" | "on" | "off" | "denied" | "needs-install" | "unsupported";

function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array) {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

async function registration() {
  await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  return navigator.serviceWorker.ready;
}

async function readState(): Promise<State> {
  const support = pushSupport();
  if (support !== "ok") return support;
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  try {
    const reg = await registration();
    return (await reg.pushManager.getSubscription()) ? "on" : "off";
  } catch {
    return "off";
  }
}

/** Chiede il permesso e iscrive questo dispositivo. Va chiamata da un tocco. */
export async function enablePush(): Promise<State | "error"> {
  const support = pushSupport();
  if (support !== "ok") return support;
  // su iPhone il permesso va chiesto subito, dentro il tocco
  const perm = await Notification.requestPermission();
  if (perm === "denied") return "denied";
  if (perm !== "granted") return "off";
  try {
    const [reg, key] = await Promise.all([registration(), getPushKey()]);
    if (!key) return "error";
    const bytes = keyBytes(key);
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub.options.applicationServerKey, bytes)) {
      await sub.unsubscribe();
      sub = null;
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
    const res = await savePushSubscription(sub.toJSON(), navigator.userAgent);
    return res.ok ? "on" : "error";
  } catch {
    return "error";
  }
}

async function disablePush() {
  try {
    const reg = await registration();
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await removePushSubscription(sub.endpoint);
      await sub.unsubscribe();
    }
  } catch {
    // al massimo resta attiva: si può togliere dalle impostazioni del telefono
  }
}

/**
 * All'apertura dell'app: se le notifiche sono già attive su questo dispositivo
 * le ricollega alla persona entrata (utile se sul telefono si cambia account).
 */
export function PushSync() {
  useEffect(() => {
    if (pushSupport() !== "ok" || Notification.permission !== "granted") return;
    void (async () => {
      try {
        const reg = await registration();
        const sub = await reg.pushManager.getSubscription();
        if (sub) await savePushSubscription(sub.toJSON(), navigator.userAgent);
      } catch {
        // niente
      }
    })();
  }, []);
  return null;
}

function usePushState(): [State, (s: State) => void] {
  const [state, setState] = useState<State>("loading");
  useEffect(() => {
    let alive = true;
    void readState().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, []);
  return [state, setState];
}

const ERROR_TEXT = "Non sono riuscito ad attivarle. Controlla la connessione e riprova.";

/** Riquadro nelle pagine Notifiche: stato su questo dispositivo, attiva/disattiva, prova. */
export function PushSettings() {
  const [state, setState] = usePushState();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const ios = typeof window !== "undefined" && platform() === "ios";

  const turnOn = async () => {
    setBusy(true);
    setNote("");
    const r = await enablePush();
    setBusy(false);
    if (r === "error") setNote(ERROR_TEXT);
    else setState(r);
    if (r === "on") setNote("Fatto: ti ho mandato una notifica di prova.");
    if (r === "on") void sendTestPush();
  };
  const turnOff = async () => {
    setBusy(true);
    await disablePush();
    setBusy(false);
    setState("off");
    setNote("");
  };
  const test = async () => {
    setBusy(true);
    const r = await sendTestPush();
    setBusy(false);
    setNote(r.ok ? "Inviata: dovrebbe arrivarti tra qualche secondo." : "Non sono riuscito a inviarla. Prova a disattivare e riattivare le notifiche.");
  };

  if (state === "loading") return null;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sand-deep/70"><IconBell size={18} /></span>
        <div className="min-w-0">
          <Eyebrow>Notifiche su questo dispositivo</Eyebrow>
          <p className="mt-1 text-[15px] leading-snug" data-testid="push-state">
            {state === "on" && "Attive: gli avvisi arrivano anche ad app chiusa."}
            {state === "off" && "Spente: messaggi, programma nuovo e risposte al diario li vedi solo quando apri l'app."}
            {state === "denied" && (ios ? "Bloccate. Per riattivarle: Impostazioni del telefono → Notifiche → l'app → Consenti notifiche." : "Bloccate. Per riattivarle tocca il lucchetto o i tre puntini accanto all'indirizzo → Notifiche → Consenti.")}
            {state === "needs-install" && "Su iPhone le notifiche arrivano solo se metti l'app sulla schermata Home e la apri da lì."}
            {state === "unsupported" && "Questo browser non riceve notifiche. Sul telefono apri l'app dalla schermata Home."}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {state === "off" ? <Button onClick={turnOn} disabled={busy}>{busy ? "Attivo…" : "Attiva le notifiche"}</Button> : null}
        {state === "on" ? (
          <>
            <Button variant="secondary" size="sm" onClick={test} disabled={busy}>Manda una prova</Button>
            <Button variant="ghost" size="sm" onClick={turnOff} disabled={busy}>Disattiva qui</Button>
          </>
        ) : null}
        {state === "needs-install" || (state === "unsupported" && !isInstalled() && platform() !== "other") ? (
          <Button onClick={() => openInstallGuide()}>Metti l&apos;app sulla Home</Button>
        ) : null}
      </div>
      {note ? <p role="status" className="text-sm text-muted">{note}</p> : null}
    </Card>
  );
}

const PROMPT_KEY = "otherise:push-prompt";

/** Invito ad attivare le notifiche (in Oggi), finché non si sceglie. */
export function PushPrompt({ text }: { text: string }) {
  const [state, setState] = usePushState();
  const [hidden, setHidden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    // rimandato di una settimana con "Più tardi"; dall'app sulla Home (e su
    // Android) c'è già la finestra a comparsa: niente doppione qui
    const until = Number(readLocal(PROMPT_KEY) ?? 0);
    const popupThere = isInstalled() || platform() === "android";
    const t = setTimeout(() => setHidden(Date.now() < until || popupThere), 0);
    return () => clearTimeout(t);
  }, []);
  const later = () => {
    writeLocal(PROMPT_KEY, String(Date.now() + 7 * 24 * 3600 * 1000));
    setHidden(true);
  };
  if (hidden) return null;
  if (state === "needs-install") {
    // iPhone dal browser: le notifiche arrivano solo con l'app sulla Home
    return (
      <Card className="flex flex-col gap-3" data-testid="push-prompt">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white"><IconBell size={18} /></span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Vuoi le notifiche?</div>
            <p className="text-sm text-muted">Sull&apos;iPhone arrivano solo con l&apos;app sulla schermata Home: ci vuole un minuto.</p>
          </div>
          <button type="button" aria-label="Più tardi" onClick={later} className="-mt-1 -mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:text-ink"><IconX size={18} /></button>
        </div>
        <div><Button onClick={() => openInstallGuide()}>Metti l&apos;app sulla Home</Button></div>
      </Card>
    );
  }
  if (state !== "off") return null;
  const turnOn = async () => {
    setBusy(true);
    const r = await enablePush();
    setBusy(false);
    if (r === "error") return setError(true);
    setState(r);
    if (r === "on") void sendTestPush();
  };
  return (
    <Card className="flex flex-col gap-3" data-testid="push-prompt">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white"><IconBell size={18} /></span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Attiva le notifiche</div>
          <p className="text-sm text-muted">{text}</p>
        </div>
        <button type="button" aria-label="Più tardi" onClick={later} className="-mt-1 -mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:text-ink"><IconX size={18} /></button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={turnOn} disabled={busy}>{busy ? "Attivo…" : "Attiva"}</Button>
        <Button variant="ghost" onClick={later}>Più tardi</Button>
      </div>
      {error ? <p role="status" className="text-sm text-accent-deep">{ERROR_TEXT}</p> : null}
    </Card>
  );
}

const POPUP_KEY = "otherise:push-popup";

/**
 * Finestra "Attiva le notifiche" alla prima apertura dell'app dalla schermata
 * Home (su Android anche dal browser). Con le notifiche attive non arrivano
 * più email. "Più tardi" la rimanda di 3 giorni. Aspetta che altre finestre
 * (guida, frase del giorno) siano chiuse.
 */
export function PushPopup({ text }: { text: string }) {
  const [state, setState] = usePushState();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (state !== "off") return;
    if (!(isInstalled() || platform() === "android")) return;
    if (Date.now() < Number(readLocal(POPUP_KEY) ?? 0)) return;
    const id = setInterval(() => {
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      clearInterval(id);
      setOpen(true);
    }, 1500);
    return () => clearInterval(id);
  }, [state]);
  if (!open || state !== "off") return null;
  const later = () => {
    writeLocal(POPUP_KEY, String(Date.now() + 3 * 24 * 3600 * 1000));
    setOpen(false);
  };
  const turnOn = async () => {
    setBusy(true);
    setError(false);
    const r = await enablePush();
    setBusy(false);
    if (r === "error") return setError(true);
    setState(r);
    if (r === "on") {
      setOpen(false);
      void sendTestPush();
    } else if (r === "denied") {
      writeLocal(POPUP_KEY, String(Date.now() + 30 * 24 * 3600 * 1000));
    }
  };
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Attiva le notifiche">
      <div className="w-full max-w-md rounded-t-[28px] bg-sand px-5 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:rounded-[28px]">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white"><IconBell size={22} /></span>
        <h2 className="mt-4 text-[24px] leading-tight font-semibold">Attiva le notifiche</h2>
        <p className="mt-2 text-[16px] leading-relaxed">{text}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">È importante: è così che ti arrivano messaggi, programmi e promemoria. Con le notifiche attive non ricevi email.</p>
        {state === "off" && platform() === "ios" ? <p className="mt-2 text-sm text-muted">Il telefono ti chiede il permesso: tocca &quot;Consenti&quot;.</p> : null}
        {error ? <p role="status" className="mt-2 text-sm text-accent-deep">{ERROR_TEXT}</p> : null}
        <div className="mt-5 flex flex-col gap-2">
          <button type="button" onClick={turnOn} disabled={busy} className="min-h-12 w-full rounded-full bg-ink text-[16px] font-semibold text-card disabled:opacity-60">{busy ? "Attivo…" : "Attiva le notifiche"}</button>
          <button type="button" onClick={later} className="min-h-11 text-sm font-semibold text-muted underline">Più tardi</button>
        </div>
      </div>
    </div>
  );
}
