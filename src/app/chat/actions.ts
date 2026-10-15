"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CHAT_BUCKET, canUseChat, loadMessages, markChatRead, previewOf } from "@/lib/chat";
import { MAX_ATTACHMENTS, MAX_VOICE_SECONDS, attachmentKind, baseType, sizeError, type ChatAttachment, type ChatMessage } from "@/lib/chat-shared";
import { startTranscript, transcribeMessage } from "@/lib/transcribe";
import { notify, pushLater, staffRecipients } from "@/lib/notify";
import { sendPush } from "@/lib/push";
import { emailsLater } from "@/lib/email";
import { closeDrafts, generateChatDraft, type ReplyDraft } from "@/lib/ai/reply";

const fileId = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 16);
const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic", "image/heif": "heif",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/3gpp": "3gp",
  "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/aac": "aac", "audio/wav": "wav",
};

export type UploadTicket = { path: string; signedUrl: string; token: string } | { error: string };

/** Prepara il caricamento di un allegato: controlla tipo e peso e restituisce un link di caricamento valido 2 ore. */
export async function prepareUpload(clientId: string, file: { type: string; size: number }): Promise<UploadTicket> {
  await requireUser();
  const supabase = await createClient();
  if (!(await canUseChat(supabase, clientId))) return { error: "Conversazione non trovata." };
  const kind = attachmentKind(file.type);
  if (!kind) return { error: "Si possono mandare solo foto, video e vocali." };
  const tooBig = sizeError(kind, file.size);
  if (tooBig) return { error: tooBig };
  const month = new Date().toISOString().slice(0, 7);
  const path = `${clientId}/${month}/${fileId()}.${EXT[baseType(file.type)] ?? "bin"}`;
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
        kind: z.enum(["image", "video", "audio"]),
        name: z.string().max(200),
        size: z.number().int().nonnegative(),
        width: z.number().int().positive().nullish(),
        height: z.number().int().positive().nullish(),
        seconds: z.number().nonnegative().max(MAX_VOICE_SECONDS + 30).nullish(),
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
  const voice = attachments.some((a) => a.kind === "audio");
  if (voice) await startTranscript(row.id, clientId);
  await markChatRead(supabase, me.id, clientId);

  // Traccia per le email a chi non ha le notifiche sul telefono (al massimo una all'ora per conversazione):
  // non compare nella campanella, i messaggi da leggere li conta il numerino rosso di Messaggi
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
    { push: false },
  );
  // la push invece parte per ogni messaggio (sul telefono si sostituiscono a vicenda)
  const pushTo = recipients.filter((r) => r !== me.id);
  if (pushTo.length) {
    await pushLater(() => sendPush(pushTo, { title: fromClient ? senderName : `Messaggio da ${senderName}`, body: preview, url: fromClient ? `/staff/messaggi/${clientId}` : "/cliente/messaggi", tag: `chat:${clientId}` }));
  }
  await emailsLater();
  if (fromClient) {
    // a risposta già inviata al cliente: prima la trascrizione del vocale, poi la bozza per lo staff
    after(async () => {
      if (voice) await transcribeMessage(row.id);
      await generateChatDraft(clientId).catch(() => undefined);
    });
  } else if (voice) {
    after(() => transcribeMessage(row.id));
  }
  if (!fromClient && body) {
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
