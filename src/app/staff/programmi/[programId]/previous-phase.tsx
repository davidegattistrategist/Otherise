"use client";

/**
 * Pannello "Fase precedente" dell'editor: la fase vecchia del cliente da
 * consultare senza uscire (sul computer accanto all'editor, sul telefono
 * dal basso). Segue il giorno e l'esercizio che stai scrivendo: in cima
 * "Stai scrivendo" con quell'esercizio settimana per settimana, cosa era
 * scritto e cosa ha fatto. Si carica solo la prima volta che lo apri e poi
 * resta pronto (chiuso = nascosto, l'editor non si muove).
 */
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { formatShort } from "@/lib/dates";
import { findExercise, type CompareView, type PhaseOption } from "@/lib/program/compare";
import { Select, cx } from "@/components/ui";
import { IconX } from "@/components/icons";
import { loadPreviousPhase } from "./previous-actions";
import { EDITOR_FOCUS_EVENT, lastEditorFocus, type EditorFocus } from "./editor-focus";

const DESKTOP = "(min-width: 1024px)";

export default function PreviousPhase({ programId, open, onClose }: { programId: string; open: boolean; onClose: () => void }) {
  const [phases, setPhases] = useState<PhaseOption[]>([]);
  const [view, setView] = useState<CompareView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, startLoading] = useTransition();
  const [week, setWeek] = useState(0);
  const [dayIdx, setDayIdx] = useState(0);
  const [focus, setFocus] = useState<EditorFocus>(lastEditorFocus);
  const body = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const dayCount = useRef(0);

  const load = (otherId?: string) =>
    startLoading(async () => {
      try {
        const r = await loadPreviousPhase(programId, otherId);
        setPhases(r.phases);
        setView(r.view);
        dayCount.current = r.view?.days.length ?? 0;
        setError(r.error ?? null);
        if (r.view) {
          // di partenza l'ultima settimana registrata (i carichi più recenti), altrimenti l'ultima
          setWeek(r.view.loggedWeeks.at(-1) ?? r.view.weeks - 1);
          const d = lastEditorFocus().dayIndex;
          setDayIdx(d !== null && d < r.view.days.length ? d : 0);
        }
      } catch {
        setError("Non riesco a caricare la fase precedente: controlla la connessione e riprova.");
      }
      setLoaded(true);
    });

  useEffect(() => {
    if (open && !loaded && !loading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // segue il giorno e l'esercizio che stai scrivendo
  useEffect(() => {
    const on = (e: Event) => {
      const f = (e as CustomEvent<EditorFocus>).detail;
      setFocus(f);
      // stesso giorno anche nel pannello (se la fase vecchia ce l'ha)
      if (f.dayIndex !== null && f.dayIndex < dayCount.current) setDayIdx(f.dayIndex);
    };
    window.addEventListener(EDITOR_FOCUS_EVENT, on);
    return () => window.removeEventListener(EDITOR_FOCUS_EVENT, on);
  }, []);

  // telefono: la pagina sotto non scorre (e resta dov'era); Esc chiude
  useEffect(() => {
    if (!open) return;
    const phone = !window.matchMedia(DESKTOP).matches;
    const html = document.documentElement;
    const before = html.style.overflow;
    if (phone) {
      html.style.overflow = "hidden";
      closeBtn.current?.focus({ preventScroll: true });
    } else html.dataset.sidePanel = "1";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      html.style.overflow = before;
      delete html.dataset.sidePanel;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const found = useMemo(() => (view && focus.key ? findExercise(view, focus.key) : []), [view, focus.key]);
  const day = view?.days[Math.min(dayIdx, (view?.days.length ?? 1) - 1)];

  // cambi esercizio: il pannello torna in cima, dove c'è "Stai scrivendo"
  useEffect(() => {
    if (open && focus.key) body.current?.scrollTo({ top: 0 });
  }, [focus.key, open]);

  const year = new Date().getFullYear();
  const phaseLabel = (p: PhaseOption) => `${p.title || "Senza titolo"}${p.start_date ? ` · dal ${formatShort(p.start_date, year)}` : ""}`;

  return (
    <div className={cx("fixed inset-0 z-50 lg:inset-auto lg:top-0 lg:right-0 lg:bottom-0 lg:z-40 lg:w-[var(--side-panel)]", !open && "hidden")} data-previous-phase>
      <button type="button" aria-label="Chiudi la fase precedente" onClick={onClose} className="absolute inset-0 bg-ink/35 lg:hidden" />
      <aside
        role="dialog"
        aria-label="Fase precedente"
        className="absolute inset-x-0 bottom-0 flex h-[88dvh] flex-col overflow-hidden rounded-t-[28px] bg-card shadow-2xl lg:static lg:h-full lg:rounded-none lg:border-l lg:border-sand-deep lg:shadow-xl"
      >
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-sand-deep lg:hidden" aria-hidden />
        <div className="flex shrink-0 flex-col gap-2.5 border-b border-sand-deep px-4 pt-3 pb-3 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold tracking-[0.12em] text-muted uppercase">Fase precedente</div>
            <button ref={closeBtn} type="button" onClick={onClose} className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-ink px-3.5 text-sm font-semibold whitespace-nowrap text-card">
              <IconX size={16} /> <span>Torna al programma</span>
            </button>
          </div>
          {phases.length > 1 ? (
            <Select aria-label="Scegli la fase" value={view?.id ?? ""} onChange={(e) => load(e.target.value)} disabled={loading}>
              {phases.map((p) => (
                <option key={p.id} value={p.id}>{phaseLabel(p)}</option>
              ))}
            </Select>
          ) : view ? (
            <div className="text-[17px] font-semibold">{phaseLabel(phases[0] ?? { id: view.id, title: view.title, start_date: view.start_date, weeks: view.weeks, status: "" })}</div>
          ) : null}
          {view ? (
            <>
              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Settimana della fase precedente">
                {Array.from({ length: view.weeks }, (_, w) => (
                  <button key={w} type="button" role="tab" aria-selected={w === week} aria-label={`Settimana ${w + 1}${view.loggedWeeks.includes(w) ? ", con allenamenti registrati" : ""}`} onClick={() => setWeek(w)} className={cx("relative min-h-9 min-w-11 rounded-full px-3 text-sm font-semibold", w === week ? "bg-ink text-card" : "bg-sand")}>
                    S{w + 1}
                    {view.loggedWeeks.includes(w) ? <span className={cx("absolute top-1 right-1.5 size-1.5 rounded-full", w === week ? "bg-accent" : "bg-accent-deep")} aria-hidden /> : null}
                  </button>
                ))}
              </div>
              {view.days.length > 1 ? (
                <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Giorno della fase precedente">
                  {view.days.map((d, i) => (
                    <button key={d.id} type="button" role="tab" aria-selected={i === dayIdx} title={d.title} onClick={() => setDayIdx(i)} className={cx("min-h-9 max-w-[11rem] truncate rounded-full px-3 text-sm font-semibold", i === dayIdx ? "bg-ink text-card" : "bg-sand")}>
                      {d.title.split("·")[0].trim() || `Giorno ${i + 1}`}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <div ref={body} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {!loaded || (loading && !view) ? (
            <p className="text-sm text-muted">Carico la fase precedente…</p>
          ) : error ? (
            <p className="text-sm text-accent-deep">{error}</p>
          ) : !view ? (
            <p className="text-[15px] text-muted">Non c&apos;è una fase precedente pubblicata per questo cliente.</p>
          ) : (
            <div className={cx("flex flex-col gap-4", loading && "opacity-50")}>
              {focus.key && focus.name ? (
                <section className="rounded-2xl bg-sand px-3.5 py-3" data-prev-focus>
                  <div className="text-xs text-muted">Stai scrivendo</div>
                  <div className="font-semibold">{focus.name}</div>
                  {found.length === 0 ? (
                    <p className="mt-1 text-sm text-muted">Non c&apos;era in questa fase.</p>
                  ) : (
                    found.slice(0, 2).map(({ dayIndex, day: d, item }) => (
                      <div key={d.id + item.id} className="mt-2">
                        {found.length > 1 || dayIndex !== dayIdx ? (
                          <button type="button" onClick={() => setDayIdx(dayIndex)} className="text-xs font-semibold text-ink-soft underline">{d.title || `Giorno ${dayIndex + 1}`} · {item.label}</button>
                        ) : null}
                        <table className="mt-1 w-full text-sm">
                          <thead className="table-head-hidden"><tr><th>Settimana</th><th>Scritto</th><th>Fatto</th></tr></thead>
                          <tbody>
                            {item.prescriptions.map((p, w) => (
                              <tr key={w} className={cx("align-baseline", w === week && "font-semibold")}>
                                <td className="w-9 py-0.5 pr-2 text-muted tabular">S{w + 1}</td>
                                <td className="py-0.5 pr-2">{p || "–"}</td>
                                <td className="py-0.5 text-ink-soft">{item.done[w] ? `fatto ${item.done[w]}` : <span className="text-muted">–</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))
                  )}
                </section>
              ) : (
                <p className="text-sm text-muted">Tocca un esercizio nel programma: qui vedi com&apos;era nella fase precedente, settimana per settimana.</p>
              )}

              {day ? (
                <section className="flex flex-col gap-3" aria-label={day.title}>
                  <h3 className="text-[17px] font-semibold">{day.title || `Giorno ${dayIdx + 1}`} <span className="text-sm font-normal text-muted">· settimana {week + 1}</span></h3>
                  {day.blocks.length === 0 ? <p className="text-sm text-muted">Giorno vuoto.</p> : null}
                  {day.blocks.map((b) => (
                    <div key={b.id} className={cx("flex flex-col", b.heading && "rounded-2xl bg-sand/50 px-3 py-2")}>
                      {b.heading ? <div className="mb-1 text-xs font-bold">{b.heading}</div> : null}
                      {b.text ? <p className="text-sm whitespace-pre-line text-ink-soft">{b.text}</p> : null}
                      {b.items.map((it) => {
                        const on = it.key === focus.key;
                        return (
                          <div key={it.id} data-prev-key={it.key} className={cx("flex gap-2.5 border-t border-sand-deep py-2 first:border-t-0", on && "-mx-2 rounded-xl border-transparent bg-accent-soft/50 px-2")}>
                            <span className="w-7 shrink-0 text-sm font-semibold text-muted">{it.label}</span>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold">{it.name}</div>
                              <div className="text-sm">
                                <span className="tabular">{it.prescriptions[week] || "–"}</span>
                                {it.rest ? <span className="text-muted"> · rec. {it.rest}</span> : null}
                              </div>
                              <div className="text-sm text-ink-soft">{it.done[week] ? `Fatto: ${it.done[week]}` : <span className="text-muted">Non registrato</span>}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </section>
              ) : null}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
