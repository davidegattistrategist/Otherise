"use client";

/**
 * Confronto delle foto di due check, una attaccata all'altra con una sottile
 * riga bianca in mezzo. Sotto ogni foto le sue frecce (si scorrono le foto di
 * quel check). Ogni foto si ingrandisce/rimpicciolisce (due dita o rotellina;
 * "Ripristina" o doppio clic per tornare all'inizio) e si sposta un po' trascinandola, così
 * il soggetto viene alla stessa grandezza: i riquadri restano fermi.
 * "Scarica il confronto" salva l'immagine esattamente come la vedi.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CheckPhoto } from "@/lib/check-photos-shared";
import { START_VIEW, clampView, frameSize, isStartView, photoRect, zoomAt, type PhotoView } from "@/lib/photo-view";
import { saveBlob } from "./chat/media";
import { IconArrowLeft, IconArrowRight, IconDownload, IconPhoto, IconX } from "./icons";
import { buttonClass, cx } from "./ui";

export type PhotoAlbum = { id: string; title: string; photos: CheckPhoto[] };

const DIVIDER = 2;
const OUT_HEIGHT = 1600;
/** spazio per le frecce sotto le foto */
const ARROWS = 48;

type Natural = { w: number; h: number };
const natural = (p: CheckPhoto | null, loaded?: Natural | null): Natural => loaded ?? { w: p?.width || 3, h: p?.height || 4 };

