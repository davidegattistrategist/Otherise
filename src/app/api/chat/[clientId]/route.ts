/**
 * Messaggi nuovi di una conversazione (la pagina della chat lo chiama ogni
 * pochi secondi mentre è aperta). ?after=<data ISO dell'ultimo messaggio visto>
 */
import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canUseChat, loadMessages, markChatRead } from "@/lib/chat";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const supabase = await createClient();
  if (!(await canUseChat(supabase, clientId))) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  const after = req.nextUrl.searchParams.get("after");
  const messages = await loadMessages(clientId, me, { after: after && !Number.isNaN(Date.parse(after)) ? after : null });
  if (messages.some((m) => !m.mine)) await markChatRead(supabase, me.id, clientId);
  // messaggi eliminati di recente (per toglierli anche dallo schermo di chi li vede)
  const { data: deleted } = await supabase.from("messages").select("id").eq("client_id", clientId).not("deleted_at", "is", null).gte("deleted_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());
  return NextResponse.json({ messages, deleted: (deleted ?? []).map((d) => d.id) }, { headers: { "cache-control": "no-store" } });
}
