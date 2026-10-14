"use client";

/**
 * Foto dei check. Lo staff le carica tutte insieme dalla galleria del telefono
 * con un solo tocco: il telefono le riduce un po' (lato lungo 1600 px, JPEG
 * ricompresso con mozjpeg, circa 150–190 KB) e così spariscono anche i dati nascosti che le appesantiscono
 * (posizione GPS, modello del telefono…); in più prepara una miniatura per le
 * griglie. Lo staff e il cliente le guardano a tutto schermo e le possono salvare.
 */
import { useEffect, useRef, useState } from "react";
import { useKeepAwake } from "./use-keep-awake";
import { useRouter } from "next/navigation";
import { MAX_PHOTOS_PER_UPLOAD, MOZ_QUALITY, MOZ_THUMB_QUALITY, PHOTO_LONG_SIDE, PHOTO_QUALITY, THUMB_LONG_SIDE, type CheckPhoto } from "@/lib/check-photos-shared";
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

/** mozjpeg nel browser (caricato solo quando serve); null se non parte. */
let mozjpeg: Promise<((data: ImageData, quality: number) => Promise<ArrayBuffer>) | null> | null = null;
function loadMozjpeg() {
  mozjpeg ??= (async () => {
    try {
      const [{ default: encode, init }, wasm] = await Promise.all([
        import("@jsquash/jpeg/encode"),
        fetch("/wasm/mozjpeg_enc.wasm").then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("wasm")))),
      ]);
      await init({ wasmBinary: wasm } as never);
      return (data: ImageData, quality: number) => encode(data, { quality, progressive: true });
    } catch {
      return null;
    }
  })();
  return mozjpeg;
}

async function draw(img: HTMLImageElement, longSide: number, quality: number, mozQuality: number): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, longSide / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!ctx) throw new Error("canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);
  // libera subito la memoria (sull'iPhone le foto grandi pesano)
  const free = () => {
    canvas.width = 0;
    canvas.height = 0;
  };
  const moz = await loadMozjpeg();
  if (moz) {
    try {
      const out = await moz(ctx.getImageData(0, 0, width, height), mozQuality);
      free();
      return { blob: new Blob([out], { type: "image/jpeg" }), width, height };
    } catch {
      // si ripiega sul JPEG del browser
    }
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => {
      free();
      if (b) resolve({ blob: b, width, height });
      else reject(new Error("conversione"));
    }, "image/jpeg", quality),
  );
}

/** Foto ridotta (alta qualità, senza dati nascosti) + miniatura. */
export async function preparePhoto(file: File): Promise<Ready> {
  const img = await loadImage(file);
  try {
    const full = await draw(img, PHOTO_LONG_SIDE, PHOTO_QUALITY, MOZ_QUALITY);
    const thumb = await draw(img, THUMB_LONG_SIDE, 0.8, MOZ_THUMB_QUALITY);
    return { full: full.blob, thumb: thumb.blob, width: full.width, height: full.height };
  } finally {
    URL.revokeObjectURL(img.src);
  }
}

/** Pulsante "Aggiungi le foto": apre la galleria, si scelgono tutte insieme, si caricano da sole. */
/** Solo le immagini tra i file scelti. */
export const onlyImages = (files: File[]) => files.filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name));

/**
 * Riduce e carica le foto di un check (1600 px + miniatura, senza dati
 * nascosti) e le registra. Usato dal pulsante delle foto e dal modulo del
 * check (foto scelte prima di salvare).
 */
