"use client";

/**
 * Moduli che si salvano da soli sul server mentre scrivi (lettera per lettera,
 * con una piccola pausa), senza pulsante "Salva". Regola dell'app: quello che
 * scrivi è salvato davvero, non solo in bozza. La bozza resta come rete di
 * sicurezza (rete che salta, app chiusa a metà) e sparisce appena il server
 * ha salvato.
 *
 * L'azione del server riceve `__live=1`: le azioni che di solito portano a
 * un'altra pagina dopo il salvataggio lì non lo fanno.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { readForm, readFormDefaults, useFormDraft } from "./use-draft";
import type { ActionState } from "./form-bits";
import { cx } from "./ui";

export type LiveAction = (state: ActionState, fd: FormData) => Promise<ActionState>;
type Status = { kind: "idle" | "waiting" | "saving" | "saved" | "error" | "offline"; at?: number; error?: string };

/** Pausa dopo l'ultima lettera prima di salvare. */
const TYPE_DELAY = 800;
const CHANGE_DELAY = 150;

const hm = (at?: number) => (at ? new Date(at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "");

export function LiveForm({
  action,
  name,
  className,
  children,
  hint = "Si salva da solo mentre scrivi.",
  onSaved,
}: {
  action: LiveAction;
  /** nome della bozza (unico nella pagina) */
  name: string;
  className?: string;
  children: ReactNode;
  hint?: string;
  onSaved?: () => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  const draft = useFormDraft(form, name);
  const { markSaved } = draft;
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [notice, setNotice] = useState<string | null>(null);
  const saved = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);
  const again = useRef(false);
  const actionRef = useRef(action);
  const restoredRef = useRef(draft.restored);
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    actionRef.current = action;
    onSavedRef.current = onSaved;
    restoredRef.current = draft.restored;
  });

  const run = useCallback(async (el?: HTMLFormElement) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    // all'uscita dalla pagina il modulo non è più collegato: si usa quello passato
    const target = () => form.current ?? el ?? null;
    if (!target()) return;
    if (running.current) {
      // un salvataggio è già in corso: appena finisce ne parte un altro con le ultime lettere
      again.current = true;
      return;
    }
    running.current = true;
    try {
      do {
        again.current = false;
        const f = target();
        if (!f) return;
        const snap = JSON.stringify(readForm(f));
        if (snap === saved.current) {
          // niente di nuovo: quello che vedi è già salvato (anche un'eventuale bozza ripresa uguale)
          setStatus((s) => (s.kind === "waiting" || s.kind === "error" ? { kind: "saved", at: s.at } : s));
          if (restoredRef.current) markSaved();
          continue;
        }
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          setStatus({ kind: "offline" });
          return;
        }
        setStatus((s) => ({ kind: "saving", at: s.at }));
        const fd = new FormData(f);
        fd.set("__live", "1");
        let r: ActionState = null;
        try {
          r = await actionRef.current(null, fd);
        } catch {
          r = { error: "Non sono riuscito a salvare: controlla la connessione. Quello che hai scritto resta qui e riprovo appena scrivi." };
        }
        if (r?.error) {
          setStatus({ kind: "error", error: r.error });
          continue;
        }
        saved.current = snap;
        setStatus({ kind: "saved", at: Date.now() });
        if (r?.notice) setNotice(r.notice);
        // la bozza non serve più (se nel frattempo non hai scritto altro)
        const now = target();
        if (now && JSON.stringify(readForm(now)) === snap) markSaved();
        onSavedRef.current?.();
      } while (again.current);
    } finally {
      running.current = false;
    }
  }, [markSaved]);

  const schedule = useCallback(
    (delay: number) => {
      if (timer.current) clearTimeout(timer.current);
      setStatus((s) => (s.kind === "saving" ? s : { kind: "waiting", at: s.at }));
      const el = form.current ?? undefined;
      timer.current = setTimeout(() => void run(el), delay);
    },
    [run],
  );

  useEffect(() => {
    const f = form.current;
    if (!f) return;
    // salvato = come è arrivato dal server; se hai già scritto qualcosa mentre la pagina
    // si caricava (telefono lento), si salva subito
    saved.current = JSON.stringify(readFormDefaults(f));
    if (JSON.stringify(readForm(f)) !== saved.current) schedule(TYPE_DELAY);
    const onInput = (e: Event) => {
      const el = e.target as HTMLElement | null;
      // per esempio l'email: si salva quando esci dalla casella, non a metà parola
      if (el?.dataset?.saveOnBlur !== undefined) return;
      const type = (el as HTMLInputElement | null)?.type;
      schedule(type === "checkbox" || type === "radio" || el?.tagName === "SELECT" ? CHANGE_DELAY : TYPE_DELAY);
    };
    const onChange = () => schedule(CHANGE_DELAY);
    const onSubmit = (e: Event) => {
      e.preventDefault();
      void run(f);
    };
    const now = () => void run(f);
    const onHidden = () => document.visibilityState === "hidden" && void run(f);
    // tocco su un link mentre un salvataggio è in attesa: parte prima della nuova pagina
    // (partito dopo, durante il cambio di pagina, può andare perso)
    const onLink = (e: MouseEvent) => {
      if (!timer.current) return;
      if ((e.target as Element | null)?.closest?.("a[href]")) void run(f);
    };
    document.addEventListener("click", onLink, true);
    f.addEventListener("input", onInput);
    f.addEventListener("change", onChange);
    f.addEventListener("submit", onSubmit);
    window.addEventListener("pagehide", now);
    window.addEventListener("online", now);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      document.removeEventListener("click", onLink, true);
      f.removeEventListener("input", onInput);
      f.removeEventListener("change", onChange);
      f.removeEventListener("submit", onSubmit);
      window.removeEventListener("pagehide", now);
      window.removeEventListener("online", now);
      document.removeEventListener("visibilitychange", onHidden);
      // si esce dalla pagina con un salvataggio in attesa: parte subito
      if (timer.current) void run(f);
    };
  }, [run, schedule]);

  // bozza ripresa di poco fa (per esempio uscito dalla pagina mentre salvava): si salva da sola;
  // una più vecchia la fai confermare tu (nel frattempo la scheda può essere cambiata)
  const restoredAt = draft.restored;
  useEffect(() => {
    if (!restoredAt) return;
    const fresh = restoredAt > Date.now() - 30 * 60_000;
    if (!fresh) return;
    const t = setTimeout(() => void run(), 50);
    return () => clearTimeout(t);
  }, [restoredAt, run]);

  const text =
    status.kind === "waiting" || status.kind === "saving"
      ? "Salvo…"
      : status.kind === "saved"
        ? `Salvato${status.at ? ` alle ${hm(status.at)}` : ""}`
        : status.kind === "offline"
          ? "Senza rete: è al sicuro su questo dispositivo, lo salvo appena torna la connessione"
          : status.kind === "error"
            ? `Non salvato: ${status.error}`
            : hint;

  return (
    <form ref={form} className={className} noValidate data-live-form={name}>
      {draft.restored ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-accent-soft px-4 py-3 text-[15px] leading-relaxed" role="status" data-draft-top>
          <p>
            <strong>Modifiche non salvate.</strong> Qui sotto c&apos;è quello che avevi scritto il{" "}
            {new Date(draft.restored).toLocaleString("it-IT", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} e che non era stato salvato.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void run()} className="min-h-10 rounded-full bg-ink px-4 text-sm font-semibold text-card" data-draft-apply>
              Salva queste modifiche
            </button>
            <button type="button" onClick={draft.discard} className="min-h-10 rounded-full px-4 text-sm font-semibold ring-1 ring-ink/30" data-draft-discard>
              Annulla le modifiche
            </button>
          </div>
        </div>
      ) : null}
      {children}
      {notice ? (
        <p className="rounded-2xl bg-accent-soft px-4 py-3 text-[15px] leading-relaxed" role="status" data-live-notice>
          {notice}
        </p>
      ) : null}
      <p
        className={cx("text-sm", status.kind === "error" ? "font-semibold text-accent-deep" : status.kind === "offline" ? "text-accent-deep" : "text-muted")}
        role={status.kind === "error" ? "alert" : undefined}
        aria-live="polite"
        data-live-status={status.kind}
      >
        {text}
      </p>
    </form>
  );
}
