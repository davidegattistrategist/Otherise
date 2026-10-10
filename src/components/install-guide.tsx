"use client";

/**
 * Guida "Metti l'app sulla Home": al primo accesso dal telefono chiede se è
 * un iPhone o un Android e accompagna passo passo. Su Android, se il browser
 * lo permette, basta un tocco su "Installa". Alla fine propone le notifiche.
 * Non compare se l'app è già aperta dalla Home o se la guida è già stata fatta
 * su questo telefono. Si riapre con openInstallGuide().
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
type Step = { title: string; text: React.ReactNode; picture: React.ReactNode };

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
        text: (
          <>È il quadrato con la freccia verso l&apos;alto, in basso al centro dello schermo. Non lo vedi? Tocca prima i tre puntini <b>···</b> in basso a destra.</>
        ),
        picture: <Mock><ShareIcon /></Mock>,
      },
      {
        title: "Tocca “Aggiungi alla schermata Home”",
        text: <>Scorri un po&apos; verso il basso nel menu che si apre. Se non c&apos;è, tocca <b>Altro</b> o <b>Visualizza altro</b>.</>,
        picture: <Mock label="Aggiungi alla schermata Home"><IconPlus size={24} /></Mock>,
      },
      {
        title: "Tocca “Aggiungi”",
        text: <>In alto a destra. Il nome lo puoi lasciare com&apos;è.</>,
        picture: <div className="rounded-full bg-white px-6 py-2.5 text-[17px] font-semibold text-[#2f6fde] shadow-sm">Aggiungi</div>,
      },
      open,
    ];
  }
  return [
    {
      title: "Tocca i tre puntini in alto a destra",
      text: <>Sono accanto all&apos;indirizzo del sito, in Chrome. Usi Samsung Internet? Tocca le tre righe <b>≡</b> in basso a destra.</>,
      picture: <Mock><Dots vertical /></Mock>,
    },
    {
      title: "Tocca “Aggiungi a schermata Home”",
      text: <>A volte si chiama <b>Installa app</b>. Su Samsung Internet: <b>Aggiungi pagina a</b> → <b>Schermata Home</b>.</>,
      picture: <Mock label="Aggiungi a schermata Home"><IconPlus size={24} /></Mock>,
    },
    {
      title: "Conferma con “Installa”",
      text: <>O <b>Aggiungi</b>. Se te lo chiede, conferma di nuovo.</>,
      picture: <div className="rounded-full bg-white px-6 py-2.5 text-[17px] font-semibold text-[#1a73e8] shadow-sm">Installa</div>,
    },
    open,
  ];
}

export function InstallGuide({ appName }: { appName: string }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState<Phone | null>(null);
  const [step, setStep] = useState(0);
  const [detected, setDetected] = useState<Platform>("other");
  const [canPrompt, setCanPrompt] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const p = platform();
    const sync = () => setCanPrompt(Boolean(window.__otheriseInstall));
    const t = setTimeout(() => {
      setDetected(p);
      sync();
      // la prima volta da telefono, se l'app non è già sulla Home
      // "Lo faccio dopo" la rimanda di tre giorni
      const saved = readLocal(DONE_KEY) ?? "";
      const waiting = saved === "done" || (saved.startsWith("later:") && Date.now() < Number(saved.slice(6)) + 3 * 24 * 3600 * 1000);
      if (p !== "other" && !isInstalled() && !waiting) setOpen(true);
    }, 600);
    const reopen = () => {
      setPhone(null);
      setStep(0);
      setInstalled(false);
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

  if (!open) return null;
  const steps = phone ? stepsFor(phone, appName) : [];
  const current = steps[step];

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
            <button type="button" onClick={() => (step === 0 || installed ? (setPhone(null), setStep(0), setInstalled(false)) : setStep(step - 1))} className="-ml-2 flex h-11 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-muted">
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
        ) : phone === "android" && canPrompt && step === 0 ? (
          <div className="flex flex-col gap-4">
            <h2 className="text-[24px] leading-tight font-semibold">Basta un tocco</h2>
            <p className="text-[16px] leading-relaxed text-muted">Tocca il pulsante qui sotto e poi <b className="text-ink">Installa</b>.</p>
            <button type="button" onClick={installNow} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-ink text-[17px] font-semibold text-card"><IconPlus size={20} /> Installa l&apos;app</button>
            <button type="button" onClick={() => setCanPrompt(false)} className="min-h-11 text-sm font-semibold text-muted underline">Non funziona? Fallo a mano</button>
          </div>
        ) : current ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-1.5" aria-label={`Passo ${step + 1} di ${steps.length}`}>
              {steps.map((_, i) => <span key={i} className={cx("h-1.5 flex-1 rounded-full", i <= step ? "bg-ink" : "bg-sand-deep")} />)}
            </div>
            <div className="text-sm font-semibold text-muted">Passo {step + 1} di {steps.length}</div>
            <h2 className="text-[24px] leading-tight font-semibold">{current.title}</h2>
            <div className="flex min-h-28 items-center justify-center rounded-[22px] bg-sand-deep/50 p-5">{current.picture}</div>
            <p className="text-[16px] leading-relaxed">{current.text}</p>
            {step < steps.length - 1 ? (
              <button type="button" onClick={() => setStep(step + 1)} className="min-h-12 w-full rounded-full bg-ink text-[16px] font-semibold text-card">Fatto, avanti</button>
            ) : (
              <button type="button" onClick={() => close(true)} className="min-h-12 w-full rounded-full bg-ink text-[16px] font-semibold text-card">Ho finito</button>
            )}
            {phone === "ios" && step === 0 ? (
              <p className="text-sm text-muted">Funziona da Safari (l&apos;icona con la bussola). Se hai aperto il link dall&apos;email e non vedi il pulsante, copia l&apos;indirizzo e aprilo in Safari.</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
