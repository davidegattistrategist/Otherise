"use client";

/**
 * Campanella, numeri della chat e avvisi a comparsa che si aggiornano da soli,
 * senza notifiche del browser: ogni 30 secondi con la pagina in vista (ogni
 * minuto quando è dietro altre finestre, e subito quando si torna sull'app o
 * arriva una push) la pagina chiede /api/live. Se è arrivato qualcosa di nuovo
 * mostra un avviso che allo staff resta finché non lo chiude (così lo vede
 * anche se in quel momento lavorava su altro), aggiorna il titolo della scheda
 * del browser con il numero da leggere e ricarica le pagine di riepilogo.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { openNotification } from "@/app/notifiche/actions";
import { startCheckMode } from "@/app/check/actions";
import { IconBell, IconChat, IconX } from "./icons";

type Counts = { notifications: number; chats: number };
type Latest = { id: string; kind: string; title: string; body: string; link: string | null; client_id: string | null } | null;
type CheckModeInfo = { clientId: string; checkId?: string | null; clientName: string; paused: boolean } | null;
type Live = Counts & { latest: Latest; chat: { clientId: string; at: string; from: string | null } | null; checkMode?: CheckModeInfo };
type Banner = { key: string; title: string; body: string; link: string; notificationId?: string; chat?: boolean };

const LiveContext = createContext<Counts | null>(null);

/** Numeri aggiornati (se la pagina non è dentro LiveProvider usa quelli passati). */
export function useLiveCounts(fallback: Counts): Counts {
  return useContext(LiveContext) ?? fallback;
}

// campanella e numeri: ogni 30 secondi (e subito quando si torna sull'app o arriva una push)
const EVERY_MS = 30_000;
const CHECK_MODE_EVERY_MS = 4_000;
const HIDDEN_EVERY_MS = 60_000;
const MAX_BANNERS = 3;
// pagine di riepilogo che si possono ricaricare senza disturbare chi scrive
const REFRESH = [/^\/cliente$/, /^\/cliente\/notifiche$/, /^\/staff$/, /^\/staff\/notifiche$/, /^\/staff\/messaggi$/, /^\/staff\/clienti$/, /^\/staff\/pagamenti$/];

