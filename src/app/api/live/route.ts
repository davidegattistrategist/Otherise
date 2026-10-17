/**
 * Stato "dal vivo" per campanella e chat: le pagine aperte lo chiedono ogni
 * pochi secondi (src/components/live.tsx), così gli avvisi compaiono senza
 * ricaricare. Risposta piccola, passa dai permessi del database.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCheckMode } from "@/lib/check-mode";
import { myOpenJobs } from "@/lib/ai/program-jobs";
import { homeFor } from "@/lib/auth";
import { HOME_COOKIE, HOME_COOKIE_OPTIONS, homeFromCookie } from "@/lib/home-cookie";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const supabase = await createClient();
  const staffUser = me.role === "owner" || me.role === "coach";
  const [{ count }, { data: latest }, { data: chats }, checkMode, aiJobs] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_id", me.id).neq("kind", "chat").is("read_at", null),
    supabase.from("notifications").select("id, kind, title, body, link, client_id").eq("recipient_id", me.id).neq("kind", "chat").is("read_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.rpc("my_unread_chats"),
    staffUser ? getCheckMode(supabase, me.id) : Promise.resolve(null),
    // bozze AI in coda (in preparazione, domande, pronte): il riquadro "Bozze AI"
    staffUser ? myOpenJobs(supabase, me.id).catch(() => []) : Promise.resolve([]),
  ]);
  const list = chats ?? [];
  const staff = me.role === "owner" || me.role === "coach";
  // ultimo messaggio non letto: serve a capire se ne è arrivato uno nuovo
  const newest = list.reduce<(typeof list)[number] | null>((a, c) => (!a || c.last_at > a.last_at ? c : a), null);
  let chatFrom: string | null = null;
  if (newest && staff) {
    const { data: c } = await supabase.from("clients").select("first_name, last_name").eq("id", newest.client_id).maybeSingle();
    chatFrom = c ? `${c.first_name} ${c.last_name}`.trim() : null;
  }
  const res = NextResponse.json(
    {
      notifications: count ?? 0,
      // stesso conteggio dei menu: lo staff vede quante conversazioni, il cliente quanti messaggi
      chats: staff ? list.length : list.reduce((n, c) => n + c.unread, 0),
      latest: latest ?? null,
      chat: newest ? { clientId: newest.client_id, at: newest.last_at, from: chatFrom } : null,
      // bozze AI in coda dello staff
      aiJobs: aiJobs.map((j) => ({ id: j.id, programId: j.programId, clientName: j.clientName ?? "", status: j.status, createdAt: j.createdAt })),
      // modalità check in corso (staff): gli altri dispositivi entrano ed escono da soli
      checkMode: checkMode ? { clientId: checkMode.clientId, checkId: checkMode.checkId, clientName: checkMode.clientName, paused: checkMode.paused } : null,
    },
    { headers: { "cache-control": "no-store" } },
  );
  // pagina iniziale per la prossima apertura dell'app (src/lib/home-cookie.ts)
  const home = homeFromCookie(homeFor(me.role));
  const saved = request.cookies.get(HOME_COOKIE)?.value;
  if (home && saved !== home) res.cookies.set(HOME_COOKIE, home, HOME_COOKIE_OPTIONS);
  if (!home && saved) res.cookies.delete(HOME_COOKIE);
  return res;
}