export async function uploadCheckPhotos(
  clientId: string,
  checkId: string,
  files: File[],
  onProgress: (p: { done: number; total: number; progress: number }) => void,
): Promise<{ saved: number; error: string }> {
  const list = onlyImages(files);
  if (!list.length) return { saved: 0, error: "" };
  if (list.length > MAX_PHOTOS_PER_UPLOAD) return { saved: 0, error: `Al massimo ${MAX_PHOTOS_PER_UPLOAD} foto per volta.` };
  onProgress({ done: 0, total: list.length, progress: 0 });
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
        uploadWithProgress(t.url, ready.full, "image/jpeg", (p) => onProgress({ done: i, total: list.length, progress: p })),
        uploadWithProgress(t.thumbUrl, ready.thumb, "image/jpeg", () => undefined),
      ]);
      uploaded.push({ path: t.path, thumbPath: t.thumbPath, width: ready.width, height: ready.height, size: ready.full.size });
      onProgress({ done: i + 1, total: list.length, progress: 0 });
    }
    if (uploaded.length) {
      const ok = await saveCheckPhotos(clientId, checkId, uploaded);
      if ("error" in ok) throw new Error(ok.error);
    }
    const error = skipped.length ? `${skipped.length === 1 ? "Una foto non si riesce a leggere" : `${skipped.length} foto non si riescono a leggere`}: prova a sceglierle di nuovo dalla galleria del telefono.` : "";
    return { saved: uploaded.length, error };
  } catch (e) {
    return { saved: 0, error: e instanceof Error && e.message ? e.message : "Caricamento non riuscito. Riprova." };
  }
}