export function LiveProvider({ initial, role, children, initialCheckMode = null }: { initial: Counts; role: "client" | "staff"; children: React.ReactNode; initialCheckMode?: CheckModeInfo }) {
  const router = useRouter();
  const path = usePathname();
  // modalità check (staff): se si accende su un dispositivo, anche gli altri ci
  // entrano da soli; se si chiude, ne escono. Si segue solo quello che arriva
  // fresco da /api/live (mai i dati della pagina, che possono essere di qualche
  // secondo prima) e solo i cambiamenti: così un dispositivo non entra ed esce
  // da solo per una risposta arrivata in ritardo.
  const [checkMode, setCheckMode] = useState<CheckModeInfo>(initialCheckMode);
  const seenMode = useRef<CheckModeInfo | undefined>(undefined);
  const followCheckMode = useCallback(
    (cm: CheckModeInfo, here: string) => {
      const prev = seenMode.current;
      seenMode.current = cm;
      const active = (m: CheckModeInfo | undefined) => Boolean(m && !m.paused);
      const inMode = here.startsWith("/check/");
      if (prev === undefined) {
        // appena aperta l'app: se c'è un check in corso (non in pausa) si entra
        if (active(cm) && !inMode) router.push(`/check/${cm!.clientId}`);
        return;
      }
      if (!active(prev) && active(cm)) {
        if (!inMode || here.split("/")[2] !== cm!.clientId) router.push(`/check/${cm!.clientId}`);
        else router.refresh();
      } else if (active(prev) && !active(cm)) {
        if (inMode) router.push(cm ? `/staff/clienti/${cm.clientId}` : `/staff/clienti/${here.split("/")[2]}/check`);
      } else if (active(prev) && active(cm) && inMode && (prev!.clientId !== cm!.clientId || (prev!.checkId ?? null) !== (cm!.checkId ?? null))) {
        // dall'altro dispositivo hai aperto un altro check
        if (prev!.clientId !== cm!.clientId) router.push(`/check/${cm!.clientId}`);
        else router.refresh();
      }
    },
    [router],
  );
  const [counts, setCounts] = useState(initial);
  // quando il server ridisegna il layout (navigazione, azione) ripartiamo dai suoi numeri
  const [seen, setSeen] = useState(initial);
  if (seen.notifications !== initial.notifications || seen.chats !== initial.chats) {
    setSeen(initial);
    setCounts(initial);
  }
  const [banners, setBanners] = useState<Banner[]>([]);
  const push = useCallback((b: Banner) => setBanners((list) => [b, ...list.filter((x) => x.key !== b.key && x.link !== b.link)].slice(0, MAX_BANNERS)), []);
  const lastPoll = useRef(0);
  const last = useRef<{ latestId: string | null; chatAt: string | null; counts: Counts } | null>(null);
  const pathRef = useRef(path);
  const navAt = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (pathRef.current !== path) navAt.current = Date.now();
    pathRef.current = path;
  }, [path]);

  const check = useCallback(async () => {
    // dietro altre finestre basta un controllo al minuto (per il titolo della scheda)
    if (document.visibilityState !== "visible" && Date.now() - lastPoll.current < HIDDEN_EVERY_MS - 1000) return;
    lastPoll.current = Date.now();
    const asked = Date.now();
    let d: Live;
    try {
      const r = await fetch("/api/live", { cache: "no-store" });
      if (!r.ok) return;
      d = (await r.json()) as Live;
    } catch {
      return;
    }
    // risposta partita prima di un cambio di pagina (o dopo che la pagina è stata chiusa): non vale
    if (!alive.current || asked < navAt.current) return;
    const prev = last.current;
    last.current = { latestId: d.latest?.id ?? prev?.latestId ?? null, chatAt: d.chat?.at ?? prev?.chatAt ?? null, counts: { notifications: d.notifications, chats: d.chats } };
    setCounts({ notifications: d.notifications, chats: d.chats });
    if (role === "staff") {
      setCheckMode(d.checkMode ?? null);
      followCheckMode(d.checkMode ?? null, pathRef.current);
    }
    if (!prev) return; // primo controllo: solo i numeri
    const here = pathRef.current;
    const newChat = d.chat && d.chat.at !== prev.chatAt && (!prev.chatAt || d.chat.at > prev.chatAt);
    const newNotif = d.latest && d.latest.id !== prev.latestId;
    const chatLink = role === "client" ? "/cliente/messaggi" : d.chat ? `/staff/messaggi/${d.chat.clientId}` : "/staff/messaggi";
    if (newChat && here !== chatLink) {
      push({ key: `c${d.chat!.at}`, chat: true, title: role === "client" ? "Nuovo messaggio" : `Nuovo messaggio${d.chat!.from ? ` da ${d.chat!.from}` : ""}`, body: "Tocca per leggerlo.", link: chatLink });
    } else if (newNotif && d.latest!.kind !== "chat" && d.latest!.link !== here) {
      push({ key: d.latest!.id, title: d.latest!.title, body: d.latest!.body, link: d.latest!.link ?? "", notificationId: d.latest!.id });
    }
    const changed = newChat || newNotif || prev.counts.notifications !== d.notifications || prev.counts.chats !== d.chats;
    if (changed && REFRESH.some((re) => re.test(here))) router.refresh();
  }, [role, router, push, followCheckMode]);

  const inCheckMode = path.startsWith("/check/");
  useEffect(() => {
    // lo staff controlla subito (modalità check); in modalità check più spesso
    const first = setTimeout(check, role === "staff" ? 200 : 1500);
    const timer = setInterval(check, inCheckMode ? CHECK_MODE_EVERY_MS : EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const onMessage = (e: MessageEvent) => {
      if ((e.data as { type?: string } | null)?.type === "otherise:push") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [check, role, inCheckMode]);

  // sul telefono del cliente l'avviso sparisce da solo; allo staff resta finché non lo chiude
  useEffect(() => {
    if (role !== "client" || !banners.length) return;
    const t = setTimeout(() => setBanners([]), 9000);
    return () => clearTimeout(t);
  }, [banners, role]);

  // numero da leggere nel titolo della scheda del browser: "(2) Oggi · Otherise"
  useEffect(() => {
    const n = counts.notifications + counts.chats;
    const apply = () => {
      const base = document.title.replace(/^\(\d+\) /, "");
      const next = n > 0 ? `(${n}) ${base}` : base;
      if (document.title !== next) document.title = next;
    };
    apply();
    // il titolo cambia a ogni pagina: lo riapplichiamo
    const obs = new MutationObserver(apply);
    const el = document.querySelector("title");
    if (el) obs.observe(el, { childList: true });
    return () => obs.disconnect();
  }, [counts, path]);

  const close = (key: string) => setBanners((list) => list.filter((b) => b.key !== key));
  return (
    <LiveContext.Provider value={counts}>
      {children}
      {checkMode?.paused && !path.startsWith("/check/") ? (
        <form
          action={startCheckMode.bind(null, checkMode.clientId, undefined)}
          className="fixed bottom-[calc(var(--nav-space)+0.75rem)] left-1/2 z-[70] max-w-[calc(100%-2rem)] -translate-x-1/2 lg:bottom-5"
        >
          <button type="submit" className="flex w-full items-center gap-2 rounded-full bg-ink py-2.5 pr-4 pl-3 text-sm font-semibold text-card shadow-xl">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            <span className="truncate">Check in corso con {checkMode.clientName}</span>
            <span className="shrink-0 underline">Riprendi</span>
          </button>
        </form>
      ) : null}
      {banners.length ? (
        <div className="fixed inset-x-0 top-[calc(0.75rem+env(safe-area-inset-top))] z-[80] flex flex-col items-center gap-2 px-4 md:inset-x-auto md:right-5 md:items-end">
          {banners.map((b) => <LiveBanner key={b.key} banner={b} onClose={() => close(b.key)} />)}
        </div>
      ) : null}
    </LiveContext.Provider>
  );
}

function LiveBanner({ banner, onClose }: { banner: Banner; onClose: () => void }) {
  const Icon = banner.chat ? IconChat : IconBell;
  const content = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white"><Icon size={18} /></span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate font-semibold">{banner.title}</span>
        {banner.body ? <span className="line-clamp-2 block text-sm text-muted-dark">{banner.body}</span> : null}
      </span>
    </>
  );
  const cls = "flex min-w-0 flex-1 items-center gap-3 py-1";
  return (
    <div role="status" aria-live="polite" className="flex w-full max-w-md justify-center">
      <div className="flex w-full items-center gap-2 rounded-[22px] bg-ink py-2 pr-2 pl-3 text-card shadow-xl">
        {banner.notificationId ? (
          <form action={openNotification.bind(null, banner.notificationId)} className="flex min-w-0 flex-1" onSubmit={onClose}>
            <button type="submit" className={cls}>{content}</button>
          </form>
        ) : (
          <Link href={banner.link} onClick={onClose} className={cls}>{content}</Link>
        )}
        <button type="button" aria-label="Chiudi l'avviso" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-dark hover:text-card"><IconX size={18} /></button>
      </div>
    </div>
  );
}

/** Campanella con il numero delle notifiche da leggere, sempre aggiornato. */
export function LiveBell({ href, initial }: { href: string; initial: number }) {
  const { notifications } = useLiveCounts({ notifications: initial, chats: 0 });
  return (
    <Link href={href} aria-label={notifications ? `Notifiche, ${notifications} da leggere` : "Notifiche"} className="relative flex h-11 w-11 items-center justify-center rounded-full bg-card">
      <IconBell size={20} />
      {notifications ? <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-white">{notifications}</span> : null}
    </Link>
  );
}
