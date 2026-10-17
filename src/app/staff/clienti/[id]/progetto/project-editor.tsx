"use client";

/**
 * Editor del progetto annuale: una colonna per mese, la fase prevista, quanto
 * spingere ogni stimolo (tocca la cella per cambiare 0 → 1 → 2 → 3) e le note.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { loadDraft, useDraft } from "@/components/use-draft";
import { MONTHS, PROJECT_PHASES, PHASE_BY_KEY, inferPhase, levelLabel, projectMonths, rowId, type Project } from "@/lib/project";
import { Button, Card, Eyebrow, Input, Notice, Textarea, cx } from "@/components/ui";
import { IconPlus, IconX } from "@/components/icons";
import type { SaveProjectResult } from "./actions";

const NUTRITION_SHORT = ["—", "Deficit", "Normo", "Surplus"];

export function ProjectEditor({
  initial,
  initialVisible,
  isNew,
  clientName,
  canNotify,
  today,
  save,
}: {
  initial: Project;
  initialVisible: boolean;
  isNew: boolean;
  clientName: string;
  /** il cliente ha l'account: si può avvisare con una notifica */
  canNotify: boolean;
  today: string;
  save: (data: Project, visible: boolean, notifyClient: boolean) => Promise<SaveProjectResult>;
}) {
  const [p, setP] = useState<Project>(initial);
  const [visible, setVisible] = useState(initialVisible);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  // le modifiche non salvate restano (anche se chiudi l'app) finché non salvi
  const draftKey = `progetto:${usePathname()}`;
  const { adopt } = useDraft(draftKey, dirty ? p : null, { isEmpty: (v) => v === null });
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadDraft<Project>(draftKey).then((d) => {
      if (!alive || !d?.data) return;
      adopt(d.data, d.at);
      setP(d.data);
      setDirty(true);
      setRestored(true);
    });
    return () => {
      alive = false;
    };
  }, [draftKey, adopt]);
  const months = projectMonths(p.start);
  const now = months.findIndex((m) => m.key === today.slice(0, 7));

  const edit = (fn: (d: Project) => void) => {
    setP((cur) => {
      const d = structuredClone(cur);
      fn(d);
      return d;
    });
    setDirty(true);
    setMsg(null);
  };

  // progetto visibile: prima di salvare chiediamo se avvisare il cliente
  const [ask, setAsk] = useState<{ visible: boolean } | null>(null);
  const onSave = (nextVisible = visible) => {
    if (nextVisible && canNotify) setAsk({ visible: nextVisible });
    else doSave(nextVisible, false);
  };
  const doSave = (nextVisible: boolean, notifyClient: boolean) =>
    start(async () => {
      setAsk(null);
      const r = await save(p, nextVisible, notifyClient);
      if (r.ok) {
        setDirty(false);
        setVisible(nextVisible);
      }
      setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
    });

  const cell = "min-w-[92px] px-1 py-1.5 text-center";

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <Eyebrow>Progetto dei prossimi 12 mesi</Eyebrow>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              Come si susseguiranno le fasi e quanto spingere su ogni stimolo, mese per mese. {clientName} lo vede come una timeline nel suo Percorso quando lo rendi visibile, e l&apos;assistente AI lo usa per preparare le bozze.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isNew && !dirty ? <span className="text-sm text-muted">Non ancora salvato</span> : dirty ? <span className="text-sm text-muted">{restored ? "Ho ripreso le modifiche non salvate: salva quando vuoi" : "Modifiche da salvare (restano qui anche se esci)"}</span> : null}
            <Button onClick={() => onSave()} disabled={pending}>{pending ? "Salvataggio…" : "Salva"}</Button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
          <div>
            <label htmlFor="project-start" className="mb-1.5 block text-sm font-semibold">Primo mese</label>
            <Input id="project-start" type="month" value={p.start} onChange={(e) => e.target.value && edit((d) => void (d.start = e.target.value))} />
          </div>
          <div>
            <label htmlFor="project-goal" className="mb-1.5 block text-sm font-semibold">Obiettivo dell&apos;anno <span className="font-normal text-muted">lo vede anche il cliente</span></label>
            <Textarea id="project-goal" rows={2} value={p.goal} placeholder="Es. preparare la HYROX di marzo e arrivare a 80 kg" onChange={(e) => edit((d) => void (d.goal = e.target.value))} />
          </div>
        </div>
        <label className="flex items-start gap-3 text-[15px]">
          <input
            type="checkbox"
            checked={visible}
            onChange={(e) => onSave(e.target.checked)}
            className="mt-1 h-5 w-5 accent-[#1b1a17]"
          />
          <span><strong>Visibile al cliente</strong><br /><span className="text-muted">Quando salvi ti chiedo se mandare una notifica. Puoi cambiare il progetto quando vuoi.</span></span>
        </label>
        {msg ? <Notice tone={msg.ok ? "success" : "error"}>{msg.text}</Notice> : null}
      </Card>

      <Card className="p-0">
        <div className="scroll-x overflow-x-auto p-4 sm:p-5">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 min-w-[180px] bg-card px-2 py-2 text-left text-xs tracking-wider text-muted uppercase">Mese</th>
                {months.map((m, i) => (
                  <th key={m.key} scope="col" className={cx(cell, "text-xs font-semibold tracking-wider uppercase", i === now ? "rounded-t-xl bg-accent-soft/60 text-accent-deep" : "text-muted")}>
                    {m.short}
                    <span className="block text-[10px] font-normal normal-case">{m.year}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-sand-deep">
                <th scope="row" className="sticky left-0 z-10 bg-card px-2 py-2 text-left font-semibold">Fase</th>
                {months.map((m, i) => {
                  // senza fase scelta si mostra quella dedotta dalla forza prioritaria ("Auto")
                  const auto = p.phases[i] ? "" : inferPhase(p, i);
                  const ph = PHASE_BY_KEY.get(p.phases[i] || auto);
                  return (
                    <td key={m.key} className={cx(cell, i === now && "bg-accent-soft/60")}>
                      <select
                        aria-label={`Fase di ${m.long}`}
                        title={auto && ph ? `${ph.label}, dedotta dalla forza prioritaria: scegline una per fissarla` : ph?.label}
                        value={p.phases[i]}
                        onChange={(e) => edit((d) => void (d.phases[i] = e.target.value))}
                        className={cx("w-full rounded-lg px-1 py-1.5 text-xs font-semibold", ph ? "" : "bg-sand text-muted", auto && "opacity-70 outline-1 outline-dashed outline-offset-[-2px] outline-current")}
                        data-auto-phase={auto || undefined}
                        style={ph ? { background: ph.color, color: ["race", "volume", "intensity"].includes(ph.key) ? "#f6f2eb" : "#1b1a17" } : undefined}
                      >
                        <option value="">{auto ? PHASE_BY_KEY.get(auto)?.short : "—"}</option>
                        {PROJECT_PHASES.map((x) => <option key={x.key} value={x.key}>{x.short}</option>)}
                      </select>
                    </td>
                  );
                })}
              </tr>
              {p.rows.map((r, ri) => (
                <tr key={r.id} className="border-t border-sand-deep">
                  <th scope="row" className="sticky left-0 z-10 bg-card px-2 py-1.5 text-left">
                    <span className="flex items-center gap-1">
                      <input
                        aria-label="Nome dello stimolo"
                        value={r.label}
                        onChange={(e) => edit((d) => void (d.rows[ri].label = e.target.value))}
                        className="w-full min-w-0 rounded-md bg-transparent px-1 py-1 text-sm font-semibold hover:bg-sand focus:bg-sand"
                      />
                      <button type="button" aria-label={`Togli ${r.label || "stimolo"}`} onClick={() => edit((d) => void d.rows.splice(ri, 1))} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-sand hover:text-ink">
                        <IconX size={14} />
                      </button>
                    </span>
                  </th>
                  {r.values.map((v, i) => (
                    <td key={i} className={cx(cell, i === now && "bg-accent-soft/60")}>
                      <button
                        type="button"
                        aria-label={`${r.label}, ${months[i].long}: ${levelLabel(r.kind, v)}. Tocca per cambiare`}
                        title={levelLabel(r.kind, v)}
                        onClick={() => edit((d) => void (d.rows[ri].values[i] = (v + 1) % 4))}
                        className="flex h-9 w-full items-center justify-center gap-0.5 rounded-lg hover:bg-sand"
                      >
                        {r.kind === "nutrition" ? (
                          <span className={cx("text-xs", v ? "font-semibold" : "text-muted")}>{NUTRITION_SHORT[v]}</span>
                        ) : (
                          [1, 2, 3].map((n) => <span key={n} className={cx("h-4 w-2.5 rounded-sm", n <= v ? "bg-ink" : "bg-sand-deep")} />)
                        )}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t border-sand-deep">
                <th scope="row" className="sticky left-0 z-10 bg-card px-2 py-2 text-left font-semibold">Note</th>
                {months.map((m, i) => (
                  <td key={m.key} className={cx(cell, i === now && "bg-accent-soft/60")}>
                    <input
                      aria-label={`Nota di ${m.long}`}
                      value={p.notes[i]}
                      maxLength={120}
                      placeholder="…"
                      onChange={(e) => edit((d) => void (d.notes[i] = e.target.value))}
                      className="w-full rounded-md bg-sand px-1.5 py-1.5 text-xs"
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => edit((d) => void d.rows.push({ id: rowId(), label: "Nuovo stimolo", kind: "training", values: Array(MONTHS).fill(0) }))} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold ring-1 ring-sand-deep hover:bg-sand">
              <IconPlus size={14} /> Stimolo
            </button>
            {!p.rows.some((r) => r.kind === "nutrition") ? (
              <button type="button" onClick={() => edit((d) => void d.rows.push({ id: rowId(), label: "Alimentazione", kind: "nutrition", values: Array(MONTHS).fill(0) }))} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold ring-1 ring-sand-deep hover:bg-sand">
                <IconPlus size={14} /> Alimentazione
              </button>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={() => onSave()} disabled={pending}>{pending ? "Salvataggio…" : "Salva il progetto"}</Button>
            {dirty ? <span className="text-sm text-muted">Modifiche da salvare</span> : msg ? <span className={cx("text-sm", msg.ok ? "text-muted" : "text-accent-deep")}>{msg.ok ? "Salvato" : "Non salvato: guarda il messaggio in alto"}</span> : null}
          </div>
          <p className="mt-3 text-sm text-muted">Tocca una cella per cambiare il livello: vuoto = assente, poi mantenimento, medio, alto. Per l&apos;alimentazione: non trattata, deficit, normocalorica, surplus. Nelle note: gare, vacanze, obiettivi del mese. Fase con il bordo tratteggiato: non l&apos;hai scelta e la deduco dalla forza prioritaria (massima → intensificazione, resistente o massa magra → volumizzazione, pari → transizione); cambia da sola se cambi i livelli, sceglila tu per fissarla.</p>
        </div>
      </Card>
      {ask ? <NotifyDialog clientName={clientName} pending={pending} onChoose={(n) => doSave(ask.visible, n)} onClose={() => setAsk(null)} /> : null}
    </div>
  );
}

/** "Mandi una notifica?": finestra in basso sul telefono, al centro sul computer. */
function NotifyDialog({ clientName, pending, onChoose, onClose }: { clientName: string; pending: boolean; onChoose: (notify: boolean) => void; onClose: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-ink/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notify-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-t-[28px] bg-card px-5 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-[28px] sm:px-6 sm:pb-6">
        <div className="mb-2 flex items-start justify-between gap-3">
          <h2 id="notify-title" className="text-[20px] leading-tight font-semibold">Mandi una notifica a {clientName}?</h2>
          <button type="button" onClick={onClose} className="-mt-2 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-ink/5" aria-label="Chiudi senza salvare">
            <IconX size={20} />
          </button>
        </div>
        <p className="text-[15px] leading-relaxed text-muted">Il progetto è visibile nel suo Percorso. Con una notifica sa subito che c&apos;è qualcosa di nuovo da guardare.</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <Button ref={first} onClick={() => onChoose(true)} disabled={pending} className="w-full sm:w-auto">Sì, manda la notifica</Button>
          <Button variant="secondary" onClick={() => onChoose(false)} disabled={pending} className="w-full sm:w-auto">Salva senza notifica</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
