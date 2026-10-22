/**
 * Il numero per il numerino rosso sull'icona dell'app: lo chiede il service
 * worker (public/sw.js) quando arriva una notifica, anche con l'app chiusa.
 * Stesso conteggio del pallino su Messaggi (src/app/api/live/route.ts).
 */
import { NextResponse } from "next/server";
import { getMe } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getMe();
  if (!me) return NextResponse.json({ count: 0 }, { status: 401, headers: { "cache-control": "no-store" } });
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_unread_chats");
  const list = data ?? [];
  const staff = me.role === "owner" || me.role === "coach";
  const count = staff ? list.length : list.reduce((n, c) => n + c.unread, 0);
  return NextResponse.json({ count }, { headers: { "cache-control": "no-store" } });
}
