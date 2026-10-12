import Link from "next/link";
import { redirect } from "next/navigation";
import { needsConsent } from "@/lib/privacy";
import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ClientNav } from "@/components/client-nav";
import { LiveBell, LiveProvider } from "@/components/live";
import { InstallGuide } from "@/components/install-guide";
import { PushPopup, PushSync } from "@/components/push";
import { homeScreenName } from "@/lib/app-name";

export default async function ClientAreaLayout({ children }: { children: React.ReactNode }) {
  const me = await requireClient();
  const supabase = await createClient();
  const [{ count: unread }, { data: name }, { data: chats }, { data: consent }] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    supabase.rpc("business_name"),
    supabase.rpc("my_unread_chats"),
    supabase.from("clients").select("privacy_accepted_at, privacy_version, health_consent_at").eq("id", me.clientId).single(),
  ]);
  if (needsConsent(consent)) redirect("/consenso");
  const ended = me.clientStatus === "archived";
  const chatUnread = (chats ?? []).reduce((n, c) => n + c.unread, 0);
  return (
    <LiveProvider role="client" initial={{ notifications: unread ?? 0, chats: chatUnread }}>
      <div className="mx-auto flex min-h-dvh max-w-[880px] flex-col pr-[var(--edge-right)] pl-[var(--edge-left)] sm:px-6">
        <header className="flex items-center justify-between gap-3 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-2 md:pt-7">
          <Link href={ended ? "/cliente/messaggi" : "/cliente"} className="flex min-w-0 items-center gap-2.5">
            <span className="h-3 w-3 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            <span className="truncate text-[17px] font-bold tracking-tight">{name ?? "Otherise"}</span>
          </Link>
          <div className="hidden md:block"><ClientNav chatUnread={chatUnread} ended={ended} /></div>
          <LiveBell href="/cliente/notifiche" initial={unread ?? 0} />
        </header>
        <main className="flex-1 pt-3 pb-[calc(var(--nav-space)+1.75rem)] md:pb-16">{children}</main>
        <div className="md:hidden"><ClientNav chatUnread={chatUnread} ended={ended} /></div>
      </div>
      <InstallGuide appName={homeScreenName(name)} />
      <PushSync />
      <PushPopup text="Ti avviso quando ti scrive il tuo coach, quando è pronto il programma nuovo e quando c'è il check-up da fare." />
    </LiveProvider>
  );
}
