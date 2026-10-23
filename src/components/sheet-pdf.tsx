"use client";

/**
 * PDF di un foglio dell'app (es. il confronto dei check per il nutrizionista),
 * creato nel telefono o nel computer: si copia il foglio fuori schermo a
 * larghezza di pagina, ogni parte diventa un'immagine nitida e si impagina su
 * A4 senza tagliare una tabella a metà. Poi "Condividi" (WhatsApp, Mail, File)
 * o "Scarica". Serve perché nelle app sulla Home dell'iPhone la stampa non c'è.
 */
import { useEffect, useRef, useState } from "react";
import { IconDownload } from "./icons";
import { cx } from "./ui";

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 12;
/** larghezza in pixel del foglio copiato: come una pagina A4 a schermo */
const SHEET_PX = 760;

async function buildPdf(sheet: HTMLElement, title: string): Promise<Blob> {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const holder = document.createElement("div");
  holder.setAttribute("aria-hidden", "true");
  holder.style.cssText = `position:fixed;left:-${SHEET_PX * 3}px;top:0;width:${SHEET_PX}px;pointer-events:none;z-index:-1;`;
  const copy = sheet.cloneNode(true) as HTMLElement;
  copy.setAttribute("data-pdf", "");
  copy.style.width = `${SHEET_PX}px`;
  copy.style.maxWidth = "none";
  copy.style.borderRadius = "0";
  copy.style.background = "#ffffff";
  // come in stampa: via le caselle e ciò che è solo per lo schermo, dentro il testo scritto
  copy.querySelectorAll("[data-print-hide], textarea, input, select, button").forEach((el) => el.remove());
  copy.querySelectorAll<HTMLElement>("[class*='print:hidden']").forEach((el) => el.remove());
  copy.querySelectorAll<HTMLElement>("[class*='print:block']").forEach((el) => (el.style.display = "block"));
  holder.appendChild(copy);
  document.body.appendChild(holder);
  try {
    await document.fonts?.ready;
    const parts = Array.from(copy.children).filter((el): el is HTMLElement => el instanceof HTMLElement && getComputedStyle(el).display !== "none");
    const opts = { pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true } as const;
    // Safari: la prima immagine a volte esce senza i caratteri, la seconda no
    if (parts[0]) await toCanvas(parts[0], opts).catch(() => null);
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    pdf.setProperties({ title });
    const width = PAGE_W - MARGIN * 2;
    let y = MARGIN;
    for (const part of parts) {
      const canvas = await toCanvas(part, opts);
      if (!canvas.width || !canvas.height) continue;
      const h = (canvas.height * width) / canvas.width;
      const gap = y > MARGIN ? 4 : 0;
      if (y + gap + h > PAGE_H - MARGIN && y > MARGIN) {
        pdf.addPage();
        y = MARGIN;
      } else y += gap;
      if (h <= PAGE_H - MARGIN * 2) {
        pdf.addImage(canvas, "PNG", MARGIN, y, width, h, undefined, "FAST");
        y += h;
      } else {
        // più alta di una pagina: a pezzi
        const slicePx = Math.floor(((PAGE_H - MARGIN * 2) * canvas.width) / width);
        for (let top = 0; top < canvas.height; top += slicePx) {
          const piece = document.createElement("canvas");
          piece.width = canvas.width;
          piece.height = Math.min(slicePx, canvas.height - top);
          piece.getContext("2d")!.drawImage(canvas, 0, top, canvas.width, piece.height, 0, 0, canvas.width, piece.height);
          if (top > 0) {
            pdf.addPage();
            y = MARGIN;
          }
          const ph = (piece.height * width) / piece.width;
          pdf.addImage(piece, "PNG", MARGIN, y, width, ph, undefined, "FAST");
          y += ph;
        }
      }
    }
    return pdf.output("blob");
  } finally {
    holder.remove();
  }
}

export function SheetPdfButton({ sheetSelector = "[data-print-sheet]", filename, title }: { sheetSelector?: string; filename: string; title: string }) {
  const [state, setState] = useState<"idle" | "working" | "ready" | "error">("idle");
  const [pdf, setPdf] = useState<{ file: File; url: string; share: boolean } | null>(null);
  const lastUrl = useRef<string | null>(null);
  useEffect(() => () => {
    if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
  }, []);

  const prepare = async () => {
    const sheet = document.querySelector<HTMLElement>(sheetSelector);
    if (!sheet) return;
    setState("working");
    try {
      const blob = await buildPdf(sheet, title);
      const file = new File([blob], filename, { type: "application/pdf" });
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
      const url = URL.createObjectURL(blob);
      lastUrl.current = url;
      let share = false;
      try {
        share = Boolean(navigator.canShare?.({ files: [file] }));
      } catch {
        share = false;
      }
      setPdf({ file, url, share });
      setState("ready");
    } catch {
      setState("error");
    }
  };

  // il PDF si prepara col primo tocco, si condivide col secondo: il telefono apre "Condividi" solo da un tocco
  const share = async () => {
    if (!pdf) return;
    try {
      await navigator.share({ files: [pdf.file], title });
    } catch {
      // chiuso senza condividere: resta pronto
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2" data-sheet-pdf={state}>
      {state === "ready" && pdf ? (
        <>
          {pdf.share ? (
            <button type="button" onClick={() => void share()} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-card" data-pdf-share>
              Condividi il PDF
            </button>
          ) : null}
          <a
            href={pdf.url}
            download={filename}
            className={cx("inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold", pdf.share ? "ring-1 ring-sand-deep" : "bg-ink text-card")}
            data-pdf-download
          >
            <IconDownload size={16} /> Scarica il PDF
          </a>
          <button type="button" onClick={() => void prepare()} className="min-h-11 rounded-full px-3 text-sm font-semibold underline">
            Rifallo
          </button>
        </>
      ) : (
        <button type="button" onClick={() => void prepare()} disabled={state === "working"} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-card disabled:opacity-60" data-pdf-make>
          <IconDownload size={16} /> {state === "working" ? "Preparo il PDF…" : "Crea il PDF"}
        </button>
      )}
      {state === "error" ? <span role="alert" className="text-sm font-semibold text-accent-deep">Non sono riuscito a creare il PDF. Riprova.</span> : null}
    </div>
  );
}
