import Link from "next/link";
import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ClientNav } from "@/components/client-nav";
import { IconBell } from "@/components/icons";

export default async function ClientAreaLayout({ children }: { children: React.ReactNode }) {
  await requireClient();
  const supabase = await createClient();
  const [{ count: unread }, { data: name }] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    supabase.rpc("business_name"),
  ]);
  return (
    <div className="mx-auto flex min-h-dvh max-w-[880px] flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between gap-3 pt-5 pb-2 md:pt-7">
        <Link href="/cliente" className="flex items-center gap-2.5">
          <span className="h-3 w-3 rounded-full bg-accent" aria-hidden="true" />
          <span className="text-[17px] font-bold tracking-tight">{name ?? "Otherise"}</span>
        </Link>
        <div className="hidden md:block"><ClientNav /></div>
        <Link href="/cliente/notifiche" aria-label={unread ? `Notifiche, ${unread} da leggere` : "Notifiche"} className="relative flex h-11 w-11 items-center justify-center rounded-full bg-card">
          <IconBell size={20} />
          {unread ? <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-white">{unread}</span> : null}
        </Link>
      </header>
      <main className="flex-1 pt-3 pb-28 md:pb-16">{children}</main>
      <div className="md:hidden"><ClientNav /></div>
    </div>
  );
}
