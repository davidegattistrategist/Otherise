/**
 * Il cuore della compressione video (vedi compress-video.ts): gira nel worker
 * (compress-worker.ts) o, se il worker non parte, nella pagina. Qui niente
 * riferimenti al worker, così il worker non carica sé stesso.
 */
/** Lato corto del video compresso, in pixel (480p come WhatsApp: si vede bene la tecnica e pesa poco). */
export const COMPRESS_SHORT_SIDE = 480;
/** Bitrate del video compresso (circa 5 MB al minuto con l'audio). */
export const COMPRESS_VIDEO_BITRATE = 600_000;
/** Fotogrammi al secondo: 24 bastano per vedere un esercizio e il telefono ne codifica meno (più veloce). */
export const COMPRESS_FPS = 24;
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

/** Dimensioni di uscita: lato corto a COMPRESS_SHORT_SIDE (mai ingrandire), numeri pari. */
export function targetSize(width: number, height: number, shortSide = COMPRESS_SHORT_SIDE): { width: number; height: number } {
  const scale = Math.min(1, shortSide / Math.max(1, Math.min(width, height)));
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}


type Mb = typeof import("mediabunny");
export type Progress = (p: number) => void;

export class Canceled extends Error {}

export type CompressOutput = { buffer: ArrayBuffer | null; width: number; height: number } | null;
export type WorkerRequest = { file: File; format: CompressFormat; fast: boolean };
export type WorkerReply = { type: "progress"; p: number } | { type: "done"; result: CompressOutput } | { type: "error"; message: string };

/** Il cuore della compressione (nella pagina o nel worker): prima il percorso veloce, poi quello completo. */
export async function runCompression(file: File, format: CompressFormat, onProgress: Progress, signal?: AbortSignal, fast = true): Promise<CompressOutput> {
  const mb = await import("mediabunny");
  if (fast) {
    const res = await fastCompress(mb, file, format, onProgress, signal);
    if (res !== undefined) return res;
  }
  return fullConversion(mb, file, format, onProgress, signal);
}

function newOutput(mb: Mb, format: CompressFormat) {
  return new mb.Output({ format: format.container === "mp4" ? new mb.Mp4OutputFormat({ fastStart: "in-memory" }) : new mb.WebMOutputFormat(), target: new mb.BufferTarget() });
}

/**
 * Percorso veloce. Restituisce undefined se non si può usare (si passa alla
 * conversione completa), null se il video non si può comprimere.
 */
async function fastCompress(mb: Mb, file: File, format: CompressFormat, onProgress: Progress, signal?: AbortSignal) {
  if (typeof OffscreenCanvas === "undefined" && typeof document === "undefined") return undefined;
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) return null;
    if (!(await video.canDecode())) return null;
    const audio = await input.getPrimaryAudioTrack();
    // l'audio si copia com'è: serve un formato che il file di uscita può contenere
    const audioCodec = audio ? await audio.getCodec() : null;
    if (audio && audioCodec !== format.audio) return undefined;
    const audioConfig = audio ? await audio.getDecoderConfig() : null;
    if (audio && !audioConfig) return undefined;

    const size = targetSize(video.displayWidth, video.displayHeight);
    const acceleration = await pickAcceleration(mb, format, size);
    if (!acceleration) return null;

    const rotation = await video.getRotation();
    const first = await video.getFirstTimestamp();
    const duration = Math.max(0.001, (await video.computeDuration()) - first);

    const output = newOutput(mb, format);
    const videoSource = new mb.VideoSampleSource({ codec: format.video, bitrate: COMPRESS_VIDEO_BITRATE, hardwareAcceleration: acceleration, keyFrameInterval: 4 });
    // la rotazione dei video in verticale resta un'indicazione nel file: niente fotogrammi da girare
    output.addVideoTrack(videoSource, { rotation, frameRate: COMPRESS_FPS });
    const audioSource = audio && audioCodec ? new mb.EncodedAudioPacketSource(audioCodec) : null;
    if (audioSource) output.addAudioTrack(audioSource);
    await output.start();

    const check = () => {
      if (signal?.aborted) throw new Canceled();
    };

    const pumpVideo = async () => {
      const sink = new mb.VideoSampleSink(video);
      const step = 1 / COMPRESS_FPS;
      let lastSlot = -1;
      let canvas: OffscreenCanvas | HTMLCanvasElement | null = null;
      let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;
      let w = 0;
      let h = 0;
      for await (const sample of sink.samples()) {
        try {
          check();
          // fotogrammi in più rispetto ai 24 al secondo: si scartano subito, senza disegnarli
          const slot = Math.floor((sample.timestamp - first) / step + 1e-6);
          if (slot <= lastSlot) continue;
          lastSlot = slot;
          const frame = sample.toVideoFrame();
          try {
            if (!canvas) {
              // dimensioni del fotogramma prima della rotazione (la rotazione resta nel file)
              ({ width: w, height: h } = targetSize(frame.displayWidth, frame.displayHeight));
              canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
              ctx = canvas.getContext("2d", { alpha: false }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
              if (!ctx) throw new Error("canvas 2d non disponibile");
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = "medium";
            }
            ctx!.drawImage(frame, 0, 0, w, h);
          } finally {
            frame.close();
          }
          const timestamp = Math.max(0, sample.timestamp - first);
          const out = new mb.VideoSample(new VideoFrame(canvas, { timestamp: Math.round(timestamp * 1e6), duration: Math.round(step * 1e6) }));
          try {
            await videoSource.add(out);
          } finally {
            out.close();
          }
          onProgress(Math.min(0.99, (timestamp + step) / duration));
        } finally {
          sample.close();
        }
      }
      videoSource.close();
      return { width: w, height: h };
    };

    const pumpAudio = async () => {
      if (!audio || !audioSource || !audioConfig) return;
      const sink = new mb.EncodedPacketSink(audio);
      let firstPacket = true;
      for await (const packet of sink.packets()) {
        check();
        const shifted = packet.clone({ timestamp: Math.max(0, packet.timestamp - first) });
        await audioSource.add(shifted, firstPacket ? { decoderConfig: audioConfig as AudioDecoderConfig } : undefined);
        firstPacket = false;
      }
      audioSource.close();
    };

    try {
      const [dims] = await Promise.all([pumpVideo(), pumpAudio()]);
      if (!dims.width) return null;
      await output.finalize();
      onProgress(1);
      return { buffer: (output.target as InstanceType<Mb["BufferTarget"]>).buffer, ...rotatedSize(dims, rotation) };
    } catch (e) {
      void output.cancel();
      throw e;
    }
  } finally {
    input.dispose?.();
  }
}

