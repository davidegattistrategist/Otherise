import { requireStaff } from "@/lib/auth";
import { AiJobsButton } from "@/components/ai-jobs";
import { NavBehavior } from "@/components/nav-behavior";
import { LocalDraftRescue } from "@/components/local-draft-rescue";
import { getBusinessName } from "@/lib/data/shared";
import { createClient } from "@/lib/supabase/server";
import { StaffNav, type NavItem } from "@/components/staff-nav";
import { StaffMobileNav, type MobileItem } from "@/components/staff-mobile-nav";
import Link from "next/link";
import { LiveBell, LiveProvider } from "@/components/live";
import { InstallGuide } from "@/components/install-guide";
import { PushPopup, PushSync } from "@/components/push";
import { homeScreenName } from "@/lib/app-name";
import { Toaster } from "@/components/toaster";
import { IconLogout } from "@/components/icons";
import { signOut } from "../login/actions";
import { BrandName } from "@/components/brand";
import { getCheckMode } from "@/lib/check-mode";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const me = await requireStaff();
  const supabase = await createClient();
  const [{ count: unread }, { data: name }, { data: chats }, checkMode] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).neq("kind", "chat").is("read_at", null),
    getBusinessName().then((data) => ({ data })),
    supabase.rpc("my_unread_chats"),
    getCheckMode(supabase, me.id),
  ]);
  const unreadChats = (chats ?? []).length;
  const owner = me.role === "owner";
  const items: NavItem[] = [
    { href: "/staff", label: "Oggi", icon: "today", exact: true },
    { href: "/staff/clienti", label: "Clienti", icon: "users" },
    { href: "/staff/messaggi", label: "Messaggi", icon: "chat", badge: unreadChats },
    { href: "/staff/modelli", label: "Modelli di programma", icon: "template" },
    { href: "/staff/eserciziario", label: "Eserciziario", icon: "book" },
    ...(owner ? ([{ href: "/staff/pagamenti", label: "Pagamenti", icon: "wallet" }] as NavItem[]) : []),
    { href: "/staff/notifiche", label: "Notifiche", icon: "bell", badge: unread ?? 0 },
    ...(owner
      ? ([
          { href: "/staff/team", label: "Collaboratori", icon: "team" },
          { href: "/staff/impostazioni", label: "Impostazioni e metodo", icon: "settings" },
        ] as NavItem[])
      : []),
  ];
  const mainMobile: MobileItem[] = [
    { href: "/staff", label: "Oggi", icon: "today", exact: true },
    { href: "/staff/clienti", label: "Clienti", icon: "users" },
    { href: "/staff/messaggi", label: "Messaggi", icon: "chat", badge: unreadChats },
    ...(owner ? ([{ href: "/staff/pagamenti", label: "Pagamenti", icon: "wallet" }] as MobileItem[]) : ([{ href: "/staff/modelli", label: "Modelli", icon: "template" }] as MobileItem[])),
  ];
  const moreMobile = items.filter((i) => !mainMobile.some((m) => m.href === i.href)) as MobileItem[];
  return (
    <LiveProvider role="staff" initial={{ notifications: unread ?? 0, chats: unreadChats }} initialCheckMode={checkMode ? { clientId: checkMode.clientId, checkId: checkMode.checkId, clientName: checkMode.clientName, paused: checkMode.paused } : null}>
    <div className="flex min-h-dvh flex-wrap content-start items-stretch">
      {/* telefono: barra in alto e menu in basso */}
      <header className="flex w-full items-center justify-between gap-3 pt-[calc(1rem+env(safe-area-inset-top))] pr-[var(--edge-right)] pl-[var(--edge-left)] sm:px-8 lg:hidden">
        <Link href="/staff" className="flex min-w-0 items-center gap-2.5">
          <span className="h-3 w-3 shrink-0 rounded-full bg-accent" aria-hidden="true" />
          <BrandName name={name} className="text-[17px] font-bold tracking-tight" />
        </Link>
        <span className="flex items-center gap-2">
          <AiJobsButton variant="header" />
          <LiveBell href="/staff/notifiche" initial={unread ?? 0} />
        </span>
      </header>
      <Toaster />
      <NavBehavior />
      <LocalDraftRescue />
      <StaffMobileNav main={mainMobile} more={moreMobile} signOut={signOut} who={`${me.fullName} · ${owner ? "Titolare" : "Collaboratore"}`} />
      <aside className="box-border hidden w-full flex-col gap-6 border-b border-sand-deep px-4 py-5 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-[260px] lg:border-r lg:border-b-0 lg:px-5 lg:py-8">
        <div className="flex items-center justify-between gap-2.5 px-2">
          <div className="flex items-center gap-2.5">
            <span className="h-3 w-3 rounded-full bg-accent" aria-hidden="true" />
            <BrandName name={name} className="text-[17px] font-bold tracking-tight" />
          </div>
        </div>
        <StaffNav items={items} />
        <AiJobsButton variant="sidebar" />
        <div className="mt-auto hidden flex-col gap-1 px-2 lg:flex">
          <div className="text-sm font-semibold">{me.fullName}</div>
          <div className="text-xs text-muted">{owner ? "Titolare" : "Collaboratore"}</div>
          <form action={signOut} className="mt-2">
            <button type="submit" className="flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink">
              <IconLogout size={18} /> Esci
            </button>
          </form>
        </div>
      </aside>
      <main className="box-border min-w-0 flex-[999_1_560px] pt-4 pr-[var(--edge-right)] pb-[calc(var(--nav-space)+1.75rem)] pl-[var(--edge-left)] sm:px-8 lg:px-10 lg:pt-8 lg:pb-16">
        <div className="mx-auto max-w-[1180px]">{children}</div>
      </main>
    </div>
      <InstallGuide appName={homeScreenName(name)} />
      <PushSync />
      <PushPopup text="Ti avviso quando un cliente ti scrive, segnala un dolore o compila il diario." />
    </LiveProvider>
  );
}
