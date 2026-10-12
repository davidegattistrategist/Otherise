"use client";

/**
 * Foto dei check. Lo staff le carica tutte insieme dalla galleria del telefono
 * con un solo tocco: il telefono le riduce un po' (lato lungo 2560 px, JPEG di
 * alta qualità) e così spariscono anche i dati nascosti che le appesantiscono
 * (posizione GPS, modello del telefono…); in più prepara una miniatura per le
 * griglie. Lo staff e il cliente le guardano a tutto schermo e le possono salvare.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_PHOTOS_PER_UPLOAD, PHOTO_LONG_SIDE, PHOTO_QUALITY, THUMB_LONG_SIDE, type CheckPhoto } from "@/lib/check-photos-shared";
import { deleteCheckPhoto, preparePhotoUploads, saveCheckPhotos } from "@/app/staff/clienti/[id]/check/actions";
import { saveAttachment, uploadWithProgress } from "./chat/media";
import { IconArrowLeft, IconArrowRight, IconDownload, IconPhoto, IconTrash, IconX } from "./icons";
import { buttonClass, cx } from "./ui";

type Ready = { full: Blob; thumb: Blob; width: number; height: number };

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("illeggibile"));
    };
    img.src = url;
  });
}

function draw(img: HTMLImageElement, longSide: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, longSide / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return Promise.reject(new Error("canvas"));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => {
      // libera subito la memoria (sull'iPhone le foto grandi pesano)
      canvas.width = 0;
      canvas.height = 0;
      if (b) resolve({ blob: b, width, height });
      else reject(new Error("conversione"));
    }, "image/jpeg", quality),
  );
}

/** Foto ridotta (alta qualità, senza dati nascosti) + miniatura. */
export async function preparePhoto(file: File): Promise<Ready> {
  const img = await loadImage(file);
  try {
    const full = await draw(img, PHOTO_LONG_SIDE, PHOTO_QUALITY);
    const thumb = await draw(img, THUMB_LONG_SIDE, 0.8);
    return { full: full.blob, thumb: thumb.blob, width: full.width, height: full.height };
  } finally {
    URL.revokeObjectURL(img.src);
  }
}

/** Pulsante "Aggiungi le foto": apre la galleria, si scelgono tutte insieme, si caricano da sole. */
export function CheckPhotoUploader({ clientId, checkId, label = "Aggiungi le foto", variant = "secondary", className }: { clientId: string; checkId: string; label?: string; variant?: "primary" | "secondary" | "light"; className?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ done: number; total: number; progress: number } | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(0);

  const start = async (files: File[]) => {
    setError("");
    setSaved(0);
    const list = files.filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name));
    if (!list.length) return;
    if (list.length > MAX_PHOTOS_PER_UPLOAD) {
      setError(`Al massimo ${MAX_PHOTOS_PER_UPLOAD} foto per volta.`);
      return;
    }
    setState({ done: 0, total: list.length, progress: 0 });
    try {
      const res = await preparePhotoUploads(clientId, checkId, list.length);
      if ("error" in res) throw new Error(res.error);
      const uploaded: Array<{ path: string; thumbPath: string; width: number; height: number; size: number }> = [];
      const skipped: string[] = [];
      for (let i = 0; i < list.length; i++) {
        const t = res.tickets[i];
        let ready: Ready;
        try {
          ready = await preparePhoto(list[i]);
        } catch {
          skipped.push(list[i].name);
          continue;
        }
        await Promise.all([
          uploadWithProgress(t.url, ready.full, "image/jpeg", (p) => setState({ done: i, total: list.length, progress: p })),
          uploadWithProgress(t.thumbUrl, ready.thumb, "image/jpeg", () => undefined),
        ]);
        uploaded.push({ path: t.path, thumbPath: t.thumbPath, width: ready.width, height: ready.height, size: ready.full.size });
        setState({ done: i + 1, total: list.length, progress: 0 });
      }
      if (uploaded.length) {
        const ok = await saveCheckPhotos(clientId, checkId, uploaded);
        if ("error" in ok) throw new Error(ok.error);
        setSaved(uploaded.length);
        router.refresh();
      }
      if (skipped.length) setError(`${skipped.length === 1 ? "Una foto non si riesce a leggere" : `${skipped.length} foto non si riescono a leggere`}: prova a sceglierle di nuovo dalla galleria del telefono.`);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Caricamento non riuscito. Riprova.");
    } finally {
      setState(null);
      if (input.current) input.current.value = "";
    }
  };

  const busy = state !== null;
  const pct = state ? Math.round(((state.done + state.progress) / state.total) * 100) : 0;
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label="Scegli le foto del check"
        data-testid={`photo-input-${checkId}`}
        onChange={(e) => void start(Array.from(e.currentTarget.files ?? []))}
      />
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className={cx(buttonClass(variant, "sm"), "self-start")}>
        <IconPhoto size={16} />
        {busy ? `Carico ${Math.min(state.done + 1, state.total)} di ${state.total}… ${pct}%` : label}
      </button>
      {saved && !busy ? <p className="text-sm text-muted" role="status">{saved === 1 ? "Foto caricata." : `${saved} foto caricate.`}</p> : null}
      {error ? <p className="text-sm text-accent-deep" role="alert">{error}</p> : null}
    </div>
  );
}

