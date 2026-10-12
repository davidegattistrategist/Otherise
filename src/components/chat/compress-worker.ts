/**
 * Worker della compressione video: fa lo stesso lavoro di `runCompression`
 * fuori dalla pagina, così la chat (che si aggiorna da sola) non lo rallenta.
 * Se qualcosa non va risponde "error" e la pagina riprova da sola.
 */
import { runCompression, type WorkerReply, type WorkerRequest } from "./compress-core";

const post = (m: WorkerReply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { file, format, fast } = e.data;
  let last = -1;
  // al massimo un messaggio per punto percentuale
  const progress = (p: number) => {
    const pct = Math.floor(p * 100);
    if (pct !== last) post({ type: "progress", p: (last = pct) / 100 });
  };
  try {
    const result = await runCompression(file, format, progress, undefined, fast);
    post({ type: "done", result }, result?.buffer ? [result.buffer] : []);
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
