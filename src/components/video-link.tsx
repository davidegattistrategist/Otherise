"use client";

/**
 * "Video" di un esercizio: i video di YouTube si aprono in un riquadro dentro
 * l'app (su iPhone, con l'app sulla Home, un link esterno faceva uscire
 * dall'app). Gli altri link si aprono come prima, in una scheda nuova.
 */
import { useEffect, useState } from "react";
import { youtubeId } from "@/lib/youtube";
import { IconPlay, IconX } from "./icons";

export function VideoLink({ url, title, className }: { url: string; title: string; className?: string }) {
  const id = youtubeId(url);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);
  if (!id) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={className}>
        <IconPlay size={14} /> Video
      </a>
    );
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <IconPlay size={14} /> Video
      </button>
      {open ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-ink/80 px-[var(--edge-left,16px)] py-6" role="dialog" aria-modal="true" aria-label={`Video: ${title}`} onClick={() => setOpen(false)}>
          <div className="flex w-full max-w-3xl flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 text-card">
              <span className="min-w-0 truncate text-[15px] font-semibold">{title}</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Chiudi il video" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15">
                <IconX size={20} />
              </button>
            </div>
            <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0`}
                title={title}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                className="h-full w-full"
              />
            </div>
            <a href={url} target="_blank" rel="noopener noreferrer" className="self-start text-sm font-semibold text-card underline">Apri su YouTube</a>
          </div>
        </div>
      ) : null}
    </>
  );
}
