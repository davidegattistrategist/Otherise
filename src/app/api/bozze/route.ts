/**
 * Bozze salvate da sole mentre si scrive (tabella `drafts`, ognuno vede solo
 * le proprie). GET ?key= legge, POST { key, data } salva, DELETE ?key= toglie.
 * Il browser le tiene anche in locale: se manca la rete non si perde niente
 * e appena torna la bozza arriva qui (vedi src/components/use-draft.ts).
 * Modalità check (due dispositivi sulla stessa bozza): GET con ?since= risponde
 * 204 se non c'è niente di nuovo; POST con `patch` manda solo i campi cambiati,
 * che si applicano sopra l'ultima versione (src/lib/draft-merge.ts), e la
 * risposta riporta la bozza intera. DELETE lascia un segno con l'ora (`t`):
 * un salvataggio con un `t` più vecchio, arrivato dopo, non la fa tornare.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { CHECK_MODE_KEY } from "@/lib/check-mode-key";
import { applyPatch, deletedAt, draftTombstone, isDraftPatch } from "@/lib/draft-merge";

export const dynamic = "force-dynamic";

const MAX_BYTES = 200_000;
const validKey = (k: unknown): k is string => typeof k === "string" && k.length > 0 && k.length <= 200;
/** La modalità check la scrive solo il server (src/lib/check-mode.ts): dal browser si legge e basta. */
const writableKey = (k: unknown): k is string => validKey(k) && k !== CHECK_MODE_KEY;
/** Una bozza è un testo o un oggetto (un dato strano non deve rompere le pagine che la leggono). */
const validData = (d: unknown) => typeof d === "string" || (typeof d === "object" && d !== null && !Array.isArray(d));

export async function GET(req: NextRequest) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const key = req.nextUrl.searchParams.get("key");
  if (!validKey(key)) return NextResponse.json({ error: "Bozza non valida" }, { status: 400 });
  const supabase = await createClient();
  const { data } = await supabase.from("drafts").select("data, updated_at").eq("user_id", me.id).eq("key", key).maybeSingle();
  const since = Number(req.nextUrl.searchParams.get("since"));
  if (since > 0 && data && new Date(data.updated_at).getTime() <= since) return new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
  return NextResponse.json(data && deletedAt(data.data) === null ? data : null, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const text = await req.text();
  if (text.length > MAX_BYTES) return NextResponse.json({ error: "Bozza troppo grande" }, { status: 413 });
  let body: { key?: unknown; data?: unknown; patch?: unknown; t?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Bozza non valida" }, { status: 400 });
  }
  if (!writableKey(body.key) || !validData(body.data)) return NextResponse.json({ error: "Bozza non valida" }, { status: 400 });
  if (body.patch !== undefined && !isDraftPatch(body.patch)) return NextResponse.json({ error: "Bozza non valida" }, { status: 400 });
  const supabase = await createClient();
  let data = body.data as Json;
  const { data: row } = await supabase.from("drafts").select("data, updated_at").eq("user_id", me.id).eq("key", body.key).maybeSingle();
  const gone = row ? deletedAt(row.data) : null;
  // cancellata dopo che questa bozza era partita: resta cancellata
  if (gone !== null && typeof body.t === "number" && body.t <= gone) return NextResponse.json({ ok: true, ignored: true, updated_at: row!.updated_at });
  if (body.patch && row && gone === null) {
    // solo i campi cambiati, sopra quello che ha scritto l'altro dispositivo
    data = applyPatch(row.data, body.patch) as Json;
  }
  const updated_at = new Date().toISOString();
  const { error } = await supabase.from("drafts").upsert({ user_id: me.id, key: body.key, data, updated_at });
  if (error) return NextResponse.json({ error: "Non salvata" }, { status: 500 });
  return NextResponse.json(body.patch ? { ok: true, updated_at, data } : { ok: true, updated_at });
}

export async function DELETE(req: NextRequest) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const key = req.nextUrl.searchParams.get("key");
  if (!writableKey(key)) return NextResponse.json({ error: "Bozza non valida" }, { status: 400 });
  const supabase = await createClient();
  const t = Number(req.nextUrl.searchParams.get("t")) || Date.now();
  await supabase.from("drafts").upsert({ user_id: me.id, key, data: draftTombstone(t), updated_at: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
