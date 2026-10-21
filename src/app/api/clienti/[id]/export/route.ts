/**
 * Tutti i dati di un cliente in un file JSON (solo titolare): serve per le
 * richieste di accesso e di portabilità (artt. 15 e 20 GDPR).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const TABLES = [
  "client_projects",
  "message_transcripts",
  "programs",
  "workout_logs",
  "free_workouts",
  "exercise_logs",
  "pt_sessions",
  "checks",
  "check_photos",
  "weight_logs",
  "posture_assessments",
  "checkins",
  "payment_plans",
  "payments",
  "messages",
] as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me || me.role !== "owner") return NextResponse.json({ error: "Solo il titolare può scaricare i dati dei clienti." }, { status: 403 });
  const { id } = await params;
  const admin = createAdminClient();
  const { data: client } = await admin.from("clients").select("*").eq("id", id).maybeSingle();
  if (!client) return NextResponse.json({ error: "Cliente non trovato" }, { status: 404 });
  const out: Record<string, unknown> = {
    esportato_il: new Date().toISOString(),
    nota: "Dati conservati nell'app per questo cliente. Foto e video della chat sono elencati negli allegati dei messaggi, le foto dei check in check_photos: se servono, scaricali dall'app (chat e check).",
    cliente: client,
  };
  const { data: notes } = await admin.from("client_private_notes").select("notes, updated_at").eq("client_id", id).maybeSingle();
  out.note_private = notes ?? null;
  for (const t of TABLES) {
    const { data } = await admin.from(t).select("*").eq("client_id", id);
    out[t] = data ?? [];
  }
  const name = `${client.first_name}-${client.last_name}`.toLowerCase().normalize("NFD").replace(/[^a-z0-9-]+/g, "");
  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="dati-${name || "cliente"}.json"`,
      "cache-control": "no-store",
    },
  });
}
