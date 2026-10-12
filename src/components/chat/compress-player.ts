/**
 * Compressione "col lettore": invece di scomporre il video fotogramma per
 * fotogramma (lento con i video 4K, perché ogni fotogramma enorme passa dalla
 * memoria), il telefono lo riproduce muto e più veloce del normale con il suo
 * lettore video (lo stesso, ottimizzato, che usa la galleria) e a ogni
 * fotogramma mostrato ne disegna una copia piccola (480p) che va al codificatore.
 * L'audio si copia dal file così com'è.
 *
 * La velocità si regola da sola: si alza finché si riescono a prendere i
 * fotogrammi che servono (24 al secondo) e si abbassa se se ne perdono troppi.
 * Se il lettore si blocca o qualcosa non va restituisce "error" e si passa al
 * metodo classico (compress-core.ts).
 */
import { COMPRESS_FPS, COMPRESS_VIDEO_BITRATE, newOutput, pickAcceleration, targetSize, type CompressFormat, type CompressOutput, type Progress } from "./compress-core";

/** Velocità di riproduzione: da 1× a 8× (si adatta da sola). */
const START_RATE = 2;
const MIN_RATE = 1;
const MAX_RATE = 8;
/** Fotogrammi presi su quelli che servono: sotto questa soglia si rallenta, sopra quella alta si accelera. */
const LOW_FILL = 0.8;
const HIGH_FILL = 0.95;
/** Senza fotogrammi nuovi per tanto tempo il lettore è bloccato: si passa al metodo classico. */
const STALL_MS = 10_000;

type RVFC = (cb: (now: number, meta: { mediaTime: number }) => void) => number;

export function canUsePlayer(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof HTMLVideoElement !== "undefined" &&
    "requestVideoFrameCallback" in HTMLVideoElement.prototype &&
    typeof VideoFrame !== "undefined" &&
    typeof VideoEncoder !== "undefined"
  );
}

export type PlayerStats = { frames: number; expected: number; seconds: number; rate: number };

