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

import { canUsePlayer, compressWithPlayer, type PlayerStats } from "./compress-player";
import { Canceled, MP4_H264, canCompressVideo, runCompression, type CompressFormat, type CompressMethod, type CompressOutput, type CompressResult, type Progress, type WorkerReply, type WorkerRequest } from "./compress-core";

export { COMPRESS_FPS, COMPRESS_MIN_BYTES, COMPRESS_SHORT_SIDE, COMPRESS_VIDEO_BITRATE, MP4_H264, canCompressVideo, shouldCompress, targetSize } from "./compress-core";
export type { CompressFormat, CompressMethod, CompressResult } from "./compress-core";

/** Il metodo più veloce su questo telefono, scoperto al primo video (vale 30 giorni). */
const METHOD_KEY = "otherise:video-method";
const METHOD_DAYS = 30;
/** Quanto dura la prova di ogni metodo e da che lunghezza di video vale la pena farla. */
const PROBE_MS = 2500;
const PROBE_MIN_SECONDS = 20;

export const METHOD_LABELS: Record<CompressMethod, string> = { player: "con il lettore", page: "con la decodifica", worker: "con la decodifica in parallelo" };

function savedMethod(): CompressMethod | null {
  try {
    const v = JSON.parse(localStorage.getItem(METHOD_KEY) ?? "null") as { method?: CompressMethod; at?: number } | null;
    if (v?.method && v.at && Date.now() - v.at < METHOD_DAYS * 864e5) return v.method;
  } catch {}
  return null;
}
function saveMethod(method: CompressMethod | null, speeds?: Record<string, number>) {
  try {
    if (method) localStorage.setItem(METHOD_KEY, JSON.stringify({ method, at: Date.now(), speeds }));
    else localStorage.removeItem(METHOD_KEY);
  } catch {}
}