export function CheckPhotoUploader({ clientId, checkId, label = "Aggiungi le foto", variant = "secondary", className }: { clientId: string; checkId: string; label?: string; variant?: "primary" | "secondary" | "light"; className?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ done: number; total: number; progress: number } | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(0);

  const start = async (files: File[]) => {
    setError("");
    setSaved(0);
    try {
      const r = await uploadCheckPhotos(clientId, checkId, files, setState);
      if (r.saved) {
        setSaved(r.saved);
        router.refresh();
      }
      if (r.error) setError(r.error);
    } finally {
      setState(null);
      if (input.current) input.current.value = "";
    }
  };

  const busy = state !== null;
  useKeepAwake(busy);
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

/**
 * Elenco dei check con le foto: le foto non si vedono scorrendo la pagina, si
 * aprono a tutto schermo solo toccando il check (si carica solo ciò che apri).
 */
export function PhotoAlbums({ albums }: { albums: Array<{ id: string; title: string; photos: CheckPhoto[] }> }) {
  const [open, setOpen] = useState<{ album: number; index: number } | null>(null);
  if (!albums.length) return null;
  const album = open ? albums[open.album] : null;
  return (
    <>
      <ul className="flex flex-col" aria-label="Check con le foto">
        {albums.map((a, i) => (
          <li key={a.id} className="border-t border-sand-deep first:border-t-0">
            <button type="button" onClick={() => setOpen({ album: i, index: 0 })} className="flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left">
              <span className="flex items-center gap-2.5 font-semibold"><IconPhoto size={18} className="shrink-0 text-accent-deep" />{a.title}</span>
              <span className="shrink-0 text-sm text-muted">{a.photos.length === 1 ? "1 foto" : `${a.photos.length} foto`} ›</span>
            </button>
          </li>
        ))}
      </ul>
      {open && album ? <Lightbox photos={album.photos} index={open.index} onIndex={(index) => setOpen({ ...open, index })} onClose={() => setOpen(null)} title={album.title} /> : null}
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

export type PhotoAlbum = { id: string; title: string; photos: CheckPhoto[] };

/**
 * Confronto delle foto di due check, affiancate: la 1ª con la 1ª, la 2ª con
 * la 2ª… (nell'ordine in cui sono state caricate: di solito frontale, lato,
 * dietro). Se in un check l'ordine è diverso, le frecce piccole sotto la foto
 * di destra la spostano. Niente da etichettare, niente AI.
 */
export function PhotoCompare({ albums, initial, label = "Confronta le foto" }: { albums: PhotoAlbum[]; initial?: [string, string]; label?: string }) {
  const [open, setOpen] = useState(false);
  const usable = albums.filter((a) => a.photos.length);
  const [leftId, setLeft] = useState(initial?.[0] ?? usable[usable.length - 2]?.id ?? "");
  const [rightId, setRight] = useState(initial?.[1] ?? usable[usable.length - 1]?.id ?? "");
  const [i, setI] = useState(0);
  const [shift, setShift] = useState(0);
  const touch = useRef<number | null>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowRight") setI((x) => x + 1);
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  if (usable.length < 2) return null;
  const left = usable.find((a) => a.id === leftId) ?? usable[0];
  const right = usable.find((a) => a.id === rightId) ?? usable[usable.length - 1];
  const count = Math.max(left.photos.length, right.photos.length);
  const at = Math.min(i, count - 1);
  const wrap = (list: CheckPhoto[], k: number) => (list.length ? list[((k % list.length) + list.length) % list.length] : null);
  const lp = left.photos[at] ?? null;
  const rp = wrap(right.photos, at + shift);
  const pick = (value: string, set: (v: string) => void, name: string) => (
    <select aria-label={name} value={value} onChange={(e) => set(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-sm text-white">
      {usable.map((a) => <option key={a.id} value={a.id} className="text-ink">{a.title}</option>)}
    </select>
  );
  const side = (p: CheckPhoto | null, alt: string) =>
    p?.url ? (
      // eslint-disable-next-line @next/next/no-img-element -- link temporaneo dello storage
      <img src={p.url} alt={alt} className="max-h-full max-w-full object-contain" />
    ) : (
      <span className="text-sm text-white/60">Nessuna foto</span>
    );
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx(buttonClass("secondary", "sm"), "self-start")}>
        <IconPhoto size={16} /> {label}
      </button>
      {open ? (
        <div role="dialog" aria-modal="true" aria-label="Confronto delle foto" className="fixed inset-0 z-[96] flex flex-col bg-black text-white">
          <div className="flex items-center gap-2 px-3 pt-[calc(0.5rem+env(safe-area-inset-top))]">
            {pick(leftId || left.id, (v) => { setLeft(v); setShift(0); }, "Check a sinistra")}
            {pick(rightId || right.id, (v) => { setRight(v); setShift(0); }, "Check a destra")}
            <button type="button" onClick={() => setOpen(false)} aria-label="Chiudi" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10"><IconX size={22} /></button>
          </div>
          <div
            className="grid min-h-0 flex-1 grid-cols-2 gap-1 p-1"
            onTouchStart={(e) => (touch.current = e.touches[0]?.clientX ?? null)}
            onTouchEnd={(e) => {
              const x = e.changedTouches[0]?.clientX;
              if (touch.current !== null && x !== undefined && Math.abs(x - touch.current) > 50) setI((v) => (x < touch.current! ? Math.min(count - 1, v + 1) : Math.max(0, v - 1)));
              touch.current = null;
            }}
          >
            <div className="flex min-h-0 items-center justify-center">{side(lp, `${left.title}, foto ${at + 1}`)}</div>
            <div className="flex min-h-0 items-center justify-center">{side(rp, `${right.title}, foto ${at + 1}`)}</div>
          </div>
          <div className="grid grid-cols-2 gap-1 px-1 text-center text-xs text-white/70">
            <span>{left.title}</span>
            <span className="flex items-center justify-center gap-1">
              <button type="button" onClick={() => setShift((s) => s - 1)} aria-label="Usa la foto prima a destra" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"><IconArrowLeft size={14} /></button>
              {right.title}
              <button type="button" onClick={() => setShift((s) => s + 1)} aria-label="Usa la foto dopo a destra" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"><IconArrowRight size={14} /></button>
            </span>
          </div>
          <div className="flex items-center justify-center gap-4 px-4 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <button type="button" disabled={at <= 0} onClick={() => setI(Math.max(0, at - 1))} aria-label="Coppia precedente" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 disabled:opacity-30"><IconArrowLeft size={20} /></button>
            <span className="text-sm tabular">{at + 1} di {count}</span>
            <button type="button" disabled={at >= count - 1} onClick={() => setI(Math.min(count - 1, at + 1))} aria-label="Coppia successiva" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 disabled:opacity-30"><IconArrowRight size={20} /></button>
          </div>
        </div>
      ) : null}
    </>
  );
}
