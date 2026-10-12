import "server-only";
/**
 * Foto dei check (frontale, laterali, dietro…). File nel bucket privato
 * "checks": `<cliente>/<check>/<id>.jpg` e la miniatura `<id>-t.jpg`. Si
 * vedono con link temporanei firmati sul server dopo aver letto le righe con i
 * permessi di chi è collegato (lo staff dalla tabella, il cliente da
 * my_check_photos(), che mostra solo i check visibili e con la data).
 */
import type { ServerSupabase } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";
import type { CheckPhoto } from "./check-photos-shared";

export const CHECK_PHOTOS_BUCKET = "checks";
const LINK_SECONDS = 60 * 60 * 6;

type Row = { id: string; check_id: string; path: string; thumb_path: string; width: number | null; height: number | null; created_at: string; check_date?: string | null };

async function withLinks(rows: Row[]): Promise<CheckPhoto[]> {
  if (!rows.length) return [];
  const paths = rows.flatMap((r) => [r.path, r.thumb_path]);
  const { data } = await createAdminClient().storage.from(CHECK_PHOTOS_BUCKET).createSignedUrls(paths, LINK_SECONDS);
  const url = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return rows.map((r) => ({
    id: r.id,
    checkId: r.check_id,
    checkDate: r.check_date ?? null,
    url: url.get(r.path) ?? null,
    thumbUrl: url.get(r.thumb_path) ?? url.get(r.path) ?? null,
    width: r.width,
    height: r.height,
    createdAt: r.created_at,
  }));
}

/** Foto dei check di un cliente, per lo staff, raggruppate per check. */
export async function staffCheckPhotos(supabase: ServerSupabase, clientId: string, checkId?: string): Promise<Map<string, CheckPhoto[]>> {
  let q = supabase.from("check_photos").select("id, check_id, path, thumb_path, width, height, created_at").eq("client_id", clientId);
  if (checkId) q = q.eq("check_id", checkId);
  const { data } = await q.order("sort_order").order("created_at");
  return group(await withLinks(data ?? []));
}

/** Foto dei propri check, per il cliente (solo check visibili e con la data). */
export async function myCheckPhotos(supabase: ServerSupabase): Promise<Map<string, CheckPhoto[]>> {
  const { data } = await supabase.rpc("my_check_photos");
  return group(await withLinks(data ?? []));
}

function group(list: CheckPhoto[]) {
  const by = new Map<string, CheckPhoto[]>();
  for (const p of list) by.set(p.checkId, [...(by.get(p.checkId) ?? []), p]);
  return by;
}