function Frame({
  photo,
  view,
  setView,
  fw,
  fh,
  imgRef,
  alt,
}: {
  photo: CheckPhoto | null;
  view: PhotoView;
  setView: (f: (v: PhotoView) => PhotoView) => void;
  fw: number;
  fh: number;
  imgRef: React.RefObject<HTMLImageElement | null>;
  alt: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const [loaded, setLoaded] = useState<Natural | null>(null);
  const nat = natural(photo, loaded);
  const clamp = useCallback((v: PhotoView) => clampView(v, nat.w, nat.h, fw, fh), [nat.w, nat.h, fw, fh]);

  // rotellina (computer): non passiva, così la pagina non scorre
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const f = Math.exp(-e.deltaY * 0.0015);
      setView((v) => clamp(zoomAt(v, f, e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [clamp, setView]);

  const rect = photoRect(nat.w, nat.h, fw, fh, view);
  return (
    <div
      ref={box}
      data-compare-frame
      className="relative shrink-0 cursor-grab touch-none overflow-hidden bg-black select-none active:cursor-grabbing"
      style={{ width: fw, height: fh }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }}
      onPointerMove={(e) => {
        const map = pts.current;
        const prev = map.get(e.pointerId);
        if (!prev) return;
        const before = [...map.values()];
        map.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const after = [...map.values()];
        if (after.length === 1) {
          setView((v) => clamp({ ...v, x: v.x + e.clientX - prev.x, y: v.y + e.clientY - prev.y }));
        } else if (after.length >= 2) {
          const [a0, b0] = before;
          const [a1, b1] = after;
          const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y) || 1;
          const d1 = Math.hypot(a1.x - b1.x, a1.y - b1.y) || 1;
          const r = e.currentTarget.getBoundingClientRect();
          const mx = (a1.x + b1.x) / 2 - r.left - r.width / 2;
          const my = (a1.y + b1.y) / 2 - r.top - r.height / 2;
          const dx = (a1.x + b1.x) / 2 - (a0.x + b0.x) / 2;
          const dy = (a1.y + b1.y) / 2 - (a0.y + b0.y) / 2;
          setView((v) => clamp(zoomAt({ ...v, x: v.x + dx, y: v.y + dy }, d1 / d0, mx, my)));
        }
      }}
      onPointerUp={(e) => void pts.current.delete(e.pointerId)}
      onPointerCancel={(e) => void pts.current.delete(e.pointerId)}
      onDoubleClick={() => setView(() => START_VIEW)}
    >
      {photo?.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- link temporaneo dello storage
        <img
          ref={imgRef}
          key={photo.id}
          src={photo.url}
          alt={alt}
          crossOrigin="anonymous"
          draggable={false}
          onLoad={(e) => setLoaded({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          className="pointer-events-none absolute max-w-none"
          style={{ left: rect.left, top: rect.top, width: rect.w, height: rect.h }}
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-sm text-white/60">Nessuna foto</span>
      )}
    </div>
  );
}

export function PhotoCompare({ albums, initial, label = "Confronta le foto" }: { albums: PhotoAlbum[]; initial?: [string, string]; label?: string }) {
  const [open, setOpen] = useState(false);
  const usable = albums.filter((a) => a.photos.length);
  const [leftId, setLeft] = useState(initial?.[0] ?? usable[usable.length - 2]?.id ?? "");
  const [rightId, setRight] = useState(initial?.[1] ?? usable[usable.length - 1]?.id ?? "");
  const [li, setLi] = useState(0);
  const [ri, setRi] = useState(0);
  const [lv, setLv] = useState<PhotoView>(START_VIEW);
  const [rv, setRv] = useState<PhotoView>(START_VIEW);
  const [space, setSpace] = useState<{ w: number; h: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const area = useRef<HTMLDivElement>(null);
  const leftImg = useRef<HTMLImageElement>(null);
  const rightImg = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // spazio libero per i due riquadri
  useLayoutEffect(() => {
    const el = area.current;
    if (!open || !el) return;
    const measure = () => setSpace({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  if (usable.length < 2)
    return usable.length === 1 ? <p className="text-sm text-muted">Il confronto delle foto compare quando ci sono le foto in almeno due check.</p> : null;
  const left = usable.find((a) => a.id === leftId) ?? usable[0];
  const right = usable.find((a) => a.id === rightId) ?? usable[usable.length - 1];
  const lIdx = Math.min(li, left.photos.length - 1);
  const rIdx = Math.min(ri, right.photos.length - 1);
  const lp = left.photos[lIdx] ?? null;
  const rp = right.photos[rIdx] ?? null;
  // riquadri con le proporzioni della foto di sinistra (di solito tutte uguali)
  const ref = natural(lp);
  const aspect = Math.min(1.5, Math.max(0.4, ref.w / ref.h));
  const frame = space ? frameSize(space.w - 8, space.h - ARROWS - 8, aspect, DIVIDER) : null;

  const pick = (value: string, set: (v: string) => void, name: string) => (
    <select aria-label={name} value={value} onChange={(e) => set(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-sm text-white">
      {usable.map((a) => <option key={a.id} value={a.id} className="text-ink">{a.title}</option>)}
    </select>
  );
  const arrows = (side: string, at: number, count: number, set: (n: number) => void, view: PhotoView, reset: () => void) => (
    <div className="flex items-center justify-center gap-1 text-xs text-white/70">
      <button type="button" disabled={at <= 0} onClick={() => set(at - 1)} aria-label={`Foto prima a ${side}`} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-30"><IconArrowLeft size={18} /></button>
      <span className="min-w-10 text-center tabular">{at + 1} di {count}</span>
      <button type="button" disabled={at >= count - 1} onClick={() => set(at + 1)} aria-label={`Foto dopo a ${side}`} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-30"><IconArrowRight size={18} /></button>
      {!isStartView(view) ? <button type="button" onClick={reset} className="ml-1 rounded-full px-2 py-1 font-semibold hover:bg-white/10">Ripristina</button> : null}
    </div>
  );

  const download = async () => {
    if (!frame) return;
    setSaving(true);
    setError("");
    try {
      const k = OUT_HEIGHT / frame.fh;
      const fw = Math.round(frame.fw * k);
      const fh = OUT_HEIGHT;
      const div = Math.max(2, Math.round(DIVIDER * k));
      const canvas = document.createElement("canvas");
      canvas.width = fw * 2 + div;
      canvas.height = fh;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const draw = async (img: HTMLImageElement | null, p: CheckPhoto | null, view: PhotoView, x0: number) => {
        if (!img || !p) return;
        if (!img.complete || !img.naturalWidth) await img.decode();
        const r = photoRect(img.naturalWidth, img.naturalHeight, frame.fw, frame.fh, view);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, 0, fw, fh);
        ctx.clip();
        ctx.drawImage(img, x0 + r.left * k, r.top * k, r.w * k, r.h * k);
        ctx.restore();
      };
      await draw(leftImg.current, lp, lv, 0);
      await draw(rightImg.current, rp, rv, fw + div);
      ctx.fillStyle = "#fff";
      ctx.fillRect(fw, 0, div, fh);
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.88));
      if (!blob) throw new Error("blob");
      const day = (a: PhotoAlbum) => a.photos[0]?.checkDate ?? a.title.replace(/[^\w-]+/g, "-");
      await saveBlob(blob, `confronto-${day(left)}-${day(right)}.jpg`);
    } catch {
      setError("Non sono riuscito a preparare l'immagine. Riprova.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx(buttonClass("secondary", "sm"), "self-start")}>
        <IconPhoto size={16} /> {label}
      </button>
      {open ? (
        <div role="dialog" aria-modal="true" aria-label="Confronto delle foto" className="fixed inset-0 z-[96] flex flex-col bg-black text-white">
          <div className="flex items-center gap-2 px-3 pt-[calc(0.5rem+env(safe-area-inset-top))]">
            {pick(left.id, (v) => { setLeft(v); setLi(0); setLv(START_VIEW); }, "Check a sinistra")}
            {pick(right.id, (v) => { setRight(v); setRi(0); setRv(START_VIEW); }, "Check a destra")}
            <button type="button" onClick={() => setOpen(false)} aria-label="Chiudi" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10"><IconX size={22} /></button>
          </div>
          {/* foto attaccate con la riga bianca, subito sotto le frecce di ognuna */}
          <div ref={area} className="flex min-h-0 flex-1 flex-col items-center justify-center px-1 pt-2">
            {frame ? (
              <>
                <div className="flex" style={{ gap: DIVIDER, background: "#fff" }}>
                  <Frame key={`l-${lp?.id}`} photo={lp} view={lv} setView={setLv} fw={frame.fw} fh={frame.fh} imgRef={leftImg} alt={`${left.title}, foto ${lIdx + 1}`} />
                  <Frame key={`r-${rp?.id}`} photo={rp} view={rv} setView={setRv} fw={frame.fw} fh={frame.fh} imgRef={rightImg} alt={`${right.title}, foto ${rIdx + 1}`} />
                </div>
                <div className="flex items-start pt-1" style={{ width: frame.fw * 2 + DIVIDER, height: ARROWS }}>
                  <div className="flex-1">{arrows("sinistra", lIdx, left.photos.length, setLi, lv, () => setLv(START_VIEW))}</div>
                  <div className="flex-1">{arrows("destra", rIdx, right.photos.length, setRi, rv, () => setRv(START_VIEW))}</div>
                </div>
              </>
            ) : null}
          </div>
          <div className="flex flex-col items-center gap-1 px-4 pt-1 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <button type="button" disabled={saving || !frame} onClick={() => void download()} className="flex min-h-11 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-semibold hover:bg-white/20 disabled:opacity-50">
              <IconDownload size={16} /> {saving ? "Preparo…" : "Scarica il confronto"}
            </button>
            {error ? <p role="alert" className="text-xs text-accent">{error}</p> : <p className="text-center text-xs text-white/50"><span className="pointer-fine:hidden">Due dita per ingrandire o rimpicciolire, un dito per spostare.</span><span className="hidden pointer-fine:inline">Rotellina per ingrandire o rimpicciolire, trascina per spostare.</span></p>}
          </div>
        </div>
      ) : null}
    </>
  );
}
