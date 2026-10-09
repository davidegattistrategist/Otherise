import "server-only";
/**
 * Chat tra il cliente e chi lo segue (titolare e collaboratore assegnato).
 * Testo, foto e video: niente audio. Gli allegati stanno nel bucket privato
 * "chat" di Supabase Storage e si vedono con link temporanei.
 */
import { createClient, type ServerSupabase } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";
import { CHAT_BUCKET, type ChatAttachment, type ChatMessage } from "./chat-shared";

export { CHAT_BUCKET };

type Row = { id: string; client_id: string; sender_id: string | null; body: string; attachments: unknown; created_at: string; deleted_at: string | null };

/** Il cliente è visibile a chi è collegato? (passa dai permessi del database) */
export async function canUseChat(supabase: ServerSupabase, clientId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return null;
  const { data } = await supabase.from("clients").select("id, first_name, last_name, user_id, coach_id").eq("id", clientId).maybeSingle();
  return data;
}

/** Messaggi della conversazione (i più recenti, oppure solo quelli dopo `after`), con link agli allegati. */
export async function loadMessages(clientId: string, me: { id: string }, opts: { after?: string | null; limit?: number } = {}) {
  const supabase = await createClient();
  let q = supabase.from("messages").select("id, client_id, sender_id, body, attachments, created_at, deleted_at").eq("client_id", clientId);
  if (opts.after) q = q.gt("created_at", opts.after).order("created_at", { ascending: true }).limit(200);
  else q = q.order("created_at", { ascending: false }).limit(opts.limit ?? 80);
  const { data } = await q;
  const rows = ((data ?? []) as Row[]).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  return toMessages(rows, me.id);
}

async function toMessages(rows: Row[], myId: string): Promise<ChatMessage[]> {
  if (rows.length === 0) return [];
  const admin = createAdminClient();
  const senderIds = [...new Set(rows.map((r) => r.sender_id).filter((x): x is string => !!x))];
  const paths = rows.flatMap((r) => (r.deleted_at ? [] : ((r.attachments as ChatAttachment[]) ?? []).map((a) => a.path)));
  const [{ data: profiles }, signed] = await Promise.all([
    admin.from("profiles").select("id, full_name, role").in("id", senderIds),
    paths.length ? admin.storage.from(CHAT_BUCKET).createSignedUrls(paths, 60 * 60 * 6) : Promise.resolve({ data: [] as Array<{ path: string | null; signedUrl: string | null }> }),
  ]);
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, { name: p.full_name, staff: p.role === "owner" || p.role === "coach" }]));
  const urlOf = new Map((signed.data ?? []).filter((s) => s.path && s.signedUrl).map((s) => [s.path!, s.signedUrl!]));
  return rows.map((r) => ({
    id: r.id,
    mine: r.sender_id === myId,
    senderName: (r.sender_id && nameOf.get(r.sender_id)?.name) || "",
    senderIsStaff: Boolean(r.sender_id && nameOf.get(r.sender_id)?.staff),
    body: r.deleted_at ? "" : r.body,
    deleted: Boolean(r.deleted_at),
    createdAt: r.created_at,
    attachments: r.deleted_at
      ? []
      : ((r.attachments as ChatAttachment[]) ?? []).map((a) => ({ ...a, url: urlOf.get(a.path) ?? null })),
  }));
}

/** Segna come letta la conversazione e le relative notifiche. */
export async function markChatRead(supabase: ServerSupabase, userId: string, clientId: string) {
  const now = new Date().toISOString();
  await Promise.all([
    supabase.from("chat_reads").upsert({ user_id: userId, client_id: clientId, last_read_at: now }),
    supabase.from("notifications").update({ read_at: now }).eq("recipient_id", userId).like("dedupe_key", `chat:${clientId}:%`).is("read_at", null),
  ]);
}

/** Anteprima breve di un messaggio per liste e notifiche. */
export function previewOf(body: string, attachments: ChatAttachment[]) {
  const text = body.trim().replace(/\s+/g, " ");
  if (text) return text.length > 90 ? `${text.slice(0, 88)}…` : text;
  const videos = attachments.filter((a) => a.kind === "video").length;
  const photos = attachments.length - videos;
  if (videos && photos) return "Foto e video";
  if (videos) return videos === 1 ? "Video" : `${videos} video`;
  return photos === 1 ? "Foto" : `${photos} foto`;
}