export async function compressWithPlayer(file: File, format: CompressFormat, onProgress: Progress, signal?: AbortSignal, onStats?: (s: PlayerStats) => void): Promise<CompressOutput | "error"> {
  if (!canUsePlayer()) return "error";
  const started = performance.now();
  const mb = await import("mediabunny");
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  let output: InstanceType<typeof mb.Output> | null = null;
  const cleanup = () => {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
    URL.revokeObjectURL(url);
    input.dispose?.();
  };
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;
    const audio = await input.getPrimaryAudioTrack();
    const audioCodec = audio ? await audio.getCodec() : null;
    // l'audio si copia: deve essere già nel formato giusto, altrimenti metodo classico
    if (audio && audioCodec !== format.audio) return "error";
    const audioConfig = audio ? await audio.getDecoderConfig() : null;
    if (audio && !audioConfig) return "error";
    const first = await track.getFirstTimestamp();

    // il lettore: muto, dentro lo schermo (altrimenti alcuni browser lo fermano) ma invisibile
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("aria-hidden", "true");
    video.preload = "auto";
    Object.assign(video.style, { position: "fixed", right: "0", bottom: "0", width: "2px", height: "2px", opacity: "0.01", pointerEvents: "none", zIndex: "-1" });
    document.body.append(video);
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("metadati non arrivati")), 15_000);
      video.addEventListener("loadedmetadata", () => (clearTimeout(t), resolve()), { once: true });
      video.addEventListener("error", () => (clearTimeout(t), reject(new Error("video non leggibile"))), { once: true });
    });
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Math.max(0.1, (await track.computeDuration()) - first);
    // dimensioni come si vedono (il lettore applica già la rotazione dei video in verticale)
    const size = targetSize(video.videoWidth || track.displayWidth, video.videoHeight || track.displayHeight);
    const acceleration = await pickAcceleration(mb, format, size);
    if (!acceleration) return null;

    output = newOutput(mb, format);
    const videoSource = new mb.VideoSampleSource({ codec: format.video, bitrate: COMPRESS_VIDEO_BITRATE, hardwareAcceleration: acceleration, keyFrameInterval: 4 });
    output.addVideoTrack(videoSource, { frameRate: COMPRESS_FPS });
    const audioSource = audio && audioCodec ? new mb.EncodedAudioPacketSource(audioCodec) : null;
    if (audioSource) output.addAudioTrack(audioSource);
    await output.start();

    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return "error";
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "medium";

    // coda verso il codificatore: il lettore non aspetta, il codificatore lavora dietro
    const queue: VideoFrame[] = [];
    let wake: (() => void) | null = null;
    let ended = false;
    let failure: unknown = null;
    let holding = false;
    const step = 1 / COMPRESS_FPS;
    let lastSlot = -1;
    let captured = 0;
    let lastFrameAt = performance.now();

    const encodeLoop = (async () => {
      for (;;) {
        const frame = queue.shift();
        if (!frame) {
          if (ended) break;
          await new Promise<void>((r) => (wake = r));
          wake = null;
          continue;
        }
        const sample = new mb.VideoSample(frame);
        try {
          await videoSource.add(sample);
        } finally {
          sample.close();
        }
        // la coda si è svuotata: il lettore può ripartire
        if (holding && queue.length < 6) {
          holding = false;
          void video.play().catch(() => undefined);
        }
      }
      videoSource.close();
    })();

    const audioLoop = (async () => {
      if (!audio || !audioSource || !audioConfig) return;
      const sink = new mb.EncodedPacketSink(audio);
      let firstPacket = true;
      for await (const packet of sink.packets()) {
        if (signal?.aborted) throw new Error("annullato");
        const shifted = packet.clone({ timestamp: Math.max(0, packet.timestamp - first) });
        await audioSource.add(shifted, firstPacket ? { decoderConfig: audioConfig as AudioDecoderConfig } : undefined);
        firstPacket = false;
      }
      audioSource.close();
    })();

    // regolazione della velocità ogni secondo
    let rate = START_RATE;
    let windowSlots = 0;
    let windowCaptured = 0;
    let windowStartSlot = 0;

    const captureDone = new Promise<void>((resolve, reject) => {
      const rvfc = (video as unknown as { requestVideoFrameCallback: RVFC }).requestVideoFrameCallback.bind(video);
      const onFrame = (_now: number, meta: { mediaTime: number }) => {
        if (ended || failure) return;
        lastFrameAt = performance.now();
        const t = Math.max(0, meta.mediaTime - first);
        const slot = Math.floor(t / step + 1e-6);
        if (slot > lastSlot) {
          if (lastSlot < 0) windowStartSlot = slot;
          lastSlot = slot;
          try {
            ctx.drawImage(video, 0, 0, size.width, size.height);
            queue.push(new VideoFrame(canvas, { timestamp: Math.round(t * 1e6), duration: Math.round(step * 1e6) }));
            captured++;
            windowCaptured++;
          } catch (e) {
            failure = e;
            reject(e);
            return;
          }
          wake?.();
          // il codificatore è indietro: si mette in pausa il lettore finché recupera
          if (queue.length > 24 && !holding) {
            holding = true;
            video.pause();
          }
          onProgress(Math.min(0.99, t / duration));
        }
        rvfc(onFrame);
      };
      rvfc(onFrame);
      video.addEventListener("ended", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("errore del lettore")), { once: true });
      const timer = setInterval(() => {
        if (ended || failure) return clearInterval(timer);
        if (signal?.aborted) {
          clearInterval(timer);
          reject(new Error("annullato"));
          return;
        }
        // se è finito senza "ended" (capita): ultimo fotogramma oltre la durata
        if (video.ended) {
          clearInterval(timer);
          resolve();
          return;
        }
        if (!holding && !video.paused && performance.now() - lastFrameAt > STALL_MS) {
          clearInterval(timer);
          reject(new Error("lettore bloccato"));
          return;
        }
        // ripresa dopo che il telefono l'ha fermato (app in secondo piano, chiamata…)
        if (!holding && video.paused && !video.ended && document.visibilityState === "visible") {
          lastFrameAt = performance.now();
          void video.play().catch(() => undefined);
        }
        // regola la velocità: quanti fotogrammi presi su quelli che servivano nell'ultimo secondo
        windowSlots = lastSlot - windowStartSlot + 1;
        if (!holding && windowSlots >= 6) {
          const fill = windowCaptured / windowSlots;
          if (fill < LOW_FILL && rate > MIN_RATE) rate = Math.max(MIN_RATE, rate * 0.7);
          else if (fill > HIGH_FILL && rate < MAX_RATE) rate = Math.min(MAX_RATE, rate * 1.25);
          video.playbackRate = rate;
          windowStartSlot = lastSlot + 1;
          windowCaptured = 0;
        }
      }, 1000);
    });

    video.playbackRate = rate;
    await video.play();
    try {
      await captureDone;
    } finally {
      ended = true;
      (wake as (() => void) | null)?.();
    }
    await Promise.all([encodeLoop, audioLoop]);
    const expected = Math.max(1, Math.floor(duration / step));
    onStats?.({ frames: captured, expected, seconds: (performance.now() - started) / 1000, rate });
    // troppi fotogrammi persi (lettore che salta): meglio il metodo classico
    if (captured < expected * 0.5) {
      void output.cancel();
      return "error";
    }
    await output.finalize();
    onProgress(1);
    return { buffer: (output.target as InstanceType<typeof mb.BufferTarget>).buffer, ...size };
  } catch (e) {
    if (output) void output.cancel().catch(() => undefined);
    if (signal?.aborted) return null;
    console.warn("compressione col lettore non riuscita, uso il metodo classico", e);
    return "error";
  } finally {
    cleanup();
  }
}
