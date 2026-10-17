"use client";

/**
 * "Bozze AI": le bozze dei programmi che l'AI sta preparando o ha pronto per
 * te, su tutti i clienti. Compare solo quando ce n'è almeno una: sul telefono
 * accanto alla campanella, sul computer nel menu a sinistra. Ogni riga porta
 * all'editor di QUEL programma, dove la bozza si apre.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { jobLabel } from "@/lib/ai/program-jobs-shared";
import { useAiJobs } from "./live";
import { IconSparkle, IconX } from "./icons";
import { cx } from "./ui";

export function AiJobsButton({ variant }: { variant: "header" | "sidebar" }) {
  const jobs = useAiJobs();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [openedOn, setOpenedOn] = useState(path);
  if (openedOn !== path) {
    setOpenedOn(path);
    setOpen(false);
  }
  const box = useRef<HTMLDivElement>(null);
  // il tempo delle bozze in preparazione scorre mentre l'elenco è aperto
  const [, setNow] = useState(0);
  useEffect(() => {
    if (!open || !jobs.some((j) => j.status === "working")) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open, jobs]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  if (!jobs.length) return null;
  const working = jobs.filter((j) => j.status === "working").length;
  const toSee = jobs.length - working;
  const summary = [working ? `${working} in preparazione` : "", toSee ? `${toSee} da vedere` : ""].filter(Boolean).join(" · ");
  return (
    <div ref={box} className={cx("relative", variant === "sidebar" && "px-2")} data-ai-jobs>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Bozze AI: ${summary}`}
        onClick={() => setOpen((v) => !v)}
        className={cx(
          "flex items-center gap-2 rounded-full font-semibold",
          variant === "header" ? "h-11 bg-card px-3.5 text-sm" : "min-h-11 w-full bg-card px-3.5 text-left text-sm shadow-sm ring-1 ring-sand-deep",
        )}
      >
        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
          {working ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/40" /> : null}
          <IconSparkle size={18} className={toSee ? "text-accent-deep" : ""} />
        </span>
        {variant === "header" ? (
          <span className="tabular">{jobs.length}</span>
        ) : (
          <span className="min-w-0 flex-1 py-1.5 leading-tight">
            <span className="block">Bozze AI</span>
            <span className="block text-xs font-normal text-muted">{summary}</span>
          </span>
        )}
        {toSee && variant === "header" ? <span className="h-2 w-2 rounded-full bg-accent" aria-hidden /> : null}
      </button>
      {open ? (
        <div className={cx("absolute z-[60] w-[min(22rem,calc(100vw-2rem))] rounded-[22px] bg-card p-2 shadow-2xl ring-1 ring-sand-deep", variant === "header" ? "fixed top-[calc(4.25rem+env(safe-area-inset-top))] right-[var(--edge-right)]" : "top-full left-2 mt-2")} role="dialog" aria-label="Bozze AI">
          <div className="flex items-center justify-between px-2 pt-1 pb-2">
            <span className="text-xs font-semibold tracking-[0.12em] text-muted uppercase">Bozze AI</span>
            <button type="button" aria-label="Chiudi" onClick={() => setOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-sand"><IconX size={16} /></button>
          </div>
          <ul className="flex flex-col">
            {jobs.map((j) => (
              <li key={j.id}>
                <Link href={`/staff/programmi/${j.programId}?ai=1`} className="flex min-h-12 items-center justify-between gap-3 rounded-2xl px-3 py-2 hover:bg-sand" data-ai-job-row={j.status}>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{j.clientName || "Cliente"}</span>
                    <span className={cx("block text-sm", j.status === "working" ? "text-muted" : j.status === "failed" ? "text-accent-deep" : "text-ink")}>{jobLabel({ status: j.status as never, createdAt: j.createdAt })}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold underline">{j.status === "working" ? "Apri" : j.status === "questions" ? "Rispondi" : j.status === "failed" ? "Riprova" : "Rivedi"}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="px-3 pt-1 pb-2 text-xs text-muted">Mentre l&apos;AI prepara una bozza puoi dare le indicazioni per un altro cliente.</p>
        </div>
      ) : null}
    </div>
  );
}
