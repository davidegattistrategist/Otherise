import "server-only";
/**
 * Pulizia dello spazio file (Supabase Storage): i file di un cliente
 * eliminato e gli allegati della chat caricati ma mai inviati (foto o video
 * scelti e poi abbandonati), che altrimenti resterebbero per sempre.
 */
import { createAdminClient } from "./supabase/admin";
import { CHAT_BUCKET } from "./chat-shared";
import { CHECK_PHOTOS_BUCKET } from "./check-photos";

type Entry = { path: string; createdAt: string | null };

/** Tutti i file sotto una cartella (anche nelle sottocartelle). */
export async function listAll(bucket: string, prefix: string, depth = 0): Promise<Entry[]> {
  if (depth > 4) return [];
  const storage = createAdminClient().storage.from(bucket);
  const out: Entry[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await storage.list(prefix, { limit: 1000, offset });
    if (error || !data?.length) break;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      // le cartelle non hanno id
      if (item.id === null) out.push(...(await listAll(bucket, path, depth + 1)));
      else out.push({ path, createdAt: item.created_at ?? null });
    }
    if (data.length < 1000) break;
  }
  return out;
}

async function removeAll(bucket: string, paths: string[]) {
  const storage = createAdminClient().storage.from(bucket);
  for (let i = 0; i < paths.length; i += 100) await storage.remove(paths.slice(i, i + 100));
}

/** Tutti i file di un cliente (chat e foto dei check). */
export async function removeClientFiles(clientId: string) {
  for (const bucket of [CHAT_BUCKET, CHECK_PHOTOS_BUCKET]) {
    const files = await listAll(bucket, clientId);
    await removeAll(bucket, files.map((f) => f.path));
  }
}

export const ORPHAN_UPLOAD_HOURS = 24;

/** Allegati della chat caricati più di 24 ore fa e mai finiti in un messaggio. */
export async function removeOrphanChatUploads(now = Date.now()): Promise<number> {
  const admin = createAdminClient();
  const cutoff = now - ORPHAN_UPLOAD_HOURS * 3600 * 1000;
  const { data: folders } = await admin.storage.from(CHAT_BUCKET).list("", { limit: 1000 });
  let removed = 0;
  for (const f of folders ?? []) {
    if (f.id !== null || !/^[0-9a-f-]{36}$/i.test(f.name)) continue;
    const files = (await listAll(CHAT_BUCKET, f.name)).filter((x) => x.createdAt && Date.parse(x.createdAt) < cutoff);
    if (!files.length) continue;
    // TUTTI i messaggi con allegati, a pagine (Supabase dà al massimo 1000 righe per lettura:
    // prima, oltre i 1000 messaggi, gli allegati dei messaggi esclusi sembravano orfani).
    // Se una lettura non riesce, per questo cliente non si cancella niente.
    const used = new Set<string>();
    let complete = true;
    for (let from = 0; ; from += 1000) {
      const { data: msgs, error } = await admin.from("messages").select("attachments").eq("client_id", f.name).neq("attachments", "[]").order("id").range(from, from + 999);
      if (error) {
        complete = false;
        break;
      }
      for (const m of msgs ?? []) for (const a of (m.attachments ?? []) as Array<{ path?: string }>) if (a.path) used.add(a.path);
      if (!msgs || msgs.length < 1000) break;
    }
    if (!complete) continue;
    const orphans = files.map((x) => x.path).filter((p) => !used.has(p));
    // mai più di qualche file alla volta: un elenco "tutto orfano" è quasi certamente un errore
    if (orphans.length > 50) continue;
    await removeAll(CHAT_BUCKET, orphans);
    removed += orphans.length;
  }
  return removed;
}
