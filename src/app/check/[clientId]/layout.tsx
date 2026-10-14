/**
 * Modalità check: pagina a tutto schermo, senza menu, solo sul cliente del
 * check. LiveProvider tiene allineati telefono e computer (entrano ed escono
 * insieme dalla modalità).
 */
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LiveProvider } from "@/components/live";
import { Toaster } from "@/components/toaster";
import { getCheckMode } from "@/lib/check-mode";

export default async function CheckModeLayout({ children, params }: { children: React.ReactNode; params: Promise<{ clientId: string }> }) {
  await params;
  const me = await requireStaff();
  const supabase = await createClient();
  const [{ count: unread }, { data: chats }, mode] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).neq("kind", "chat").is("read_at", null),
    supabase.rpc("my_unread_chats"),
    getCheckMode(supabase, me.id),
  ]);
  return (
    <LiveProvider
      role="staff"
      initial={{ notifications: unread ?? 0, chats: (chats ?? []).length }}
      initialCheckMode={mode ? { clientId: mode.clientId, checkId: mode.checkId, clientName: mode.clientName, paused: mode.paused } : null}
    >
      <Toaster />
      <main className="mx-auto box-border min-h-dvh w-full max-w-[1180px] pt-[calc(0.75rem+env(safe-area-inset-top))] pr-[var(--edge-right)] pb-28 pl-[var(--edge-left)] sm:px-8 lg:px-10">
        {children}
      </main>
    </LiveProvider>
  );
}
