"use client";

/**
 * Campanella, numeri della chat e avvisi a comparsa che si aggiornano da soli:
 * ogni 20 secondi (e appena si torna sull'app o arriva una push) la pagina
 * chiede /api/live. Se è arrivato qualcosa di nuovo mostra un avviso in alto
 * e aggiorna le pagine di riepilogo (Oggi, Notifiche, Messaggi).
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { openNotification } from "@/app/notifiche/actions";
import { IconBell, IconChat, IconX } from "./icons";

type Counts = { notifications: number; chats: number };
type Latest = { id: string; kind: string; title: string; body: string; link: string | null; client_id: string | null } | null;
type Live = Counts & { latest: Latest; chat: { clientId: string; at: string; from: string | null } | null };
type Banner = { key: string; title: string; body: string; link: string; notificationId?: string; chat?: boolean };

const LiveContext = createContext<Counts | null>(null);

/** Numeri aggiornati (se la pagina non è dentro LiveProvider usa quelli passati). */
export function useLiveCounts(fallback: Counts): Counts {
  return useContext(LiveContext) ?? fallback;
}

const EVERY_MS = 20_000;
// pagine di riepilogo che si possono ricaricare senza disturbare chi scrive
const REFRESH = [/^\/cliente$/, /^\/cliente\/notifiche$/, /^\/staff$/, /^\/staff\/notifiche$/, /^\/staff\/messaggi$/];

export function LiveProvider({ initial, role, children }: { initial: Counts; role: "client" | "staff"; children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [counts, setCounts] = useState(initial);
  // quando il server ridisegna il layout (navigazione, azione) ripartiamo dai suoi numeri
  const [seen, setSeen] = useState(initial);
  if (seen.notifications !== initial.notifications || seen.chats !== initial.chats) {
    setSeen(initial);
    setCounts(initial);
  }
  const [banner, setBanner] = useState<Banner | null>(null);
  const last = useRef<{ latestId: string | null; chatAt: string | null; counts: Counts } | null>(null);
  const pathRef = useRef(path);
  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  const check = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    let d: Live;
    try {
      const r = await fetch("/api/live", { cache: "no-store" });
      if (!r.ok) return;
      d = (await r.json()) as Live;
    } catch {
      return;
    }
    const prev = last.current;
    last.current = { latestId: d.latest?.id ?? prev?.latestId ?? null, chatAt: d.chat?.at ?? prev?.chatAt ?? null, counts: { notifications: d.notifications, chats: d.chats } };
    setCounts({ notifications: d.notifications, chats: d.chats });
    if (!prev) return; // primo controllo: solo i numeri
    const here = pathRef.current;
    const newChat = d.chat && d.chat.at !== prev.chatAt && (!prev.chatAt || d.chat.at > prev.chatAt);
    const newNotif = d.latest && d.latest.id !== prev.latestId;
    const chatLink = role === "client" ? "/cliente/messaggi" : d.chat ? `/staff/messaggi/${d.chat.clientId}` : "/staff/messaggi";
    if (newChat && here !== chatLink) {
      setBanner({ key: `c${d.chat!.at}`, chat: true, title: role === "client" ? "Nuovo messaggio" : `Nuovo messaggio${d.chat!.from ? ` da ${d.chat!.from}` : ""}`, body: "Tocca per leggerlo.", link: chatLink });
    } else if (newNotif && d.latest!.kind !== "chat" && d.latest!.link !== here) {
      setBanner({ key: d.latest!.id, title: d.latest!.title, body: d.latest!.body, link: d.latest!.link ?? "", notificationId: d.latest!.id });
    }
    const changed = newChat || newNotif || prev.counts.notifications !== d.notifications || prev.counts.chats !== d.chats;
    if (changed && REFRESH.some((re) => re.test(here))) router.refresh();
  }, [role, router]);

  useEffect(() => {
    const first = setTimeout(check, 1500);
    const timer = setInterval(check, EVERY_MS);
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
  }, [check]);

  // l'avviso sparisce da solo dopo qualche secondo
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 9000);
    return () => clearTimeout(t);
  }, [banner]);

  return (
    <LiveContext.Provider value={counts}>
      {children}
      {banner ? <LiveBanner banner={banner} onClose={() => setBanner(null)} /> : null}
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
    <div role="status" aria-live="polite" className="fixed inset-x-0 top-[calc(0.75rem+env(safe-area-inset-top))] z-[80] flex justify-center px-4">
      <div className="flex w-full max-w-md items-center gap-2 rounded-[22px] bg-ink py-2 pr-2 pl-3 text-card shadow-xl">
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