function availableMethods(): CompressMethod[] {
  const out: CompressMethod[] = ["page"];
  if (canUsePlayer()) out.push("player");
  if (typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined") out.push("worker");
  return out;
}

async function runMethod(m: CompressMethod, file: File, format: CompressFormat, progress: Progress, signal: AbortSignal | undefined, fast: boolean, onStats?: (s: PlayerStats) => void): Promise<CompressOutput | "error"> {
  if (m === "player") return compressWithPlayer(file, format, progress, signal, onStats);
  if (m === "worker") return inWorker(file, format, progress, signal, fast);
  try {
    return await runCompression(file, format, progress, signal, fast);
  } catch (e) {
    if (signal?.aborted || e instanceof Canceled) return null;
    console.warn("compressione nella pagina non riuscita", e);
    return "error";
  }
}

/**
 * Prova ogni metodo per qualche secondo e misura quanta parte di video riduce
 * in un secondo. L'ultimo provato, se è il più veloce, non si ferma: continua
 * fino alla fine e il suo risultato è già quello buono (niente tempo perso).
 */
async function probeMethods(
  file: File,
  format: CompressFormat,
  methods: CompressMethod[],
  signal: AbortSignal | undefined,
  fast: boolean,
  progress: Progress,
  onStats?: (s: PlayerStats) => void,
): Promise<{ order: CompressMethod[]; speeds: Record<string, number>; done?: { method: CompressMethod; result: CompressOutput | "error" } }> {
  const speeds: Record<string, number> = {};
  for (let i = 0; i < methods.length; i++) {
    const m = methods[i];
    const lastOne = i === methods.length - 1;
    if (signal?.aborted) break;
    const ctrl = new AbortController();
    const stop = () => ctrl.abort();
    signal?.addEventListener("abort", stop, { once: true });
    let firstAt = 0;
    let firstP = 0;
    let lastAt = 0;
    let lastP = 0;
    let keep = false;
    const onP: Progress = (p) => {
      if (keep) return progress(p);
      const now = performance.now();
      if (p <= 0) return;
      if (!firstAt) {
        firstAt = now;
        firstP = p;
      }
      lastAt = now;
      lastP = p;
    };
    const speed = () => (lastAt > firstAt ? (lastP - firstP) / ((lastAt - firstAt) / 1000) : 0);
    const timer = setTimeout(() => {
      speeds[m] = speed();
      const best = Math.max(0, ...methods.slice(0, i).map((x) => speeds[x] ?? 0));
      if (lastOne && speeds[m] > 0 && speeds[m] * (m === "page" ? 1.15 : 1) >= best) {
        keep = true;
        progress(lastP);
      } else ctrl.abort();
    }, PROBE_MS);
    const result = await runMethod(m, file, format, onP, ctrl.signal, fast, onStats).catch(() => "error" as const);
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
    if (speeds[m] === undefined) speeds[m] = speed();
    if (keep && !signal?.aborted) {
      const order = [m, ...methods.filter((x) => x !== m).sort((a, b) => (speeds[b] ?? 0) - (speeds[a] ?? 0))];
      return { order, speeds, done: { method: m, result } };
    }
  }
  // a parità (±15%) meglio la decodifica: il lettore all'inizio va più veloce e poi rallenta
  const score = (m: CompressMethod) => (speeds[m] ?? 0) * (m === "page" ? 1.15 : 1);
  const order = [...methods].sort((a, b) => score(b) - score(a));
  return { order, speeds };
}

/**
 * Comprime il video. `onProgress` riceve un numero da 0 a 1 (al massimo un
 * aggiornamento per punto percentuale, così la pagina non si ridisegna a ogni
 * fotogramma). Restituisce null se non è possibile o se il risultato non è più leggero.
 *
 * Ci sono tre metodi (lettore del telefono, decodifica nella pagina, decodifica
 * in un worker) e quale sia il più veloce dipende dal telefono: al primo video
 * abbastanza lungo l'app li prova per qualche secondo ciascuno, usa il migliore
 * e se lo ricorda; se un metodo non va, passa da solo al successivo.
 */
export async function compressVideo(
  file: File,
  onProgress?: Progress,
  signal?: AbortSignal,
  format: CompressFormat = MP4_H264,
  options: { fast?: boolean; worker?: boolean; player?: boolean; method?: CompressMethod; onStats?: (s: PlayerStats) => void } = {},
): Promise<CompressResult | null> {
  if (!canCompressVideo()) return null;
  let last = -1;
  const progress: Progress = (p) => {
    const pct = Math.floor(Math.max(0, Math.min(1, p)) * 100);
    if (pct === last) return;
    last = pct;
    onProgress?.(pct / 100);
  };
  const fast = options.fast !== false;
  try {
    let methods = availableMethods().filter((m) => (m !== "player" || options.player !== false) && (m !== "worker" || options.worker !== false));
    if (options.method) methods = methods.includes(options.method) ? [options.method] : [];
    const saved = options.method ? null : savedMethod();
    let order: CompressMethod[];
    if (saved && methods.includes(saved)) {
      order = [saved, ...methods.filter((m) => m !== saved)];
    } else if (methods.length > 1 && (await videoSeconds(file)) >= PROBE_MIN_SECONDS) {
      // l'ultimo provato è quello che potrebbe continuare: la decodifica nella pagina, di solito la più veloce
      const probeOrder = [...methods.filter((m) => m !== "page"), ...methods.filter((m) => m === "page")];
      const probe = await probeMethods(file, format, probeOrder, signal, fast, progress, options.onStats);
      if (signal?.aborted) return null;
      order = probe.order;
      if ((probe.speeds[order[0]] ?? 0) > 0) saveMethod(order[0], probe.speeds);
      if (probe.done && probe.done.result !== "error") {
        const out = finish(probe.done.result, file, format);
        return out ? { ...out, method: probe.done.method } : null;
      }
      if (probe.done) order = order.filter((m) => m !== probe.done!.method);
    } else {
      // video corto: il primo che va (la prova costerebbe più del guadagno)
      order = ["player", "page", "worker"].filter((m) => methods.includes(m as CompressMethod)) as CompressMethod[];
    }
    for (const m of order) {
      last = -1;
      progress(0);
      const res = await runMethod(m, file, format, progress, signal, fast, options.onStats);
      if (signal?.aborted) return null;
      if (res !== "error") {
        const out = finish(res, file, format);
        return out ? { ...out, method: m } : null;
      }
      // il metodo ricordato non va più: si riprova la prossima volta
      if (m === saved) saveMethod(null);
    }
    return null;
  } catch (e) {
    if (signal?.aborted || e instanceof Canceled) return null;
    console.warn("compressione video non riuscita", e);
    return null;
  }
}

/** Durata del video in secondi (0 se non si riesce a leggere). */
async function videoSeconds(file: File): Promise<number> {
  try {
    const mb = await import("mediabunny");
    const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    try {
      return await input.computeDuration();
    } finally {
      input.dispose?.();
    }
  } catch {
    return 0;
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

