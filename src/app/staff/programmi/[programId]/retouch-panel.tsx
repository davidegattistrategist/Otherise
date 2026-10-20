"use client";

/**
 * "Ritocca da qui": un pezzo del programma in corso (un esercizio, un giorno
 * o tutto) per alcune settimane. Tre scelte veloci (cosa, da quando, perché),
 * l'AI propone, il trainer vede Prima → Dopo riga per riga e applica quelle
 * che vuole. Le settimane fatte non si toccano. Sul computer accanto
 * all'editor, sul telefono dal basso (come "Fase precedente").
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { IconSparkle, IconX } from "@/components/icons";
import { DictateButton } from "@/components/dictate-button";
import { friendlyError } from "@/lib/friendly-error";
import type { ProgramContent } from "@/lib/program/types";
import { RETOUCH_REASONS, allRowKeys, previewRows, scopeItems, type RetouchChange, type RetouchScope } from "@/lib/program/retouch";
import { post } from "./ai-tools";
import { keepEditorRowInPlace } from "./editor-focus";

const DESKTOP = "(min-width: 1024px)";

export type RetouchStart = { scope: RetouchScope; reason?: string; from?: number };

type Props = {
  programId: string;
  title: string;
  description: string;
  weeks: number;
  content: ProgramContent;
  /** settimane già fatte (non si toccano) */
  done: number;
  start: RetouchStart;
  onClose: () => void;
  onApply: (changes: RetouchChange[], accepted: Set<string>, summary: string, reason: string) => void;
};

