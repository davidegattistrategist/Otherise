"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CHAT_BUCKET, canUseChat, loadMessages, markChatRead, previewOf } from "@/lib/chat";
import { MAX_ATTACHMENTS, attachmentKind, sizeError, type ChatAttachment, type ChatMessage } from "@/lib/chat-shared";
import { notify, staffRecipients } from "@/lib/notify";
import { deliverPendingEmails } from "@/lib/email";
import { closeDrafts, generateChatDraft, type ReplyDraft } from "@/lib/ai/reply";

const fileId = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 16);
const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic", "image/heif": "heif",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/3gpp": "3gp",
};

export type UploadTicket = { path: string; signedUrl: string; token: string } | { error: string };

/** Prepara il caricamento di un allegato: controlla tipo e peso e restituisce un link di caricamento valido 2 ore. */
export async function prepareUpload(clientId: string, file: { type: string; size: number }): Promise<UploadTicket> {
  await requireUser();
  const supabase = await createClient();
  if (!(await canUseChat(supabase, clientId))) return { error: "Conversazione non trovata." };
  const kind = attachmentKind(file.type);
  if (!kind) return { error: "Si possono mandare solo foto e video." };
  const tooBig = sizeError(kind, file.size);
  if (tooBig) return { error: tooBig };
  const month = new Date().toISOString().slice(0, 7);
  const path = `${clientId}/${month}/${fileId()}.${EXT[file.type.toLowerCase()] ?? "bin"}`;
  const { data, error } = await createAdminClient().storage.from(CHAT_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "Caricamento non disponibile in questo momento. Riprova tra poco." };
  return { path, signedUrl: data.signedUrl, token: data.token };
}

const sendSchema = z.object({
  body: z.string().max(4000),
  attachments: z
    .array(
      z.object({
        path: z.string().min(10).max(200),
        kind: z.enum(["image", "video"]),
        name: z.string().max(200),
        size: z.number().int().nonnegative(),
        width: z.number().int().positive().nullish(),
        height: z.number().int().positive().nullish(),
      }),
    )
    .max(MAX_ATTACHMENTS),
  draftId: z.string().uuid().nullish(),
});

export async function sendMessage(clientId: string, input: { body: string; attachments: ChatAttachment[]; draftId?: string | null }): Promise<{ ok: true; message: ChatMessage } | { ok: false; error: string }> {
  const me = await requireUser();
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Messaggio non valido." };
  const body = parsed.data.body.trim();
  const attachments = parsed.data.attachments;
  if (!body && attachments.length === 0) return { ok: false, error: "Scrivi un messaggio o allega una foto." };
  if (attachments.some((a) => !a.path.startsWith(`${clientId}/`) || a.path.includes(".."))) return { ok: false, error: "Allegato non valido." };

  const supabase = await createClient();
  const client = await canUseChat(supabase, clientId);
  if (!client) return { ok: false, error: "Conversazione non trovata." };
  const { data: row, error } = await supabase
    .from("messages")
    .insert({ client_id: clientId, sender_id: me.id, body, attachments })
    .select("id, created_at")
    .single();
  if (error || !row) return { ok: false, error: "Messaggio non inviato. Controlla la connessione e riprova." };
  await markChatRead(supabase, me.id, clientId);

  // Avviso a chi deve leggere (al massimo uno all'ora per conversazione)
  const hour = new Date().toISOString().slice(0, 13);
  const preview = previewOf(body, attachments);
  const fromClient = me.role === "client";
  const recipients = fromClient ? await staffRecipients(clientId) : client.user_id ? [client.user_id] : [];
  const senderName = fromClient ? `${client.first_name} ${client.last_name}`.trim() : me.fullName.split(" ")[0] || "Il tuo coach";
  await notify(
    recipients
      .filter((r) => r !== me.id)
      .map((r) => ({
        recipient_id: r,
        client_id: clientId,
        kind: "chat",
        title: `Nuovo messaggio da ${senderName}`,
        body: preview,
        link: fromClient ? `/staff/messaggi/${clientId}` : "/cliente/messaggi",
        dedupe_key: `chat:${clientId}:${hour}`,
      })),
  );
  void deliverPendingEmails().catch(() => undefined);
  if (fromClient) {
    // a risposta già inviata al cliente, l'assistente prepara la bozza per lo staff
    after(() => generateChatDraft(clientId).catch(() => undefined));
  } else if (body) {
    await closeDrafts(supabase, { clientId, source: "chat" }, body, me.id, parsed.data.draftId);
  }
  revalidatePath("/staff/messaggi");

  const recent = await loadMessages(clientId, me, { after: new Date(new Date(row.created_at).getTime() - 1000).toISOString() });
  const message = recent.find((m) => m.id === row.id);
  if (!message) return { ok: false, error: "Messaggio inviato, ricarica la pagina per vederlo." };
  return { ok: true, message };
}

export async function deleteMessage(clientId: string, messageId: string): Promise<{ ok: boolean }> {
  const me = await requireUser();
  const supabase = await createClient();
  const { data: msg } = await supabase.from("messages").select("id, sender_id, attachments").eq("id", messageId).eq("client_id", clientId).maybeSingle();
  if (!msg || msg.sender_id !== me.id) return { ok: false };
  const { error } = await supabase.from("messages").update({ deleted_at: new Date().toISOString() }).eq("id", messageId);
  if (error) return { ok: false };
  const paths = ((msg.attachments as ChatAttachment[]) ?? []).map((a) => a.path);
  if (paths.length) await createAdminClient().storage.from(CHAT_BUCKET).remove(paths);
  return { ok: true };
}

/** Lo staff chiede una bozza (o una nuova bozza) di risposta all'assistente. */
export async function requestReplyDraft(clientId: string): Promise<{ ok: true; draft: ReplyDraft | null } | { ok: false; error: string }> {
  const me = await requireUser();
  if (me.role !== "owner" && me.role !== "coach") return { ok: false, error: "Non autorizzato." };
  const supabase = await createClient();
  if (!(await canUseChat(supabase, clientId))) return { ok: false, error: "Conversazione non trovata." };
  return generateChatDraft(clientId, { force: true });
}

/** "Scrivo da zero": la bozza sparisce. */
export async function dismissReplyDraft(clientId: string, draftId: string): Promise<{ ok: boolean }> {
  const me = await requireUser();
  if (me.role !== "owner" && me.role !== "coach") return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from("ai_reply_drafts").update({ status: "dismissed", closed_at: new Date().toISOString() }).eq("id", draftId).eq("client_id", clientId).eq("status", "ready");
  return { ok: !error };
}
