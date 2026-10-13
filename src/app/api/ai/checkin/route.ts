/** Riassunto AI dei diari di un cliente + bozza di risposta (solo staff). */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getMe } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { aiEnabled, checkinBrief } from "@/lib/ai/claude";
import { buildClientContext, buildMethodContext } from "@/lib/ai/context";
import { budgetExceeded, logAiRequest } from "@/lib/ai/budget";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const me = await getMe();
  if (!me || (me.role !== "owner" && me.role !== "coach")) return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  if (!aiEnabled()) return NextResponse.json({ error: "Assistente AI non configurato: manca ANTHROPIC_API_KEY." }, { status: 400 });
  const parsed = z.object({ clientId: z.string().uuid() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  const supabase = await createClient();
  const { data: client } = await supabase.from("clients").select("id").eq("id", parsed.data.clientId).maybeSingle();
  if (!client) return NextResponse.json({ error: "Cliente non trovato" }, { status: 404 });
  const over = await budgetExceeded(supabase);
  if (over) return NextResponse.json({ error: over }, { status: 429 });
  try {
    const [method, clientContext] = await Promise.all([buildMethodContext(supabase), buildClientContext(supabase, client.id)]);
    const r = await checkinBrief({ clientContext, method: method.method });
    await logAiRequest(me.id, client.id, "checkin", r.usage);
    return NextResponse.json({ working: r.working, slipping: r.slipping, focus: r.focus, reply: r.reply });
  } catch (e) {
    console.error("AI checkin error", e);
    return NextResponse.json({ error: "L'assistente non ha risposto correttamente. Riprova tra poco." }, { status: 502 });
  }
}
