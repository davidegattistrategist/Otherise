/**
 * Preparazione degli allegati nel browser: le foto vengono ridotte (lato
 * lungo 1600 px, JPEG) così si caricano in fretta anche col telefono; i
 * video restano com'erano. Il caricamento va diretto allo storage con un
 * link firmato e mostra l'avanzamento.
 */
import { supabaseAnonKey } from "@/lib/supabase/env";

export type Prepared = { blob: Blob; type: string; name: string; width: number | null; height: number | null };

export async function prepareImage(file: File): Promise<Prepared> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    if (file.type === "image/gif") return { blob: file, type: file.type, name: file.name, width: bitmap.width, height: bitmap.height };
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (!blob) throw new Error("conversione non riuscita");
    return { blob, type: "image/jpeg", name: file.name.replace(/\.[^.]+$/, "") + ".jpg", width: w, height: h };
  } catch {
    // formato che il browser non sa leggere (es. HEIC su Chrome): si manda com'è
    return { blob: file, type: file.type || "image/jpeg", name: file.name, width: null, height: null };
  }
}

export async function videoSize(file: File): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      resolve({ width: v.videoWidth || null, height: v.videoHeight || null });
      URL.revokeObjectURL(url);
    };
    v.onerror = () => {
      resolve({ width: null, height: null });
      URL.revokeObjectURL(url);
    };
    v.src = url;
  });
}

/** PUT diretto sul link firmato dello storage, con avanzamento 0–1. */
export function uploadWithProgress(signedUrl: string, blob: Blob, type: string, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("content-type", type);
    xhr.setRequestHeader("x-upsert", "false");
    const anon = supabaseAnonKey();
    if (anon) xhr.setRequestHeader("apikey", anon);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Caricamento non riuscito (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Connessione interrotta durante il caricamento"));
    xhr.send(blob);
  });
}

/**
 * Scarica una foto o un video della chat. Sul telefono apre "Condividi", da
 * cui si sceglie "Salva video" / "Salva immagine" (finisce nelle Foto); se non
 * si può, scarica il file come un normale download.
 */
export async function saveAttachment(url: string, name: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("download");
  await saveBlob(await res.blob(), name);
}

/** Salva un file: sul telefono con "Condividi" (così va in Foto), altrimenti lo scarica. */
export async function saveBlob(blob: Blob, name: string): Promise<void> {
  const file = new File([blob], name || "allegato", { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (mobile && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      // annullato da chi lo usa: va bene così
      if ((e as { name?: string })?.name === "AbortError") return;
      // altrimenti (es. troppo tempo dal tocco) scarichiamo normalmente
    }
  }
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 30_000);
}
