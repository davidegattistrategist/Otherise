"use client";

/**
 * Guida "Metti l'app sulla Home": al primo accesso dal telefono chiede se è
 * un iPhone o un Android e mostra tutti i passi in un solo elenco. Con
 * "Ho capito, inizio" la guida si chiude e in alto resta un promemoria con i
 * passi in breve, così chi la segue non perde le istruzioni mentre tocca i
 * menu del browser. Su Android, se il browser lo permette, basta un tocco su
 * "Installa". Non compare se l'app è già aperta dalla Home o se la guida è già
 * stata fatta su questo telefono (se si inizia e non si finisce, ricompare
 * dopo un'ora). Si riapre con openInstallGuide().
 */
import { useCallback, useEffect, useState } from "react";
import { isInstalled, platform, readLocal, writeLocal, type Platform } from "@/lib/device";
import { INSTALL_READY } from "./service-worker";
import { cx } from "./ui";
import { IconArrowLeft, IconCheck, IconPlus, IconX } from "./icons";

const DONE_KEY = "otherise:install-guide";
const OPEN_EVENT = "otherise:open-install-guide";

export function openInstallGuide() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

type Phone = "ios" | "android";
type Step = { title: string; short: string; text: React.ReactNode; picture: React.ReactNode };

const ShareIcon = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#2f6fde" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12" /><path d="m7.5 7.5 4.5-4.5 4.5 4.5" /><path d="M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H16" />
  </svg>
);
const Dots = ({ vertical }: { vertical?: boolean }) => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    {vertical ? (<><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></>) : (<><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></>)}
  </svg>
);

/** Riquadro che imita il pulsante o la voce di menu da toccare. */
function Mock({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sand/70 text-ink">{children}</span>
      {label ? <span className="text-[16px] font-semibold">{label}</span> : null}
    </div>
  );
}

function stepsFor(phone: Phone, appName: string): Step[] {
  const open: Step = {
    title: "Apri l'app dalla Home",
    short: "Esci dal browser e apri l'app dall'icona",
    text: (
      <>Esci dal browser e cerca l&apos;icona <b>{appName}</b> sulla schermata Home: da ora apri l&apos;app sempre da lì. Se ti chiede di entrare, usa la tua email e la password che hai scelto.</>
    ),
    picture: (
      <div className="flex flex-col items-center gap-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" width={64} height={64} className="rounded-[16px] shadow-md" />
        <span className="text-xs font-semibold">{appName}</span>
      </div>
    ),
  };
  if (phone === "ios") {
    return [
      {
        title: "Tocca il pulsante Condividi",
        short: "Tocca Condividi (quadrato con la freccia, in basso)",
        text: (
          <>È il quadrato con la freccia verso l&apos;alto, in basso al centro dello schermo. Non lo vedi? Tocca prima i tre puntini <b>···</b> in basso a destra.</>
        ),
        picture: <Mock><ShareIcon /></Mock>,
      },
      {
        title: "Tocca “Aggiungi alla schermata Home”",
        short: "Scorri e tocca “Aggiungi alla schermata Home”",
        text: <>Scorri un po&apos; verso il basso nel menu che si apre. Se non c&apos;è, tocca <b>Altro</b> o <b>Visualizza altro</b>.</>,
        picture: <Mock label="Aggiungi alla schermata Home"><IconPlus size={24} /></Mock>,
      },
      {
        title: "Tocca “Aggiungi”",
        short: "Tocca “Aggiungi” in alto a destra",
        text: <>In alto a destra. Il nome lo puoi lasciare com&apos;è.</>,
        picture: <div className="rounded-full bg-white px-6 py-2.5 text-[17px] font-semibold text-[#2f6fde] shadow-sm">Aggiungi</div>,
      },
      open,
    ];
  }
  return [
    {
      title: "Tocca i tre puntini in alto a destra",
      short: "Tocca i tre puntini ⋮ in alto a destra",
      text: <>Sono accanto all&apos;indirizzo del sito, in Chrome. Usi Samsung Internet? Tocca le tre righe <b>≡</b> in basso a destra.</>,
      picture: <Mock><Dots vertical /></Mock>,
    },
    {
      title: "Tocca “Aggiungi a schermata Home”",
      short: "Tocca “Aggiungi a schermata Home” o “Installa app”",
      text: <>A volte si chiama <b>Installa app</b>. Su Samsung Internet: <b>Aggiungi pagina a</b> → <b>Schermata Home</b>.</>,
      picture: <Mock label="Aggiungi a schermata Home"><IconPlus size={24} /></Mock>,
    },
    {
      title: "Conferma con “Installa”",
      short: "Conferma con “Installa”",
      text: <>O <b>Aggiungi</b>. Se te lo chiede, conferma di nuovo.</>,
      picture: <div className="rounded-full bg-white px-6 py-2.5 text-[17px] font-semibold text-[#1a73e8] shadow-sm">Installa</div>,
    },
    open,
  ];
}

