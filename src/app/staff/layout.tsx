import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StaffNav, type NavItem } from "@/components/staff-nav";
import { IconLogout } from "@/components/icons";
import { signOut } from "../login/actions";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const me = await requireStaff();
  const supabase = await createClient();
  const [{ count: unread }, { data: name }] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    supabase.rpc("business_name"),
  ]);
  const owner = me.role === "owner";
  const items: NavItem[] = [
    { href: "/staff", label: "Oggi", icon: "today", exact: true },
    { href: "/staff/clienti", label: "Clienti", icon: "users" },
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
  return (
    <div className="flex min-h-dvh flex-wrap items-stretch">
      <aside className="box-border flex w-full flex-col gap-6 border-b border-sand-deep px-4 py-5 lg:sticky lg:top-0 lg:h-dvh lg:w-[260px] lg:border-r lg:border-b-0 lg:px-5 lg:py-8">
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
      <main className="box-border min-w-0 flex-[999_1_560px] px-4 pt-6 pb-16 sm:px-8 lg:px-10 lg:pt-8">
        <div className="mx-auto max-w-[1180px]">{children}</div>
        <form action={signOut} className="mt-12 lg:hidden">
          <button type="submit" className="flex items-center gap-2 text-sm font-semibold text-muted">
            <IconLogout size={18} /> Esci ({me.fullName})
          </button>
        </form>
      </main>
    </div>
  );
}
