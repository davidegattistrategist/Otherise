import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StaffNav, type NavItem } from "@/components/staff-nav";
import { StaffMobileNav, type MobileItem } from "@/components/staff-mobile-nav";
import Link from "next/link";
import { IconBell } from "@/components/icons";
import { Toaster } from "@/components/toaster";
import { IconLogout } from "@/components/icons";
import { signOut } from "../login/actions";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const me = await requireStaff();
  const supabase = await createClient();
  const [{ count: unread }, { data: name }, { data: chats }] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    supabase.rpc("business_name"),
    supabase.rpc("my_unread_chats"),
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
    <div className="flex min-h-dvh flex-wrap content-start items-stretch">
      {/* telefono: barra in alto e menu in basso */}
      <header className="flex w-full items-center justify-between px-4 pt-4 lg:hidden">
        <Link href="/staff" className="flex items-center gap-2.5">
          <span className="h-3 w-3 rounded-full bg-accent" aria-hidden="true" />
          <span className="text-[17px] font-bold tracking-tight">{name ?? "Otherise"}</span>
        </Link>
        <Link href="/staff/notifiche" aria-label={unread ? `Notifiche, ${unread} da leggere` : "Notifiche"} className="relative flex h-11 w-11 items-center justify-center rounded-full bg-card">
          <IconBell size={20} />
          {unread ? <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-white">{unread}</span> : null}
        </Link>
      </header>
      <Toaster />
      <StaffMobileNav main={mainMobile} more={moreMobile} signOut={signOut} who={`${me.fullName} · ${owner ? "Titolare" : "Collaboratore"}`} />
      <aside className="box-border hidden w-full flex-col gap-6 border-b border-sand-deep px-4 py-5 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-[260px] lg:border-r lg:border-b-0 lg:px-5 lg:py-8">
        <div className="flex items-center justify-between gap-2.5 px-2">
          <div className="flex items-center gap-2.5">
            <span className="h-3 w-3 rounded-full bg-accent" aria-hidden="true" />
            <span className="text-[17px] font-bold tracking-tight">{name ?? "Otherise"}</span>
          </div>
        </div>
        <StaffNav items={items} />
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
      <main className="box-border min-w-0 flex-[999_1_560px] px-4 pt-4 pb-28 sm:px-8 lg:px-10 lg:pt-8 lg:pb-16">
        <div className="mx-auto max-w-[1180px]">{children}</div>
      </main>
    </div>
  );
}
