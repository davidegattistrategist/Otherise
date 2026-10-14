/**
 * Bozze salvate da sole mentre si scrive (tabella `drafts`, ognuno vede solo
 * le proprie). GET ?key= legge, POST { key, data } salva, DELETE ?key= toglie.
 * Il browser le tiene anche in locale: se manca la rete non si perde niente
 * e appena torna la bozza arriva qui (vedi src/components/use-draft.ts).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

const MAX_BYTES = 200_000;
const validKey = (k: unknown): k is string => typeof k === "string" && k.length > 0 && k.length <= 200;

export async function GET(req: NextRequest) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const key = req.nextUrl.searchParams.get("key");
  if (!validKey(key)) return NextResponse.json({ error: "Bozza non valida" }, { status: 400 });
  const supabase = await createClient();
  const { data } = await supabase.from("drafts").select("data, updated_at").eq("user_id", me.id).eq("key", key).maybeSingle();
  return NextResponse.json(data ?? null, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const text = await req.text();
  if (text.length > MAX_BYTES) return NextResponse.json({ error: "Bozza troppo grande" }, { status: 413 });
  let body: { key?: unknown; data?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Bozza non valida" }, { status: 400 });
  }
  if (!validKey(body.key) || body.data === undefined) return NextResponse.json({ error: "Bozza non valida" }, { status: 400 });
  const supabase = await createClient();
  const updated_at = new Date().toISOString();
  const { error } = await supabase.from("drafts").upsert({ user_id: me.id, key: body.key, data: body.data as Json, updated_at });
  if (error) return NextResponse.json({ error: "Non salvata" }, { status: 500 });
  return NextResponse.json({ ok: true, updated_at });
}

export async function DELETE(req: NextRequest) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const key = req.nextUrl.searchParams.get("key");
  if (!validKey(key)) return NextResponse.json({ error: "Bozza non valida" }, { status: 400 });
  const supabase = await createClient();
  await supabase.from("drafts").delete().eq("user_id", me.id).eq("key", key);
  return NextResponse.json({ ok: true });
}