/** Meglio il chip video del telefono (molto più veloce); se non c'è, va bene anche il resto. */
async function pickAcceleration(mb: Mb, format: CompressFormat, size: { width: number; height: number }) {
  const base = { width: size.width, height: size.height, bitrate: COMPRESS_VIDEO_BITRATE, frameRate: COMPRESS_FPS };
  if (await mb.canEncodeVideo(format.video, { ...base, hardwareAcceleration: "prefer-hardware" })) return "prefer-hardware" as const;
  if (await mb.canEncodeVideo(format.video, base)) return "no-preference" as const;
  return null;
}

/** Dimensioni come si vedono (dopo la rotazione). */
function rotatedSize(d: { width: number; height: number }, rotation: number) {
  return rotation % 180 === 0 ? d : { width: d.height, height: d.width };
}

/** Conversione completa di mediabunny (più lenta): serve quando il percorso veloce non si può usare. */
async function fullConversion(mb: Mb, file: File, format: CompressFormat, onProgress: Progress, signal?: AbortSignal) {
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) return null;
  const size = targetSize(track.displayWidth, track.displayHeight);
  const acceleration = await pickAcceleration(mb, format, size);
  if (!acceleration) return null;
  const hadAudio = Boolean(await input.getPrimaryAudioTrack());
  const output = newOutput(mb, format);
  const conversion = await mb.Conversion.init({
    input,
    output,
    tracks: "primary",
    // basta indicare il lato corto: l'altro segue le proporzioni (anche per i video in verticale)
    video: { codec: format.video, ...(track.displayWidth <= track.displayHeight ? { width: size.width } : { height: size.height }), bitrate: COMPRESS_VIDEO_BITRATE, frameRate: COMPRESS_FPS, hardwareAcceleration: acceleration },
    // l'audio AAC del telefono si copia com'è; altrimenti si converte
    audio: { codec: format.audio },
  });
  // senza video utilizzabile non ha senso: si manda l'originale
  if (!conversion.isValid || !conversion.utilizedTracks.some((t) => t.isVideoTrack())) return null;
  // mai un video muto: se l'audio non si può tenere, meglio l'originale
  if (hadAudio && !conversion.utilizedTracks.some((t) => t.isAudioTrack())) return null;
  conversion.onProgress = (p) => onProgress(p);
  const abort = () => void conversion.cancel();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    await conversion.execute();
  } finally {
    signal?.removeEventListener("abort", abort);
  }
  return { buffer: (output.target as InstanceType<Mb["BufferTarget"]>).buffer, ...size };
}

