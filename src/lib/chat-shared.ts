/** Tipi e regole della chat condivisi tra server e browser. */
export const CHAT_BUCKET = "chat";

export type ChatAttachment = {
  path: string;
  kind: "image" | "video" | "audio";
  name: string;
  size: number;
  width?: number | null;
  height?: number | null;
  /** durata del vocale in secondi */
  seconds?: number | null;
};

/** Trascrizione di un vocale: pending = in corso, off = trascrizione non attiva. */
export type Transcript = { status: "pending" | "done" | "failed" | "off"; text: string };

export type ChatMessage = {
  id: string;
  mine: boolean;
  senderName: string;
  senderIsStaff: boolean;
  body: string;
  deleted: boolean;
  createdAt: string;
  attachments: Array<ChatAttachment & { url: string | null }>;
  /** solo per i messaggi vocali */
  transcript?: Transcript | null;
};

/** Video: Supabase gratuito accetta file fino a 50 MB (con il piano Pro si può alzare). */
export const MAX_VIDEO_MB = Number(process.env.NEXT_PUBLIC_CHAT_MAX_VIDEO_MB || 50);
export const MAX_IMAGE_MB = 15;
export const MAX_ATTACHMENTS = 6;
export const MAX_AUDIO_MB = 20;
/** Durata massima di un vocale */
export const MAX_VOICE_SECONDS = 5 * 60;

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/3gpp"];
/** Audio dei vocali registrati nell'app (iPhone: mp4, Android e computer: webm o ogg) */
export const AUDIO_TYPES = ["audio/mp4", "audio/webm", "audio/ogg", "audio/mpeg", "audio/aac", "audio/x-m4a", "audio/wav"];

/** "audio/webm;codecs=opus" → "audio/webm" */
export const baseType = (type: string) => type.toLowerCase().split(";")[0].trim();

/** Foto, video o vocali (niente altri file). */
export function attachmentKind(type: string): "image" | "video" | "audio" | null {
  const t = baseType(type);
  if (IMAGE_TYPES.includes(t)) return "image";
  if (VIDEO_TYPES.includes(t)) return "video";
  if (AUDIO_TYPES.includes(t)) return "audio";
  return null;
}

export function sizeError(kind: "image" | "video" | "audio", size: number): string | null {
  if (kind === "audio") return size <= MAX_AUDIO_MB * 1024 * 1024 ? null : "Il vocale è troppo lungo: massimo 5 minuti.";
  const max = (kind === "video" ? MAX_VIDEO_MB : MAX_IMAGE_MB) * 1024 * 1024;
  if (size <= max) return null;
  return kind === "video"
    ? `Il video è troppo pesante (massimo ${MAX_VIDEO_MB} MB, circa 30–60 secondi). Accorcialo o riprendilo a qualità più bassa.`
    : `La foto è troppo pesante (massimo ${MAX_IMAGE_MB} MB).`;
}

/** "1:05" */
export function voiceLength(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
