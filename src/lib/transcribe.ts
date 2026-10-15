import "server-only";
/**
 * Trascrizione dei messaggi vocali della chat.
 *
 * Non usa l'assistente AI (Anthropic): usa un servizio di trascrizione a
 * basso costo, Groq con il modello Whisper (circa 0,04 $ per ora di audio).
 * Chiave: GROQ_API_KEY. Senza chiave i vocali funzionano lo stesso, solo
 * senza trascrizione (stato "off").
 * Il testo resta nella tabella message_transcripts: lo vedono il cliente e
 * lo staff che lo segue, e lo usano le bozze di risposta.
 */
import { createAdminClient } from "./supabase/admin";
import { CHAT_BUCKET, baseType, type ChatAttachment } from "./chat-shared";

const BASE = () => (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, "");
const MODEL = () => process.env.GROQ_TRANSCRIBE_MODEL || "whisper-large-v3-turbo";

export const transcriptionEnabled = () => Boolean(process.env.GROQ_API_KEY);

const FILE_EXT: Record<string, string> = { "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/aac": "aac", "audio/wav": "wav" };

const typeFromPath = (path: string) => {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return Object.entries(FILE_EXT).find(([, e]) => e === ext)?.[0] ?? "audio/mp4";
};

/** Trascrizioni al giorno per persona (dettatura e vocali insieme): un tetto alla spesa, non al lavoro normale. */
export const TRANSCRIPTIONS_PER_DAY = { client: 40, staff: 200 } as const;

/**
 * Conta una trascrizione per la persona; false = per oggi ha raggiunto il
 * tetto. Se il conteggio non è disponibile (database non aggiornato) non blocca.
 */
export async function takeTranscriptionQuota(userId: string, staff: boolean): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("use_transcription", { uid: userId, max_per_day: staff ? TRANSCRIPTIONS_PER_DAY.staff : TRANSCRIPTIONS_PER_DAY.client });
  if (error) return true;
  return data !== false;
}

/** Manda l'audio al servizio di trascrizione e restituisce il testo. */
export async function transcribeAudio(audio: Blob, type: string): Promise<string> {
  const form = new FormData();
  const t = baseType(type);
  form.append("file", new File([audio], `vocale.${FILE_EXT[t] ?? "m4a"}`, { type: t }));
  form.append("model", MODEL());
  form.append("language", "it");
  form.append("response_format", "json");
  form.append("temperature", "0");
  const res = await fetch(`${BASE()}/audio/transcriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Trascrizione non riuscita (${res.status})`);
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}

/** Segna come "in corso" i vocali di un messaggio appena inviato (prima di rispondere al browser). */
export async function startTranscript(messageId: string, clientId: string) {
  await createAdminClient()
    .from("message_transcripts")
    .upsert({ message_id: messageId, client_id: clientId, status: transcriptionEnabled() ? "pending" : "off" }, { onConflict: "message_id" });
}

/** Trascrive i vocali di un messaggio e salva il testo. Non lancia errori. */
export async function transcribeMessage(messageId: string): Promise<string | null> {
  const admin = createAdminClient();
  if (!transcriptionEnabled()) return null;
  try {
    const { data: msg } = await admin.from("messages").select("id, client_id, sender_id, attachments").eq("id", messageId).maybeSingle();
    const audios = ((msg?.attachments as ChatAttachment[] | null) ?? []).filter((a) => a.kind === "audio");
    if (!msg || !audios.length) return null;
    // tetto giornaliero di chi ha mandato il vocale: oltre, il vocale resta senza testo
    if (msg.sender_id) {
      const { data: sender } = await admin.from("profiles").select("role").eq("id", msg.sender_id).maybeSingle();
      if (!(await takeTranscriptionQuota(msg.sender_id, sender?.role === "owner" || sender?.role === "coach"))) {
        await admin.from("message_transcripts").update({ status: "off", updated_at: new Date().toISOString() }).eq("message_id", msg.id);
        return null;
      }
    }
    const texts: string[] = [];
    for (const a of audios) {
      const { data: file, error } = await admin.storage.from(CHAT_BUCKET).download(a.path);
      if (error || !file) throw new Error("Audio non trovato");
      texts.push(await transcribeAudio(file, file.type || typeFromPath(a.path)));
    }
    const text = texts.filter(Boolean).join("\n").slice(0, 8000);
    await admin.from("message_transcripts").upsert({ message_id: msg.id, client_id: msg.client_id, status: "done", text, updated_at: new Date().toISOString() }, { onConflict: "message_id" });
    return text;
  } catch (e) {
    console.error("transcribeMessage", e);
    await admin.from("message_transcripts").update({ status: "failed", updated_at: new Date().toISOString() }).eq("message_id", messageId);
    return null;
  }
}
