/**
 * Bozze AI in coda: ?id= una richiesta (l'editor la segue finché è pronta),
 * senza id le mie richieste aperte (il riquadro "Bozze AI").
 */
import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getJob, myOpenJobs } from "@/lib/ai/program-jobs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const me = await getMe();
  if (!me || (me.role !== "owner" && me.role !== "coach")) return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  const supabase = await createClient();
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
    const job = await getJob(supabase, id);
    return job ? NextResponse.json({ job }, { headers: { "cache-control": "no-store" } }) : NextResponse.json({ error: "Non trovata" }, { status: 404 });
  }
  return NextResponse.json({ jobs: await myOpenJobs(supabase, me.id) }, { headers: { "cache-control": "no-store" } });
}
