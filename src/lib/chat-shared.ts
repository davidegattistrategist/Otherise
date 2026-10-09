/** Tipi e regole della chat condivisi tra server e browser. */
export const CHAT_BUCKET = "chat";

export type ChatAttachment = {
  path: string;
  kind: "image" | "video";
  name: string;
  size: number;
  width?: number | null;
  height?: number | null;
};

export type ChatMessage = {
  id: string;
  mine: boolean;
  senderName: string;
  senderIsStaff: boolean;
  body: string;
  deleted: boolean;
  createdAt: string;
  attachments: Array<ChatAttachment & { url: string | null }>;
};

/** Video: Supabase gratuito accetta file fino a 50 MB (con il piano Pro si può alzare). */
export const MAX_VIDEO_MB = Number(process.env.NEXT_PUBLIC_CHAT_MAX_VIDEO_MB || 50);
export const MAX_IMAGE_MB = 15;
export const MAX_ATTACHMENTS = 6;

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/3gpp"];

/** Foto o video ammessi (niente audio né altri file). */
export function attachmentKind(type: string): "image" | "video" | null {
  const t = type.toLowerCase();
  if (IMAGE_TYPES.includes(t)) return "image";
  if (VIDEO_TYPES.includes(t)) return "video";
  return null;
}

export function sizeError(kind: "image" | "video", size: number): string | null {
  const max = (kind === "video" ? MAX_VIDEO_MB : MAX_IMAGE_MB) * 1024 * 1024;
  if (size <= max) return null;
  return kind === "video"
    ? `Il video è troppo pesante (massimo ${MAX_VIDEO_MB} MB, circa 30–60 secondi). Accorcialo o riprendilo a qualità più bassa.`
    : `La foto è troppo pesante (massimo ${MAX_IMAGE_MB} MB).`;
}
