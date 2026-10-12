/**
 * Compressione dei video prima dell'invio in chat, come fa WhatsApp: il
 * telefono riduce il video a 720p e a circa 1,2 Mbit/s (H.264 + audio AAC,
 * file .mp4). Un minuto girato col telefono passa da 60–100 MB a circa 10 MB,
 * e diventa un formato che si apre su iPhone, Android e computer.
 *
 * Usa le funzioni video del browser (WebCodecs) tramite la libreria
 * mediabunny, caricata solo quando serve. Se il telefono non ce la fa (browser
 * vecchio, formato strano) restituisce null e si manda l'originale, se sta nel
 * limite di dimensione.
 */

/** Lato corto del video compresso, in pixel (720p). */
export const COMPRESS_SHORT_SIDE = 720;
/** Bitrate del video compresso (circa 9–10 MB al minuto con l'audio, come l'HD di WhatsApp). */
export const COMPRESS_VIDEO_BITRATE = 1_200_000;
/** Sotto questa dimensione il video si manda com'è (se è già un mp4). */
export const COMPRESS_MIN_BYTES = 4 * 1024 * 1024;

export type CompressResult = { file: File; width: number; height: number };

/**
 * Formato di uscita: in produzione sempre mp4 H.264 + AAC (si apre ovunque).
 * WebM/VP9 serve solo alle prove automatiche: il Chromium dei test non ha H.264.
 */
export type CompressFormat = { container: "mp4" | "webm"; video: "avc" | "vp9"; audio: "aac" | "opus" };
export const MP4_H264: CompressFormat = { container: "mp4", video: "avc", audio: "aac" };

/** Il browser sa comprimere video? (WebCodecs) */
export function canCompressVideo(): boolean {
  return typeof window !== "undefined" && typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder !== "undefined" && typeof (window as unknown as { VideoDecoder?: unknown }).VideoDecoder !== "undefined";
}

/** Serve comprimere? I video piccoli già in mp4 restano come sono. */
export function shouldCompress(file: File): boolean {
  return file.size > COMPRESS_MIN_BYTES || !/^video\/mp4/i.test(file.type);
}

/** Dimensioni di uscita: lato corto a 720 (mai ingrandire), numeri pari. */
export function targetSize(width: number, height: number, shortSide = COMPRESS_SHORT_SIDE): { width: number; height: number } {
  const scale = Math.min(1, shortSide / Math.max(1, Math.min(width, height)));
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}

/**
 * Comprime il video. `onProgress` riceve un numero da 0 a 1.
 * Restituisce null se non è possibile o se il risultato non è più leggero.
 */
export async function compressVideo(file: File, onProgress?: (p: number) => void, signal?: AbortSignal, format: CompressFormat = MP4_H264): Promise<CompressResult | null> {
  if (!canCompressVideo()) return null;
  try {
    const mb = await import("mediabunny");
    const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;
    const size = targetSize(track.displayWidth, track.displayHeight);
    if (!(await mb.canEncodeVideo(format.video, { width: size.width, height: size.height, bitrate: COMPRESS_VIDEO_BITRATE }))) return null;
    const hadAudio = Boolean(await input.getPrimaryAudioTrack());
    const output = new mb.Output({ format: format.container === "mp4" ? new mb.Mp4OutputFormat({ fastStart: "in-memory" }) : new mb.WebMOutputFormat(), target: new mb.BufferTarget() });
    const conversion = await mb.Conversion.init({
      input,
      output,
      tracks: "primary",
      // basta indicare il lato corto: l'altro segue le proporzioni (anche per i video in verticale)
      video: { codec: format.video, ...(track.displayWidth <= track.displayHeight ? { width: size.width } : { height: size.height }), bitrate: COMPRESS_VIDEO_BITRATE, frameRate: 30 },
      // l'audio AAC del telefono si copia com'è; altrimenti si converte
      audio: { codec: format.audio },
    });
    // senza video utilizzabile non ha senso: si manda l'originale
    if (!conversion.isValid || !conversion.utilizedTracks.some((t) => t.isVideoTrack())) return null;
    // mai un video muto: se l'audio non si può tenere, meglio l'originale
    if (hadAudio && !conversion.utilizedTracks.some((t) => t.isAudioTrack())) return null;
    conversion.onProgress = (p) => onProgress?.(Math.max(0, Math.min(1, p)));
    const abort = () => void conversion.cancel();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      await conversion.execute();
    } finally {
      signal?.removeEventListener("abort", abort);
    }
    const buffer = (output.target as InstanceType<typeof mb.BufferTarget>).buffer;
    if (!buffer || buffer.byteLength === 0 || buffer.byteLength >= file.size) return null;
    const name = file.name.replace(/\.[^.]+$/, "") + "." + format.container;
    return { file: new File([buffer], name, { type: `video/${format.container}` }), ...size };
  } catch (e) {
    if (signal?.aborted) return null;
    console.warn("compressione video non riuscita", e);
    return null;
  }
}