/** Griglia di miniature; un tocco apre la foto a tutto schermo. */
export function PhotoGrid({ photos, clientId, canDelete, title, className }: { photos: CheckPhoto[]; clientId?: string; canDelete?: boolean; title?: string; className?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!photos.length) return null;
  return (
    <>
      <ul className={cx("grid grid-cols-3 gap-1.5 sm:grid-cols-5", className)} aria-label={title ?? "Foto del check"}>
        {photos.map((p, i) => (
          <li key={p.id}>
            <button type="button" onClick={() => setOpen(i)} className="block aspect-[3/4] w-full overflow-hidden rounded-xl bg-sand-deep" aria-label={`Apri la foto ${i + 1}`}>
              {p.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- link temporaneo dello storage
                <img src={p.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      {open !== null ? <Lightbox photos={photos} index={open} onIndex={setOpen} onClose={() => setOpen(null)} clientId={clientId} canDelete={canDelete} title={title} /> : null}
    </>
  );
}

function Lightbox({ photos, index, onIndex, onClose, clientId, canDelete, title }: { photos: CheckPhoto[]; index: number; onIndex: (i: number) => void; onClose: () => void; clientId?: string; canDelete?: boolean; title?: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const touch = useRef<number | null>(null);
  const photo = photos[Math.min(index, photos.length - 1)];
  const go = (d: number) => {
    setConfirm(false);
    onIndex((index + d + photos.length) % photos.length);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  });

  if (!photo) return null;
  const remove = async () => {
    if (!clientId) return;
    setBusy(true);
    const res = await deleteCheckPhoto(clientId, photo.id);
    setBusy(false);
    if (res.ok) {
      onClose();
      router.refresh();
    }
  };
  const name = `check-${photo.checkDate ?? photo.createdAt.slice(0, 10)}-${index + 1}.jpg`;
  return (
    <div role="dialog" aria-modal="true" aria-label={title ?? "Foto del check"} className="fixed inset-0 z-[96] flex flex-col bg-black text-white">
      <div className="flex items-center justify-between gap-3 px-3 pt-[calc(0.5rem+env(safe-area-inset-top))]">
        <span className="pl-2 text-sm text-white/70 tabular">{index + 1} di {photos.length}{title ? ` · ${title}` : ""}</span>
        <button type="button" onClick={onClose} aria-label="Chiudi" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"><IconX size={22} /></button>
      </div>
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center"
        onTouchStart={(e) => (touch.current = e.touches[0]?.clientX ?? null)}
        onTouchEnd={(e) => {
          const x = e.changedTouches[0]?.clientX;
          if (touch.current !== null && x !== undefined && Math.abs(x - touch.current) > 50) go(x < touch.current ? 1 : -1);
          touch.current = null;
        }}
      >
        {photo.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- link temporaneo dello storage
          <img key={photo.id} src={photo.url} alt={`Foto ${index + 1}`} className="max-h-full max-w-full object-contain" />
        ) : (
          <p className="text-white/70">Foto non disponibile.</p>
        )}
        {photos.length > 1 ? (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Foto precedente" className="absolute left-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/40 hover:bg-black/60"><IconArrowLeft size={20} /></button>
            <button type="button" onClick={() => go(1)} aria-label="Foto successiva" className="absolute right-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/40 hover:bg-black/60"><IconArrowRight size={20} /></button>
          </>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {photo.url ? (
          <button type="button" onClick={() => void saveAttachment(photo.url!, name).catch(() => undefined)} className="flex min-h-11 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-semibold hover:bg-white/20">
            <IconDownload size={16} /> Scarica la foto
          </button>
        ) : null}
        {canDelete && clientId ? (
          confirm ? (
            <button type="button" disabled={busy} onClick={() => void remove()} className="flex min-h-11 items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-white disabled:opacity-50">
              <IconTrash size={16} /> {busy ? "Elimino…" : "Sì, elimina"}
            </button>
          ) : (
            <button type="button" onClick={() => setConfirm(true)} className="flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white/80 hover:bg-white/10">
              <IconTrash size={16} /> Elimina
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}
