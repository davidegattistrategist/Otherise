/**
 * Stato "dal vivo" per campanella e chat: le pagine aperte lo chiedono ogni
 * pochi secondi (src/components/live.tsx), così gli avvisi compaiono senza
 * ricaricare. Risposta piccola, passa dai permessi del database.
 */
import { NextResponse } from "next/server";
import { getMe } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCheckMode } from "@/lib/check-mode";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const supabase = await createClient();
  const staffUser = me.role === "owner" || me.role === "coach";
  const [{ count }, { data: latest }, { data: chats }, checkMode] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_id", me.id).neq("kind", "chat").is("read_at", null),
    supabase.from("notifications").select("id, kind, title, body, link, client_id").eq("recipient_id", me.id).neq("kind", "chat").is("read_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.rpc("my_unread_chats"),
    staffUser ? getCheckMode(supabase, me.id) : Promise.resolve(null),
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
  return NextResponse.json(
    {
      notifications: count ?? 0,
      // stesso conteggio dei menu: lo staff vede quante conversazioni, il cliente quanti messaggi
      chats: staff ? list.length : list.reduce((n, c) => n + c.unread, 0),
      latest: latest ?? null,
      chat: newest ? { clientId: newest.client_id, at: newest.last_at, from: chatFrom } : null,
      // modalità check in corso (staff): gli altri dispositivi entrano ed escono da soli
      checkMode: checkMode ? { clientId: checkMode.clientId, checkId: checkMode.checkId, clientName: checkMode.clientName, paused: checkMode.paused } : null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