const TRY_WAIT = 3600 * 1000;

export function InstallGuide({ appName }: { appName: string }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState<Phone | null>(null);
  const [detected, setDetected] = useState<Platform>("other");
  const [canPrompt, setCanPrompt] = useState(false);
  const [installed, setInstalled] = useState(false);
  // promemoria in alto mentre la persona segue i passi
  const [reminder, setReminder] = useState(false);

  useEffect(() => {
    const p = platform();
    const sync = () => setCanPrompt(Boolean(window.__otheriseInstall));
    const t = setTimeout(() => {
      setDetected(p);
      sync();
      // la prima volta da telefono, se l'app non è già sulla Home.
      // "Lo faccio dopo" la rimanda di tre giorni, "Ho capito, inizio" di un'ora
      const saved = readLocal(DONE_KEY) ?? "";
      const waiting =
        saved === "done" ||
        (saved.startsWith("later:") && Date.now() < Number(saved.slice(6)) + 3 * 24 * 3600 * 1000) ||
        (saved.startsWith("try:") && Date.now() < Number(saved.slice(4)) + TRY_WAIT);
      if (p !== "other" && !isInstalled() && !waiting) setOpen(true);
    }, 600);
    const reopen = () => {
      setPhone(null);
      setInstalled(false);
      setReminder(false);
      setOpen(true);
    };
    window.addEventListener(INSTALL_READY, sync);
    window.addEventListener(OPEN_EVENT, reopen);
    return () => {
      clearTimeout(t);
      window.removeEventListener(INSTALL_READY, sync);
      window.removeEventListener(OPEN_EVENT, reopen);
    };
  }, []);

  const close = useCallback((done: boolean) => {
    writeLocal(DONE_KEY, done ? "done" : `later:${Date.now()}`);
    setOpen(false);
  }, []);

  const start = useCallback(() => {
    writeLocal(DONE_KEY, `try:${Date.now()}`);
    setOpen(false);
    setReminder(true);
  }, []);

  const steps = phone ? stepsFor(phone, appName) : [];

  if (reminder && phone) {
    return (
      <div
        role="region"
        aria-label="Promemoria: metti l'app sulla Home"
        className="fixed top-[calc(env(safe-area-inset-top)+0.5rem)] right-[var(--edge-right)] left-[var(--edge-left)] z-[90] rounded-[22px] bg-ink px-4 py-3 text-card shadow-lg"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="pt-1 text-[13px] font-semibold tracking-wide text-card/70 uppercase">Ora fai così</p>
          <button type="button" aria-label="Chiudi il promemoria" onClick={() => setReminder(false)} className="-mt-1 -mr-2 flex h-9 w-9 items-center justify-center rounded-full"><IconX size={16} /></button>
        </div>
        <ol className="mt-1 flex flex-col gap-1 text-[15px] leading-snug">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-2"><span className="w-4 shrink-0 font-semibold text-card/70">{i + 1}.</span><span>{s.short}</span></li>
          ))}
        </ol>
        <button type="button" onClick={() => (setReminder(false), setOpen(true))} className="mt-2 min-h-9 text-[13px] font-semibold text-card/80 underline">Rivedi le istruzioni</button>
      </div>
    );
  }

  if (!open) return null;

  const installNow = async () => {
    const e = window.__otheriseInstall;
    if (!e) return;
    await e.prompt();
    const { outcome } = await e.userChoice;
    window.__otheriseInstall = null;
    setCanPrompt(false);
    if (outcome === "accepted") setInstalled(true);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Metti l'app sulla schermata Home">
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-sand px-5 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:rounded-[28px]">
        <div className="mb-3 flex items-center justify-between">
          {phone ? (
            <button type="button" onClick={() => (setPhone(null), setInstalled(false))} className="-ml-2 flex h-11 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-muted">
              <IconArrowLeft size={18} /> Indietro
            </button>
          ) : (
            <span className="text-sm font-semibold text-muted">Un minuto, una volta sola</span>
          )}
          <button type="button" aria-label="Chiudi" onClick={() => close(false)} className="-mr-1 flex h-11 w-11 items-center justify-center rounded-full bg-card"><IconX size={18} /></button>
        </div>

        {!phone ? (
          <div className="flex flex-col gap-4">
            <h2 className="text-[26px] leading-tight font-semibold">Metti l&apos;app sul telefono</h2>
            <p className="text-[16px] leading-relaxed text-muted">Così la apri con un tocco, come le altre app, e ti arrivano le notifiche.</p>
            <p className="text-[17px] font-semibold">Che telefono hai?</p>
            <div className="grid grid-cols-2 gap-3">
              {(["ios", "android"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPhone(p)}
                  className={cx("flex min-h-24 flex-col items-center justify-center gap-1 rounded-[22px] bg-card px-3 py-4 text-[18px] font-semibold", detected === p && "ring-2 ring-ink")}
                >
                  {p === "ios" ? "iPhone" : "Android"}
                  <span className="text-xs font-medium text-muted">{p === "ios" ? "Apple" : "Samsung, Xiaomi, Pixel…"}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => close(false)} className="min-h-11 text-sm font-semibold text-muted underline">Lo faccio dopo</button>
          </div>
        ) : installed ? (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-ink text-card"><IconCheck size={30} /></span>
            <h2 className="text-[24px] leading-tight font-semibold">Fatto!</h2>
            <p className="text-[16px] leading-relaxed text-muted">Trovi l&apos;icona <b className="text-ink">{appName}</b> sulla schermata Home: da ora apri l&apos;app da lì.</p>
            <button type="button" onClick={() => close(true)} className="min-h-12 w-full rounded-full bg-ink text-[16px] font-semibold text-card">Ho capito</button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <h2 className="text-[24px] leading-tight font-semibold">Ecco come fare</h2>
            {phone === "android" && canPrompt ? (
              <div className="flex flex-col gap-2 rounded-[22px] bg-card p-4">
                <p className="text-[16px] font-semibold">Il modo più veloce</p>
                <p className="text-[15px] text-muted">Tocca qui sotto e poi <b className="text-ink">Installa</b>. Se non funziona, segui i passi più in basso.</p>
                <button type="button" onClick={installNow} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-ink text-[17px] font-semibold text-card"><IconPlus size={20} /> Installa l&apos;app</button>
              </div>
            ) : null}
            {phone === "ios" ? (
              <p className="rounded-[18px] bg-card px-4 py-3 text-[15px] leading-relaxed">Funziona solo da <b>Safari</b> (l&apos;icona con la bussola). Se hai aperto il link dall&apos;email in un&apos;altra app, copia l&apos;indirizzo e aprilo in Safari.</p>
            ) : null}
            <p className="text-[16px] leading-relaxed text-muted">Leggi i passi qui sotto. Quando premi <b className="text-ink">Ho capito, inizio</b>, in alto resta un promemoria con i passi in breve, così non li perdi mentre li fai.</p>
            <ol className="flex flex-col gap-3">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-3 rounded-[22px] bg-card p-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-[15px] font-semibold text-card">{i + 1}</span>
                  <div className="flex min-w-0 flex-col gap-2">
                    <h3 className="text-[17px] leading-snug font-semibold">{s.title}</h3>
                    <p className="text-[15px] leading-relaxed">{s.text}</p>
                    <div className="flex justify-start">{s.picture}</div>
                  </div>
                </li>
              ))}
            </ol>
            <button type="button" onClick={start} className="min-h-12 w-full rounded-full bg-ink text-[16px] font-semibold text-card">Ho capito, inizio</button>
            <button type="button" onClick={() => close(true)} className="min-h-11 text-sm font-semibold text-muted underline">L&apos;ho già fatto</button>
          </div>
        )}
      </div>
    </div>
  );
}
