/**
 * Messaggi nuovi di una conversazione (la pagina della chat lo chiama ogni
 * pochi secondi mentre è aperta). ?after=<data ISO dell'ultimo messaggio visto>
 */
import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canUseChat, loadMessages, markChatRead, recentTranscripts } from "@/lib/chat";
import { readyChatDraft } from "@/lib/ai/reply";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const supabase = await createClient();
  const after = req.nextUrl.searchParams.get("after");
  const staff = me.role === "owner" || me.role === "coach";
  // tutto insieme (i permessi li controlla comunque il database): una sola attesa
  // invece di sei una dopo l'altra, conta perché la chat aperta lo chiede ogni 4 secondi
  const [allowed, messages, { data: deleted }, draft, transcripts] = await Promise.all([
    canUseChat(supabase, clientId),
    loadMessages(clientId, me, { after: after && !Number.isNaN(Date.parse(after)) ? after : null }),
    supabase.from("messages").select("id").eq("client_id", clientId).not("deleted_at", "is", null).gte("deleted_at", new Date(Date.now() - 10 * 60 * 1000).toISOString()),
    staff ? readyChatDraft(supabase, clientId) : Promise.resolve(undefined),
    recentTranscripts(supabase, clientId),
  ]);
  if (!allowed) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  if (messages.some((m) => !m.mine)) await markChatRead(supabase, me.id, clientId);
  return NextResponse.json({ messages, deleted: (deleted ?? []).map((d) => d.id), transcripts, ...(staff ? { draft } : {}) }, { headers: { "cache-control": "no-store" } });
}