export function RetouchPanel({ programId, title, description, weeks, content, done, start, onClose, onApply }: Props) {
  const firstOpen = Math.min(weeks, done + 1);
  const item = start.scope.kind === "item" ? scopeItems(content, start.scope)[0] ?? null : null;
  const [kind, setKind] = useState<RetouchScope["kind"]>(start.scope.kind);
  const [dayId, setDayId] = useState(start.scope.kind === "day" ? start.scope.dayId : item?.dayId ?? content.days[0]?.id ?? "");
  const [from, setFrom] = useState(Math.min(weeks, Math.max(firstOpen, start.from ?? firstOpen)));
  const [to, setTo] = useState(weeks);
  const [reason, setReason] = useState(start.reason ?? "");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ summary: string; changes: RetouchChange[] } | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const closeBtn = useRef<HTMLButtonElement>(null);
  const allDone = done >= weeks;

  // telefono: la pagina sotto resta ferma; computer: l'editor si stringe accanto. Esc chiude
  useEffect(() => {
    const phone = !window.matchMedia(DESKTOP).matches;
    const html = document.documentElement;
    const before = html.style.overflow;
    if (phone) {
      html.style.overflow = "hidden";
      closeBtn.current?.focus({ preventScroll: true });
    } else keepEditorRowInPlace(() => (html.dataset.sidePanel = "1"));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      html.style.overflow = before;
      if (html.dataset.sidePanel) keepEditorRowInPlace(() => delete html.dataset.sidePanel);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => {
      clearInterval(t);
      setElapsed(0);
    };
  }, [busy]);

  const scope: RetouchScope = kind === "item" && item ? { kind: "item", itemId: item.item.id } : kind === "day" ? { kind: "day", dayId } : { kind: "program" };
  const groups = useMemo(() => (result ? previewRows(content, result.changes) : []), [result, content]);

  const toggleReason = (r: string) =>
    setReason((v) => {
      const t = v.trim();
      if (t.toLowerCase().includes(r.toLowerCase())) return v;
      return t ? `${t.replace(/[.]$/, "")}. ${r}.` : `${r}.`;
    });

  const ask = async () => {
    setError(null);
    if (reason.trim().length < 3) {
      setError("Scegli o scrivi il motivo: è quello che l'AI usa per decidere.");
      return;
    }
    setBusy(true);
    try {
      const r = await post<{ summary: string; changes: RetouchChange[] }>({ mode: "retouch", programId, current: { title, description, weeks, content }, scope, from, to: Math.max(from, to), reason });
      setResult(r);
      setAccepted(new Set(allRowKeys(previewRows(content, r.changes))));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (key: string) =>
    setAccepted((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const weekOptions = Array.from({ length: weeks }, (_, i) => i + 1).filter((w) => w > done);
  const count = accepted.size;

  return (
    <div className="fixed inset-0 z-50 lg:inset-auto lg:top-0 lg:right-0 lg:bottom-0 lg:z-40 lg:w-[var(--side-panel)]" data-retouch>
      <button type="button" aria-label="Chiudi il ritocco" onClick={onClose} className="absolute inset-0 bg-ink/35 lg:hidden" />
      <aside role="dialog" aria-label="Ritocca da qui" className="absolute inset-x-0 bottom-0 flex h-[88dvh] flex-col overflow-hidden rounded-t-[28px] bg-card shadow-2xl lg:static lg:h-full lg:rounded-none lg:border-l lg:border-sand-deep lg:shadow-xl">
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-sand-deep lg:hidden" aria-hidden />
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-sand-deep px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-muted uppercase"><IconSparkle size={14} /> Ritocca da qui</div>
          <button ref={closeBtn} type="button" onClick={onClose} className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-ink px-3.5 text-sm font-semibold whitespace-nowrap text-card">
            <IconX size={16} /> <span>Torna al programma</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {allDone ? (
            <p className="rounded-2xl bg-sand px-4 py-3 text-[15px]">Tutte le settimane di questa fase sono già fatte: non c&apos;è niente da ritoccare. Per correggere un errore usa &quot;Sblocca&quot; sopra le settimane.</p>
          ) : !result ? (
            <div className="flex flex-col gap-5">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-[15px] font-semibold">1. Cosa</legend>
                {item ? (
                  <Choice checked={kind === "item"} onChange={() => setKind("item")} label={`${item.label} ${item.item.name}`} hint={item.dayTitle} />
                ) : null}
                <Choice checked={kind === "day"} onChange={() => setKind("day")} label="Un giorno">
                  {kind === "day" ? (
                    <select aria-label="Giorno da ritoccare" value={dayId} onChange={(e) => setDayId(e.target.value)} className="mt-2 w-full rounded-xl border border-sand-deep bg-card px-3 py-2 text-[15px]">
                      {content.days.map((d) => <option key={d.id} value={d.id}>{d.title || "Giorno"}</option>)}
                    </select>
                  ) : null}
                </Choice>
                <Choice checked={kind === "program"} onChange={() => setKind("program")} label="Tutto il programma" hint="L'AI cambia solo gli esercizi che servono" />
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-[15px] font-semibold">2. Da quando</legend>
                <div className="flex flex-wrap items-center gap-2 text-[15px]">
                  <span>dalla settimana</span>
                  <select aria-label="Dalla settimana" value={from} onChange={(e) => { const v = Number(e.target.value); setFrom(v); if (to < v) setTo(v); }} className="rounded-xl border border-sand-deep bg-card px-3 py-2">
                    {weekOptions.map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                  <span className="inline-flex items-center gap-2 whitespace-nowrap">
                    alla
                    <select aria-label="Alla settimana" value={Math.max(to, from)} onChange={(e) => setTo(Number(e.target.value))} className="rounded-xl border border-sand-deep bg-card px-3 py-2">
                      {weekOptions.filter((w) => w >= from).map((w) => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </span>
                </div>
                {done > 0 ? <p className="mt-2 text-sm text-muted">{done === 1 ? "La settimana 1 è fatta" : `Le settimane 1–${done} sono fatte`}: restano come sono.</p> : null}
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-[15px] font-semibold">3. Perché</legend>
                <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Motivi rapidi">
                  {RETOUCH_REASONS.map((r) => (
                    <button key={r} type="button" onClick={() => toggleReason(r)} className={cx("min-h-9 rounded-full px-3 text-[13px] font-semibold", reason.toLowerCase().includes(r.toLowerCase()) ? "bg-ink text-card" : "bg-sand ring-1 ring-sand-deep")}>
                      {r}
                    </button>
                  ))}
                </div>
                <div className="flex items-start gap-2">
                  <textarea
                    aria-label="Motivo del ritocco"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder="Es. Le ripetute le ha fatte a 4:30 invece di 5:00 e dice che poteva spingere di più"
                    className="min-w-0 flex-1 rounded-xl border border-sand-deep bg-sand px-3 py-2.5 text-[15px] leading-relaxed"
                  />
                  <DictateButton onText={(t) => setReason((v) => (v ? `${v.trimEnd()} ${t}` : t))} />
                </div>
              </fieldset>

              {error ? <p className="rounded-2xl bg-accent-soft px-4 py-3 text-[15px]" role="alert">{error}</p> : null}
            </div>
          ) : (
            <div className="flex flex-col gap-4" data-retouch-review>
              {result.summary ? <p className="rounded-2xl bg-sand px-4 py-3 text-[15px] leading-relaxed">{result.summary}</p> : null}
              {groups.length === 0 ? (
                <p className="text-[15px]">L&apos;AI non propone cambiamenti. Puoi riprovare con un motivo più preciso.</p>
              ) : (
                groups.map((g) => (
                  <section key={g.itemId} className="flex flex-col gap-2 rounded-2xl ring-1 ring-sand-deep" data-retouch-item={g.itemId}>
                    <div className="px-4 pt-3">
                      <div className="font-semibold break-words">{g.label} {g.name}</div>
                      <div className="text-sm text-muted">{g.dayTitle}{g.reason ? ` · ${g.reason}` : ""}</div>
                    </div>
                    <ul className="flex flex-col pb-2">
                      {g.rows.map((r) => (
                        <li key={r.key}>
                          <label className="flex cursor-pointer items-start gap-3 px-4 py-2 hover:bg-sand/60">
                            <input type="checkbox" checked={accepted.has(r.key)} onChange={() => toggle(r.key)} className="mt-1 h-5 w-5 shrink-0 accent-[#1b1a17]" data-retouch-row={r.key} />
                            <span className="min-w-0 flex-1 text-[15px]">
                              <span className="block text-xs font-semibold tracking-wider text-muted uppercase">{r.what}</span>
                              <span className="block break-words text-muted line-through decoration-1">{r.before}</span>
                              <span className="block font-semibold break-words">{r.after}</span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))
              )}
            </div>
          )}
        </div>

        {!allDone ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-sand-deep px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-5">
            {!result ? (
              <button type="button" onClick={ask} disabled={busy} className="inline-flex min-h-12 items-center gap-3 rounded-full bg-ink py-1.5 pr-5 pl-1.5 font-semibold text-card disabled:opacity-60" data-retouch-ask>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent"><IconSparkle size={18} /></span>
                {busy ? `Ci penso… ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}` : "Proponi le modifiche"}
              </button>
            ) : (
              <>
                {groups.length ? (
                  <button type="button" disabled={!count} onClick={() => onApply(result.changes, accepted, result.summary, reason)} className="min-h-12 rounded-full bg-ink px-5 font-semibold text-card disabled:opacity-50" data-retouch-apply>
                    {count === 1 ? "Applica 1 modifica" : `Applica ${count} modifiche`}
                  </button>
                ) : null}
                <button type="button" onClick={() => setResult(null)} className="min-h-12 rounded-full px-4 font-semibold ring-1 ring-sand-deep">Cambia le indicazioni</button>
              </>
            )}
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function Choice({ checked, onChange, label, hint, children }: { checked: boolean; onChange: () => void; label: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className={cx("rounded-2xl px-4 py-3 ring-1", checked ? "bg-sand ring-ink" : "ring-sand-deep")}>
      <label className="flex cursor-pointer items-start gap-3">
        <input type="radio" checked={checked} onChange={onChange} className="mt-1 h-5 w-5 shrink-0 accent-[#1b1a17]" />
        <span className="min-w-0">
          <span className="block font-semibold break-words">{label}</span>
          {hint ? <span className="block text-sm text-muted">{hint}</span> : null}
        </span>
      </label>
      {children}
    </div>
  );
}
