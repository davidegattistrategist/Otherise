/**
 * Compressione dei video prima dell'invio in chat, come fa WhatsApp: il
 * telefono riduce il video a 480p e a circa 0,6 Mbit/s (H.264 + audio AAC,
 * file .mp4). Un minuto girato col telefono passa da 60–100 MB a circa 5 MB,
 * e diventa un formato che si apre su iPhone, Android e computer.
 *
 * Usa le funzioni video del browser (WebCodecs) tramite la libreria
 * mediabunny, caricata solo quando serve. Percorso veloce (`fastCompress`):
 * i fotogrammi in più si scartano PRIMA di ridimensionarli, ogni fotogramma
 * tenuto si ridimensiona con un solo disegno (niente passaggi intermedi, che
 * su un video 4K costavano tre disegni a piena risoluzione), la rotazione resta
 * un'indicazione nel file e l'audio si copia senza toccarlo. Se il percorso
 * veloce non si può usare (audio in un formato diverso) si passa alla
 * conversione completa di mediabunny. Se il telefono non ce la fa (browser
 * vecchio, formato strano) restituisce null e si manda l'originale, se sta nel
 * limite di dimensione.
 */

import { Canceled, MP4_H264, canCompressVideo, runCompression, type CompressFormat, type CompressOutput, type CompressResult, type Progress, type WorkerReply, type WorkerRequest } from "./compress-core";

export { COMPRESS_FPS, COMPRESS_MIN_BYTES, COMPRESS_SHORT_SIDE, COMPRESS_VIDEO_BITRATE, MP4_H264, canCompressVideo, shouldCompress, targetSize } from "./compress-core";
export type { CompressFormat, CompressResult } from "./compress-core";

/**
 * Comprime il video. `onProgress` riceve un numero da 0 a 1 (al massimo un
 * aggiornamento per punto percentuale, così la pagina non si ridisegna a ogni
 * fotogramma). Restituisce null se non è possibile o se il risultato non è più leggero.
 *
 * Il lavoro si fa in un "worker" (un processo a parte del browser), così la
 * pagina della chat non lo rallenta; se il worker non parte si fa nella pagina.
 */
export async function compressVideo(file: File, onProgress?: Progress, signal?: AbortSignal, format: CompressFormat = MP4_H264, options: { fast?: boolean; worker?: boolean } = {}): Promise<CompressResult | null> {
  if (!canCompressVideo()) return null;
  let last = -1;
  const progress: Progress = (p) => {
    const pct = Math.floor(Math.max(0, Math.min(1, p)) * 100);
    if (pct === last) return;
    last = pct;
    onProgress?.(pct / 100);
  };
  try {
    if (options.worker !== false && typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined") {
      const viaWorker = await inWorker(file, format, progress, signal, options.fast !== false);
      if (viaWorker !== "error") return finish(viaWorker, file, format);
    }
    if (signal?.aborted) return null;
    return finish(await runCompression(file, format, progress, signal, options.fast !== false), file, format);
  } catch (e) {
    if (signal?.aborted || e instanceof Canceled) return null;
    console.warn("compressione video non riuscita", e);
    return null;
  }
}


function inWorker(file: File, format: CompressFormat, onProgress: Progress, signal: AbortSignal | undefined, fast: boolean): Promise<CompressOutput | "error"> {
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./compress-worker.ts", import.meta.url), { type: "module" });
    } catch {
      resolve("error");
      return;
    }
    let settled = false;
    const end = (v: CompressOutput | "error") => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      resolve(v);
    };
    const abort = () => end(null);
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = (e: MessageEvent<WorkerReply>) => {
      const m = e.data;
      if (m.type === "progress") onProgress(m.p);
      else if (m.type === "done") end(m.result);
      else {
        console.warn("compressione nel worker non riuscita, riprovo nella pagina", m.message);
        end("error");
      }
    };
    worker.onerror = () => end("error");
    worker.onmessageerror = () => end("error");
    worker.postMessage({ file, format, fast } satisfies WorkerRequest);
  });
}


function finish(res: CompressOutput, file: File, format: CompressFormat): CompressResult | null {
  if (!res?.buffer || res.buffer.byteLength === 0 || res.buffer.byteLength >= file.size) return null;
  const name = file.name.replace(/\.[^.]+$/, "") + "." + format.container;
  return { file: new File([res.buffer], name, { type: `video/${format.container}` }), width: res.width, height: res.height };
}

