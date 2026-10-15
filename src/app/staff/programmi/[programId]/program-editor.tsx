"use client";

/**
 * Editor del programma: una griglia esercizio × settimana, come i fogli
 * Google, raggruppata in giorni e blocchi (superserie, circuiti, AMRAP…).
 * Il contenuto si salva con "Salva" (o Ctrl/Cmd+S).
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  BLOCK_KIND_LABELS,
  BLOCK_KINDS,
  blockLetter,
  emptyBlock,
  emptyDay,
  emptyItem,
  itemLabel,
  normalizeWeeks,
  type BlockKind,
  type ProgramBlock,
  type ProgramContent,
  type ProgramItem,
} from "@/lib/program/types";
import { copyWeekToOthers, duplicateDay } from "@/lib/program/next-phase";
import { PROGRESSION_RULES, progressPrescriptions, type ProgressionRule } from "@/lib/program/progression";
import { Button, Card, Eyebrow, Input, Notice, Pill, Select, Textarea, buttonClass, cx } from "@/components/ui";
import { IconArrowLeft, IconCopy, IconDown, IconPlus, IconSparkle, IconTrash, IconUp, IconX } from "@/components/icons";
import {
  addMissingExercises,
  archiveProgram,
  deleteProgram,
  publishProgram,
  saveAsTemplate,
  saveProgram,
  setAiExample,
  unpublishProgram,
} from "../actions";
import { AiPanel, RowAiButtons } from "./ai-tools";
import { estimateDayMinutes } from "@/lib/program/balance";
import { useOpenDays } from "@/components/use-open-days";
import { keepInView } from "@/components/one-day-open";
import { clearDraft, loadDraft, useDraft } from "@/components/use-draft";

export type EditorProgram = {
  id: string;
  title: string;
  description: string;
  weeks: number;
  start_date: string | null;
  session_minutes: number | null;
  status: "draft" | "published" | "archived";
  is_template: boolean;
  is_ai_example: boolean;
  updated_at: string;
  client_id: string | null;
  source: string;
  ai_notes: Record<string, string> | null;
};

export type LibraryExercise = { id: string; name: string; video_url: string | null };

type Props = {
  program: EditorProgram;
  initialContent: ProgramContent;
  exercises: LibraryExercise[];
  lastLogs: Record<string, string>;
  nextPhaseNotes: { label: string; text: string } | null;
  clientName: string | null;
  aiEnabled: boolean;
  backHref: string;
  /** Allenamenti già registrati dal cliente su questo programma */
  loggedWorkouts?: number;
};

const STATUS_LABEL = { draft: "Bozza", published: "Pubblicato", archived: "Archiviato" } as const;

export function ProgramEditor({ program, initialContent, exercises, lastLogs, nextPhaseNotes, clientName, aiEnabled, backHref, loggedWorkouts = 0 }: Props) {
  const [title, setTitle] = useState(program.title);
  const [description, setDescription] = useState(program.description);
  const [weeks, setWeeks] = useState(program.weeks);
  const [startDate, setStartDate] = useState(program.start_date ?? "");
  const [minutes, setMinutes] = useState(program.session_minutes ? String(program.session_minutes) : "");
  const [content, setContent] = useState<ProgramContent>(() => normalizeWeeks(initialContent, program.weeks));
  const [aiNotes, setAiNotes] = useState<Record<string, string>>(program.ai_notes ?? {});
  const [updatedAt, setUpdatedAt] = useState(program.updated_at);
  const [dirty, setDirty] = useState(false);
  // ogni modifica conta: se arriva mentre un salvataggio è in corso, resta "da salvare"
  const edits = useRef(0);
  const markDirty = useCallback(() => {
    edits.current += 1;
    setDirty(true);
  }, []);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState(program.status);
  const [isExample, setIsExample] = useState(program.is_ai_example);
  const [mobileWeek, setMobileWeek] = useState(0);
  // giorni chiusi di partenza, tranne quelli ancora vuoti
  const days = useOpenDays(() => normalizeWeeks(initialContent, program.weeks).days.filter((d) => !d.blocks.some((b) => b.items.some((it) => it.name.trim()))).map((d) => d.id));

  const exerciseByName = useMemo(() => new Map(exercises.map((e) => [e.name.trim().toLowerCase(), e])), [exercises]);
  const exerciseById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);

  const mutate = useCallback((fn: (d: ProgramContent) => void) => {
    setContent((c) => {
      const d = structuredClone(c);
      fn(d);
      return d;
    });
    markDirty();
  }, [markDirty]);

  /** Salva subito; restituisce l'errore (o null se è andato bene). */
  const saveNow = useCallback(async (): Promise<string | null> => {
    const version = edits.current;
    {
      const res = await saveProgram(program.id, {
        title,
        description,
        weeks,
        start_date: program.is_template ? null : startDate || null,
        session_minutes: Number(minutes) >= 10 && Number(minutes) <= 240 ? Math.round(Number(minutes)) : null,
        content,
        expected_updated_at: updatedAt,
        ai_notes: aiNotes,
      });
      if (res.ok) {
        setUpdatedAt(res.updated_at);
        if (edits.current === version) setDirty(false);
        setSavedAt(new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }));
        setUnknown(res.unknownExercises);
        setMessage(null);
        return null;
      }
      setMessage({ tone: "error", text: res.error });
      return res.error;
    }
  }, [program.id, program.is_template, title, description, weeks, startDate, minutes, content, updatedAt, aiNotes]);
  const doSave = useCallback(() => {
    startTransition(async () => {
      await saveNow();
    });
  }, [saveNow]);

  // Salvataggio automatico:
  // - bozze e modelli si salvano da soli 2 secondi dopo l'ultima modifica;
  // - un programma pubblicato no (il cliente vedrebbe le modifiche a metà):
  //   le modifiche restano come bozza su questo dispositivo e sul server e,
  //   se esci senza salvare, alla riapertura le ritrovi.
  type Snapshot = { base: string; title: string; description: string; weeks: number; startDate: string; minutes: string; content: ProgramContent };
  const draftKey = `programma:${program.id}`;
  const snapshot: Snapshot | null = dirty ? { base: updatedAt, title, description, weeks, startDate, minutes, content } : null;
  const backup = useDraft(draftKey, snapshot, { isEmpty: (v) => v === null });
  const [restored, setRestored] = useState<number | null>(null);
  const { adopt: adoptBackup } = backup;
  useEffect(() => {
    let alive = true;
    void loadDraft<Snapshot>(draftKey).then((d) => {
      if (!alive || !d?.data) return;
      // solo se nel frattempo il programma non è stato salvato da un'altra parte
      if (d.data.base !== program.updated_at) {
        clearDraft(draftKey);
        return;
      }
      adoptBackup(d.data, d.at);
      setTitle(d.data.title);
      setDescription(d.data.description);
      setWeeks(d.data.weeks);
      setStartDate(d.data.startDate);
      setMinutes(d.data.minutes);
      setContent(normalizeWeeks(d.data.content, d.data.weeks));
      markDirty();
      setRestored(d.at);
    });
    return () => {
      alive = false;
    };
  }, [draftKey, program.updated_at, adoptBackup, markDirty]);
  const autoSave = status !== "published" || program.is_template;
  useEffect(() => {
    if (!dirty || !autoSave || pending) return;
    const t = setTimeout(() => doSave(), 2000);
    return () => clearTimeout(t);
  }, [dirty, autoSave, pending, doSave]);

  // Ctrl/Cmd+S salva
  const saveRef = useRef(doSave);
  useEffect(() => {
    saveRef.current = doSave;
  }, [doSave]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // avviso se si esce con modifiche non salvate (un programma pubblicato: le
  // modifiche restano comunque come bozza e si ritrovano alla riapertura)
  useEffect(() => {
    if (!dirty || autoSave) return;
    const onBefore = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    // anche i link dentro l'app (menu, "indietro"): chiedi prima di perdere le modifiche
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      if (!window.confirm("Hai modifiche non salvate. Uscire senza salvarle?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBefore);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBefore);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, autoSave]);

  /** Copia la settimana w sulle successive vuote (da computer e da telefono). */
  const copyForward = (w: number) => {
    setContent((c) => copyWeekForward(c, w, weeks));
    markDirty();
  };

  const changeWeeks = (n: number) => {
    const losing = content.days.some((d) => d.blocks.some((b) => b.items.some((it) => it.prescriptions.slice(n).some((p) => p.trim()))));
    if (losing && !window.confirm(`Le settimane dalla ${n + 1} in poi contengono prescrizioni che verranno cancellate. Continuare?`)) return;
    setWeeks(n);
    setContent((c) => normalizeWeeks(c, n));
    markDirty();
  };

  const runAction = (fn: () => Promise<{ ok?: boolean; error?: string; message?: string; updated_at?: string } | null>, after?: () => void) => {
    startTransition(async () => {
      const r = await fn();
      if (r?.error) setMessage({ tone: "error", text: r.error });
      else {
        // il programma è cambiato sul server: il prossimo Salva parte da qui
        if (r?.updated_at) setUpdatedAt(r.updated_at);
        if (r?.message) setMessage({ tone: "success", text: r.message });
        after?.();
      }
    });
  };

  const setItemName = (dayIdx: number, blockIdx: number, itemIdx: number, name: string) =>
    mutate((d) => {
      const it = d.days[dayIdx].blocks[blockIdx].items[itemIdx];
      it.name = name;
      it.exerciseId = exerciseByName.get(name.trim().toLowerCase())?.id ?? null;
    });

  const lastLogFor = (it: ProgramItem) => (it.exerciseId ? lastLogs[it.exerciseId] : undefined) ?? lastLogs[`n:${it.name.trim().toLowerCase()}`];

  const hasContent = content.days.some((d) => d.blocks.length > 0);
  const unnamed = content.days.reduce((n, d) => n + d.blocks.reduce((m, b) => m + (b.kind === "text" ? 0 : b.items.filter((it) => !it.name.trim()).length), 0), 0);

  return (
    <div className="flex flex-col gap-5">
      {/* barra in alto */}
      <div className="flex flex-col gap-4">
        <Link href={backHref} className="flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink">
          <IconArrowLeft size={18} /> {clientName ? clientName : "Modelli di programma"}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-[1_1_420px]">
            <label htmlFor="program-title" className="sr-only">Nome del programma</label>
            <input
              id="program-title"
              data-large
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                markDirty();
              }}
              className="w-full rounded-xl bg-transparent px-1 py-1 text-[32px] leading-tight font-normal tracking-tight hover:bg-card focus:bg-card focus:outline-none"
              placeholder="Nome della fase (es. Intensificazione 2)"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2 px-1 text-sm text-muted">
              <Pill active={status === "published"}>{program.is_template ? "Modello" : STATUS_LABEL[status]}</Pill>
              {program.source === "ai" ? <Pill><IconSparkle size={14} /> Bozza preparata con l&apos;AI</Pill> : null}
              <span aria-live="polite">{pending ? "Salvataggio…" : dirty ? (autoSave ? "Salvo tra un attimo…" : "Modifiche da salvare (intanto restano qui anche se esci)") : savedAt ? `Salvato alle ${savedAt}${autoSave ? " (si salva da solo)" : ""}` : ""}</span>
              {restored ? <span className="rounded-full bg-sand-deep px-3 py-1 text-ink">Non si è perso niente: ci sono le modifiche che non avevi salvato.</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Button onClick={doSave} disabled={pending} variant={dirty ? "primary" : "secondary"}>
              Salva
            </Button>
            {!program.is_template && status === "draft" ? (
              <Button
                variant="secondary"
                disabled={pending || !hasContent}
                onClick={() => {
                  if (unnamed && !window.confirm(`${unnamed === 1 ? "C'è un esercizio senza nome" : `Ci sono ${unnamed} esercizi senza nome`}: il cliente vedrebbe righe vuote. Pubblicare lo stesso?`)) return;
                  // con modifiche da salvare: prima salva, poi pubblica (un tocco solo)
                  runAction(async () => {
                    if (dirty) {
                      const err = await saveNow();
                      if (err) return { error: err };
                    }
                    return publishProgram(program.id);
                  }, () => { setStatus("published"); setAiNotes({}); });
                }}
              >
                Pubblica
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* sul telefono il pulsante Salva in alto sparisce scorrendo: barra fissa quando ci sono modifiche */}
      {dirty ? (
        <div className="fixed right-[var(--edge-right)] bottom-[calc(var(--nav-space)+0.5rem)] left-[var(--edge-left)] z-40 flex items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-2.5 text-card shadow-xl lg:hidden">
          <span className="text-sm">{pending ? "Salvataggio…" : "Modifiche non salvate"}</span>
          <Button size="sm" variant="secondary" onClick={doSave} disabled={pending}>Salva le modifiche</Button>
        </div>
      ) : null}

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {unknown.length > 0 ? (
        <Notice tone="info">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {unknown.length === 1 ? `“${unknown[0]}” non è nell'eserciziario.` : `${unknown.length} esercizi non sono nell'eserciziario (${unknown.slice(0, 3).join(", ")}${unknown.length > 3 ? "…" : ""}).`} Aggiungendoli potrai collegare video e descrizione.
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                runAction(async () => {
                  const r = await addMissingExercises(program.id);
                  if (r.content) setContent(normalizeWeeks(r.content, weeks));
                  if (r.updated_at) setUpdatedAt(r.updated_at);
                  setUnknown([]);
                  return r;
                })
              }
            >
              Aggiungi all&apos;eserciziario
            </Button>
          </div>
        </Notice>
      ) : null}

      {/* impostazioni del programma */}
      <Card>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
          <div>
            <label htmlFor="weeks" className="mb-1.5 block text-sm font-semibold">Settimane</label>
            <Select id="weeks" value={weeks} onChange={(e) => changeWeeks(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n} {n === 1 ? "settimana" : "settimane"}</option>
              ))}
            </Select>
          </div>
          {!program.is_template ? (
            <div>
              <label htmlFor="start" className="mb-1.5 block text-sm font-semibold">Inizio</label>
              <Input
                id="start"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  markDirty();
                }}
              />
            </div>
          ) : null}
          <div>
            <label htmlFor="minutes" className="mb-1.5 block text-sm font-semibold">
              Tempo per seduta <span className="font-normal text-muted">minuti, facoltativo</span>
            </label>
            <Input
              id="minutes"
              inputMode="numeric"
              placeholder="es. 60"
              value={minutes}
              onChange={(e) => {
                setMinutes(e.target.value.replace(/[^0-9]/g, "").slice(0, 3));
                markDirty();
              }}
            />
          </div>
          <div className="[grid-column:1/-1]">
            <label htmlFor="desc" className="mb-1.5 block text-sm font-semibold">
              Note del programma <span className="font-normal text-muted">{program.is_template ? "" : "le vede il cliente"}</span>
            </label>
            <Textarea
              id="desc"
              rows={2}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                markDirty();
              }}
              placeholder="Obiettivo della fase, indicazioni generali, riscaldamento…"
            />
          </div>
        </div>
        {nextPhaseNotes ? (
          <div className="mt-5 rounded-2xl bg-sand px-4 py-3">
            <Eyebrow>Note per la prossima fase · {/^\d/.test(nextPhaseNotes.label) ? `check del ${nextPhaseNotes.label}` : nextPhaseNotes.label}</Eyebrow>
            <p className="mt-1.5 text-[15px] leading-relaxed whitespace-pre-line">{nextPhaseNotes.text}</p>
          </div>
        ) : null}
      </Card>

      {aiEnabled && program.client_id ? (
        <AiPanel
          programId={program.id}
          disabled={pending}
          dirty={dirty}
          onApply={(next, notes, nextWeeks, nextMinutes) => {
            if (nextWeeks && nextWeeks !== weeks) setWeeks(nextWeeks);
            if (nextMinutes) setMinutes(String(nextMinutes));
            setContent(normalizeWeeks(next, nextWeeks ?? weeks));
            days.setAll(next.days.map((d) => d.id), true);
            setAiNotes(notes);
            markDirty();
            setMessage({ tone: "info", text: "Bozza dell'AI applicata: le modifiche sono evidenziate. Rivedi le caselle e salva quando sei soddisfatto." });
          }}
          currentContent={content}
          weeks={weeks}
        />
      ) : null}

      {/* giorni: chiusi di partenza, si aprono e chiudono a piacimento */}
      {content.days.length > 1 ? (
        <div className="-mb-2 flex flex-wrap items-center justify-end gap-2">
          <button type="button" className={buttonClass("ghost", "sm")} onClick={() => days.setAll(content.days.map((d) => d.id), true)}>Apri tutti i giorni</button>
          <button type="button" className={buttonClass("ghost", "sm")} onClick={() => days.setAll(content.days.map((d) => d.id), false)}>Chiudi tutti</button>
        </div>
      ) : null}
      {content.days.map((day, dayIdx) => {
        const open = days.isOpen(day.id);
        const names = day.blocks.flatMap((b) => b.items.map((it) => it.name.trim())).filter(Boolean);
        return (
        <Card key={day.id} className="!p-0" data-day-card>
          <div className={cx("flex flex-wrap items-center gap-3 px-5 pt-5 sm:px-6", !open && "pb-1")}>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={`daybody-${day.id}`}
              aria-label={`${open ? "Chiudi" : "Apri"} ${day.title || "il giorno"}`}
              onClick={(e) => { const opening = !open; days.toggle(day.id, content.days.map((d) => d.id)); if (opening) keepInView(e.currentTarget.closest("[data-day-card]")); }}
              className="-ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-sand"
            >
              <IconDown size={20} className={cx("transition-transform", open && "rotate-180")} />
            </button>
            <label htmlFor={`day-${day.id}`} className="sr-only">Nome del giorno</label>
            <input
              id={`day-${day.id}`}
              data-large
              value={day.title}
              onChange={(e) => mutate((d) => void (d.days[dayIdx].title = e.target.value))}
              className="min-w-[13rem] flex-[1_1_13rem] rounded-lg bg-transparent px-1 py-1 text-xl font-semibold hover:bg-sand focus:bg-sand focus:outline-none"
            />
            {(() => {
              const est = estimateDayMinutes(day);
              const limit = Number(minutes) || null;
              return est > 0 ? (
                <span title="Stima con cambi esercizio, serie di avvicinamento e recuperi" className={cx("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular", limit && est > limit + 5 ? "bg-accent-soft text-accent-deep" : "bg-sand text-muted")} data-testid="day-minutes">
                  ~{est} min{limit && est > limit + 5 ? ` · oltre i ${limit}` : ""}
                </span>
              ) : null;
            })()}
            <div className="flex gap-1">
              <IconBtn label="Sposta su" disabled={dayIdx === 0} onClick={() => mutate((d) => swap(d.days, dayIdx, dayIdx - 1))}><IconUp size={18} /></IconBtn>
              <IconBtn label="Sposta giù" disabled={dayIdx === content.days.length - 1} onClick={() => mutate((d) => swap(d.days, dayIdx, dayIdx + 1))}><IconDown size={18} /></IconBtn>
              <IconBtn
                label="Duplica giorno"
                onClick={() => {
                  const next = duplicateDay(content, day.id);
                  const known = new Set(content.days.map((d) => d.id));
                  for (const d of next.days) if (!known.has(d.id)) days.setOpen(d.id);
                  setContent(next);
                  markDirty();
                }}
              >
                <IconCopy size={18} />
              </IconBtn>
              <IconBtn
                label="Elimina giorno"
                onClick={() => {
                  if (window.confirm(`Eliminare “${day.title}”?`)) mutate((d) => void d.days.splice(dayIdx, 1));
                }}
              >
                <IconTrash size={18} />
              </IconBtn>
            </div>
          </div>
          {!open ? (
            <button type="button" onClick={(e) => { const opening = !open; days.toggle(day.id, content.days.map((d) => d.id)); if (opening) keepInView(e.currentTarget.closest("[data-day-card]")); }} className="block w-full px-5 pt-1 pb-5 text-left text-sm text-muted sm:px-6">
              <span className="line-clamp-2">{names.length ? names.join(" · ") : "Nessun esercizio"}</span>
            </button>
          ) : (
          <div id={`daybody-${day.id}`}>
          <div className="px-5 pt-2 sm:px-6">
            <label htmlFor={`daynotes-${day.id}`} className="sr-only">Note del giorno</label>
            <input
              id={`daynotes-${day.id}`}
              value={day.notes}
              onChange={(e) => mutate((d) => void (d.days[dayIdx].notes = e.target.value))}
              placeholder="Note del giorno (facoltative)"
              className="w-full rounded-lg bg-transparent px-1 py-1 text-sm text-muted hover:bg-sand focus:bg-sand focus:outline-none"
            />
          </div>

          {/* telefono: una settimana alla volta */}
          <div className="mt-3 flex flex-col gap-3 px-4 pb-3 md:hidden">
            <div className="scroll-x -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Settimana da modificare">
              {Array.from({ length: weeks }, (_, w) => (
                <button key={w} type="button" role="tab" aria-selected={w === Math.min(mobileWeek, weeks - 1)} onClick={() => setMobileWeek(w)} className={cx("shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold", w === Math.min(mobileWeek, weeks - 1) ? "bg-ink text-card" : "bg-sand")}>
                  S{w + 1}
                </button>
              ))}
            </div>
            {Math.min(mobileWeek, weeks - 1) < weeks - 1 ? (
              <button type="button" onClick={() => copyForward(Math.min(mobileWeek, weeks - 1))} className="-mt-1 flex min-h-10 items-center gap-1.5 self-start text-sm font-semibold text-ink-soft underline">
                <IconCopy size={14} /> Copia la settimana {Math.min(mobileWeek, weeks - 1) + 1} sulle successive vuote
              </button>
            ) : null}
            {day.blocks.map((block, blockIdx) => (
              <MobileBlock
                key={block.id}
                block={block}
                blockIdx={blockIdx}
                blockCount={day.blocks.length}
                week={Math.min(mobileWeek, weeks - 1)}
                weeks={weeks}
                aiNotes={aiNotes}
                lastLogFor={lastLogFor}
                aiEnabled={aiEnabled && !!program.client_id}
                programId={program.id}
                onBlock={(fn) => mutate((d) => fn(d.days[dayIdx].blocks[blockIdx], d.days[dayIdx].blocks))}
                onItemName={(itemIdx, name) => setItemName(dayIdx, blockIdx, itemIdx, name)}
              />
            ))}
          </div>

          <div className="scroll-x mt-3 hidden px-3 pb-2 sm:px-4 md:block">
            <table className="w-full border-collapse text-sm" style={{ minWidth: 560 + weeks * 104 }}>
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th scope="col" className="w-10 px-2 py-2 font-semibold"><span className="sr-only">Etichetta</span></th>
                  <th scope="col" className="w-[230px] min-w-[200px] px-2 py-2 font-semibold">Esercizio</th>
                  {Array.from({ length: weeks }, (_, w) => (
                    <th key={w} scope="col" className="w-[104px] min-w-[104px] px-1 py-2 font-semibold">
                      <span className="flex items-center gap-1">
                        S{w + 1}
                        {w < weeks - 1 ? (
                          <button
                            type="button"
                            title={`Copia la settimana ${w + 1} sulle settimane successive vuote`}
                            aria-label={`Copia la settimana ${w + 1} sulle successive vuote`}
                            className="rounded p-0.5 text-muted hover:bg-sand hover:text-ink"
                            onClick={() => copyForward(w)}
                          >
                            <IconCopy size={13} />
                          </button>
                        ) : null}
                      </span>
                    </th>
                  ))}
                  <th scope="col" className="w-[96px] px-1 py-2 font-semibold">Recupero</th>
                  <th scope="col" className="min-w-[140px] px-1 py-2 font-semibold">Indicazioni</th>
                  <th scope="col" className="w-[112px] px-1 py-2"><span className="sr-only">Azioni</span></th>
                </tr>
              </thead>
              <tbody>
                {day.blocks.map((block, blockIdx) => (
                  <BlockRows
                    key={block.id}
                    block={block}
                    blockIdx={blockIdx}
                    blockCount={day.blocks.length}
                    weeks={weeks}
                    aiNotes={aiNotes}
                    lastLogFor={lastLogFor}
                    exerciseById={exerciseById}
                    aiEnabled={aiEnabled && !!program.client_id}
                    programId={program.id}
                    onBlock={(fn) => mutate((d) => fn(d.days[dayIdx].blocks[blockIdx], d.days[dayIdx].blocks))}
                    onItemName={(itemIdx, name) => setItemName(dayIdx, blockIdx, itemIdx, name)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-sand-deep px-5 py-4 sm:px-6">
            <ProgressionMenu
              wide
              label="Compila le settimane di tutto il giorno"
              onApply={(rule, deloadLast) =>
                mutate((d) => {
                  for (const b of d.days[dayIdx].blocks) {
                    for (const item of b.items) item.prescriptions = progressPrescriptions(item.prescriptions, rule, { deloadLast });
                  }
                })
              }
            />
            {(BLOCK_KINDS as readonly BlockKind[]).map((k) => (
              <button
                key={k}
                type="button"
                className={buttonClass(k === "single" ? "secondary" : "ghost", "sm")}
                onClick={() => mutate((d) => void d.days[dayIdx].blocks.push(emptyBlock(weeks, k)))}
              >
                <IconPlus size={16} /> {k === "single" ? "Esercizio" : BLOCK_KIND_LABELS[k]}
              </button>
            ))}
          </div>
          </div>
          )}
        </Card>
        );
      })}

      <div>
        <Button
          variant="secondary"
          onClick={() => {
            const nd = emptyDay(weeks, content.days.length);
            days.setOpen(nd.id);
            mutate((d) => void d.days.push(nd));
          }}
        >
          <IconPlus size={18} /> Aggiungi giorno
        </Button>
      </div>

      <datalist id="exercise-library">
        {exercises.map((e) => (
          <option key={e.id} value={e.name} />
        ))}
      </datalist>

      {/* azioni sul programma */}
      <Card>
        <Eyebrow className="mb-4">Altre azioni</Eyebrow>
        <div className="flex flex-col gap-5">
          <SaveAsTemplate onSave={(t) => runAction(() => saveAsTemplate(program.id, t))} defaultTitle={title} disabled={pending} />
          {!program.is_template ? (
            <div className="flex flex-wrap gap-2.5">
              {status === "published" ? (
                <Button variant="secondary" disabled={pending} onClick={() => runAction(() => unpublishProgram(program.id), () => setStatus("draft"))}>Torna in bozza</Button>
              ) : null}
              {status !== "archived" ? (
                <Button variant="secondary" disabled={pending} onClick={() => runAction(() => archiveProgram(program.id), () => setStatus("archived"))}>Archivia</Button>
              ) : null}
              <label className="flex min-h-11 items-center gap-2.5 px-2 text-[15px]">
                <input
                  type="checkbox"
                  checked={isExample}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setIsExample(v);
                    runAction(() => setAiExample(program.id, v));
                  }}
                  className="h-5 w-5 accent-[#1b1a17]"
                />
                Usa come esempio del mio stile per l&apos;AI
              </label>
            </div>
          ) : null}
          <DeleteProgram
            programId={program.id}
            template={program.is_template}
            logged={loggedWorkouts}
            canArchive={!program.is_template && status !== "archived"}
            onArchive={() => runAction(() => archiveProgram(program.id), () => setStatus("archived"))}
          />
        </div>
      </Card>
    </div>
  );
}

/**
 * "Elimina programma": se il cliente ci ha già registrato degli allenamenti,
 * prima propone di archiviarlo (resta nello storico) e l'eliminazione per
 * sempre è un secondo passaggio.
 */
function DeleteProgram({ programId, template, logged, canArchive, onArchive }: { programId: string; template: boolean; logged: number; canArchive: boolean; onArchive: () => void }) {
  const [asking, setAsking] = useState(false);
  const what = template ? "modello" : "programma";
  if (!logged) {
    return (
      <form action={deleteProgram.bind(null, programId)}>
        <button
          type="submit"
          className={buttonClass("danger", "sm")}
          onClick={(e) => {
            if (!window.confirm(`Eliminare questo ${what}?`)) e.preventDefault();
          }}
        >
          Elimina {what}
        </button>
      </form>
    );
  }
  if (!asking) {
    return <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setAsking(true)}>Elimina {what}…</button>;
  }
  return (
    <div className="flex w-full flex-col gap-3 rounded-2xl bg-accent-soft p-4" role="alert">
      <p className="text-[15px] leading-relaxed">
        Il cliente ci ha già registrato {logged === 1 ? "1 allenamento" : `${logged} allenamenti`}: eliminandolo si perde anche quel logbook (record, grafici, note).
        {canArchive ? " Se non deve più vederlo come fase in corso, archivialo: resta nello storico." : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        {canArchive ? <Button size="sm" onClick={() => { setAsking(false); onArchive(); }}>Archivia</Button> : null}
        <form action={deleteProgram.bind(null, programId)}>
          <button type="submit" className={buttonClass("danger", "sm")}>Elimina per sempre</button>
        </form>
        <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>Annulla</Button>
      </div>
    </div>
  );
}

/** Copia una settimana solo verso le settimane successive (dove sono vuote). */
function copyWeekForward(c: ProgramContent, w: number, weeks: number): ProgramContent {
  const copied = copyWeekToOthers(c, w, weeks);
  return {
    days: c.days.map((d, di) => ({
      ...d,
      blocks: d.blocks.map((b, bi) => ({
        ...b,
        items: b.items.map((it, ii) => ({
          ...it,
          prescriptions: it.prescriptions.map((p, pi) => (pi > w ? copied.days[di].blocks[bi].items[ii].prescriptions[pi] : p)),
        })),
      })),
    })),
  };
}

function swap<T>(arr: T[], i: number, j: number) {
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-sand hover:text-ink disabled:opacity-30">
      {children}
    </button>
  );
}

const cellInput = "w-full rounded-lg border border-transparent bg-sand/70 px-2 py-1.5 text-sm text-ink hover:border-sand-deep focus:border-ink focus:bg-white focus:outline-none";

function BlockRows({
  block,
  blockIdx,
  blockCount,
  weeks,
  aiNotes,
  lastLogFor,
  exerciseById,
  aiEnabled,
  programId,
  onBlock,
  onItemName,
}: {
  block: ProgramBlock;
  blockIdx: number;
  blockCount: number;
  weeks: number;
  aiNotes: Record<string, string>;
  lastLogFor: (it: ProgramItem) => string | undefined;
  exerciseById: Map<string, LibraryExercise>;
  aiEnabled: boolean;
  programId: string;
  onBlock: (fn: (b: ProgramBlock, siblings: ProgramBlock[]) => void) => void;
  onItemName: (itemIdx: number, name: string) => void;
}) {
  const multi = block.kind !== "single" && block.kind !== "text";
  const colCount = 5 + weeks;
  const blockActions = (
    <div className="flex items-center gap-1">
      <IconBtn label="Sposta blocco su" disabled={blockIdx === 0} onClick={() => onBlock((_, s) => swap(s, blockIdx, blockIdx - 1))}><IconUp size={16} /></IconBtn>
      <IconBtn label="Sposta blocco giù" disabled={blockIdx === blockCount - 1} onClick={() => onBlock((_, s) => swap(s, blockIdx, blockIdx + 1))}><IconDown size={16} /></IconBtn>
      <IconBtn label="Elimina blocco" onClick={() => { if (window.confirm("Eliminare questo blocco?")) onBlock((_, s) => void s.splice(blockIdx, 1)); }}><IconTrash size={16} /></IconBtn>
    </div>
  );

  if (block.kind === "text") {
    return (
      <tr className="border-t border-sand-deep align-top">
        <td className="px-2 py-3 font-semibold text-muted">{blockLetter(blockIdx)}</td>
        <td colSpan={colCount - 2} className="px-2 py-2">
          <input
            aria-label="Titolo del blocco di testo"
            value={block.title}
            onChange={(e) => onBlock((b) => void (b.title = e.target.value))}
            placeholder="Titolo (es. Riscaldamento)"
            className={cx(cellInput, "mb-1.5 font-semibold")}
          />
          <textarea
            aria-label="Testo del blocco"
            value={block.notes}
            onChange={(e) => onBlock((b) => void (b.notes = e.target.value))}
            rows={2}
            placeholder="Testo libero per il cliente"
            className={cx(cellInput, "min-h-16")}
          />
        </td>
        <td className="px-1 py-2">{blockActions}</td>
      </tr>
    );
  }

  return (
    <>
      {multi ? (
        <tr className="border-t border-sand-deep bg-sand/40">
          <td className="px-2 py-2 font-bold">{blockLetter(blockIdx)}</td>
          <td colSpan={colCount - 2} className="px-2 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <BlockSettings block={block} weeks={weeks} onBlock={onBlock} />
            </div>
          </td>
          <td className="px-1 py-2">{blockActions}</td>
        </tr>
      ) : null}
      {block.items.map((it, itemIdx) => {
        const ex = it.exerciseId ? exerciseById.get(it.exerciseId) : undefined;
        const last = lastLogFor(it);
        const aiNote = aiNotes[it.id];
        return (
          <tr key={it.id} className={cx("align-top", !multi && "border-t border-sand-deep", aiNote && "bg-accent-soft/30")}>
            <td className="px-2 py-2.5 font-semibold text-muted">{itemLabel(block, blockIdx, itemIdx)}</td>
            <td className="px-2 py-2">
              <input
                list="exercise-library"
                aria-label="Esercizio"
                value={it.name}
                onChange={(e) => onItemName(itemIdx, e.target.value)}
                placeholder="Scegli o scrivi un esercizio"
                className={cx(cellInput, "font-semibold")}
              />
              <div className="mt-1 flex flex-col gap-0.5 px-1 text-xs text-muted">
                {it.name.trim() && !it.exerciseId ? <span>Non in eserciziario</span> : null}
                {ex && !ex.video_url ? <span>Senza video</span> : null}
                {last ? <span>Ultimo log: {last}</span> : null}
                {aiNote ? <span className="text-ink"><IconSparkle size={12} className="mr-1 inline" />{aiNote}</span> : null}
              </div>
            </td>
            {Array.from({ length: weeks }, (_, w) => (
              <td key={w} className="px-1 py-2">
                <input
                  aria-label={`${it.name || "Esercizio"}, settimana ${w + 1}`}
                  value={it.prescriptions[w] ?? ""}
                  onChange={(e) => onBlock((b) => void (b.items[itemIdx].prescriptions[w] = e.target.value))}
                  className={cellInput}
                  placeholder={w === 0 ? "4x8 60kg" : ""}
                />
              </td>
            ))}
            <td className="px-1 py-2">
              <input aria-label="Recupero" value={it.rest} onChange={(e) => onBlock((b) => void (b.items[itemIdx].rest = e.target.value))} className={cellInput} placeholder="90&quot;" />
            </td>
            <td className="px-1 py-2">
              <textarea
                aria-label="Indicazioni"
                rows={1}
                value={it.notes}
                onChange={(e) => onBlock((b) => void (b.items[itemIdx].notes = e.target.value))}
                className={cx(cellInput, "min-h-[34px] resize-y")}
              />
            </td>
            <td className="px-1 py-2">
              <div className="flex flex-wrap items-center justify-end gap-0.5">
                <IconBtn
                  label="Sposta su"
                  disabled={multi ? itemIdx === 0 : blockIdx === 0}
                  onClick={() => onBlock((b, s) => (multi ? swap(b.items, itemIdx, itemIdx - 1) : swap(s, blockIdx, blockIdx - 1)))}
                >
                  <IconUp size={16} />
                </IconBtn>
                <IconBtn
                  label="Sposta giù"
                  disabled={multi ? itemIdx === block.items.length - 1 : blockIdx === blockCount - 1}
                  onClick={() => onBlock((b, s) => (multi ? swap(b.items, itemIdx, itemIdx + 1) : swap(s, blockIdx, blockIdx + 1)))}
                >
                  <IconDown size={16} />
                </IconBtn>
                <IconBtn
                  label={multi ? "Aggiungi esercizio al gruppo" : "Crea superserie con un altro esercizio"}
                  onClick={() => onBlock((b) => {
                    b.items.splice(itemIdx + 1, 0, emptyItem(weeks));
                    if (b.kind === "single") {
                      b.kind = "superset";
                      b.rounds = b.rounds ?? null;
                    }
                  })}
                >
                  <IconPlus size={16} />
                </IconBtn>
                <IconBtn
                  label="Togli esercizio"
                  onClick={() => onBlock((b, s) => {
                    b.items.splice(itemIdx, 1);
                    if (b.items.length === 0) s.splice(blockIdx, 1);
                    else if (b.items.length === 1 && b.kind === "superset") b.kind = "single";
                  })}
                >
                  <IconX size={16} />
                </IconBtn>
                <ProgressionMenu
                  label={`Compila le settimane di ${it.name || "questo esercizio"}`}
                  onApply={(rule, deloadLast) =>
                    onBlock((b) => {
                      const item = b.items[itemIdx];
                      item.prescriptions = progressPrescriptions(item.prescriptions, rule, { deloadLast });
                    })
                  }
                />
                {aiEnabled && it.name.trim() ? (
                  <RowAiButtons
                    programId={programId}
                    item={it}
                    weeks={weeks}
                    onPrescriptions={(p) => onBlock((b) => void (b.items[itemIdx].prescriptions = p))}
                    onReplace={(name) => onItemName(itemIdx, name)}
                  />
                ) : null}
              </div>
            </td>
          </tr>
        );
      })}
      {multi ? (
        <tr>
          <td />
          <td colSpan={colCount - 1} className="px-2 pb-3">
            <button type="button" className="flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-ink" onClick={() => onBlock((b) => void b.items.push(emptyItem(weeks)))}>
              <IconPlus size={14} /> Esercizio in {BLOCK_KIND_LABELS[block.kind].toLowerCase()}
            </button>
          </td>
        </tr>
      ) : null}
    </>
  );
}

/** Tipo di blocco, giri, minuti, secondi di lavoro e recupero, nota: uguale da computer e da telefono. */
function BlockSettings({ block, weeks, onBlock }: { block: ProgramBlock; weeks: number; onBlock: (fn: (b: ProgramBlock, siblings: ProgramBlock[]) => void) => void }) {
  return (
    <>
              <select
                aria-label="Tipo di blocco"
                value={block.kind}
                onChange={(e) => onBlock((b) => {
                  const k = e.target.value as BlockKind;
                  const fresh = emptyBlock(weeks, k);
                  b.kind = k;
                  b.rounds = b.rounds ?? fresh.rounds;
                  b.durationMin = b.durationMin ?? fresh.durationMin;
                  b.everySec = b.everySec ?? fresh.everySec;
                  b.workSec = b.workSec ?? fresh.workSec;
                  b.restSec = b.restSec ?? fresh.restSec;
                })}
                className="rounded-lg border border-sand-deep bg-card px-2 py-1.5 text-sm font-semibold"
              >
                {BLOCK_KINDS.filter((k) => k !== "text").map((k) => (
                  <option key={k} value={k}>{BLOCK_KIND_LABELS[k]}</option>
                ))}
              </select>
              {(block.kind === "superset" || block.kind === "circuit" || block.kind === "interval") ? (
                <NumField label="giri" value={block.rounds} onChange={(v) => onBlock((b) => void (b.rounds = v))} />
              ) : null}
              {(block.kind === "amrap" || block.kind === "emom") ? (
                <NumField label="minuti" value={block.durationMin} onChange={(v) => onBlock((b) => void (b.durationMin = v))} />
              ) : null}
              {block.kind === "emom" ? (
                <label className="flex items-center gap-1.5 text-sm">
                  ogni
                  <select
                    value={block.everySec ?? 60}
                    onChange={(e) => onBlock((b) => void (b.everySec = Number(e.target.value)))}
                    className="rounded-lg border border-sand-deep bg-card px-2 py-1.5 text-sm"
                  >
                    {[60, 90, 120, 150, 180, 240, 300].map((s) => (
                      <option key={s} value={s}>{s % 60 === 0 ? `${s / 60}'` : `${Math.floor(s / 60)}'${s % 60}"`}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              {block.kind === "interval" ? (
                <>
                  <NumField label="sec lavoro" value={block.workSec} onChange={(v) => onBlock((b) => void (b.workSec = v))} />
                  <NumField label="sec recupero" value={block.restSec} onChange={(v) => onBlock((b) => void (b.restSec = v))} allowZero />
                </>
              ) : null}
              <input
                aria-label="Nota sul blocco"
                value={block.notes}
                onChange={(e) => onBlock((b) => void (b.notes = e.target.value))}
                placeholder="Nota sul blocco (es. recupero 90&quot; a fine giro)"
                className={cx(cellInput, "min-w-[200px] flex-1 bg-card")}
              />
    </>
  );
}

function NumField({ label, value, onChange, allowZero }: { label: string; value: number | null | undefined; onChange: (v: number | null) => void; allowZero?: boolean }) {
  return (
    <label className="flex items-center gap-1.5 text-sm">
      <input
        type="number"
        inputMode="numeric"
        min={allowZero ? 0 : 1}
        value={value ?? ""}
        onChange={(e) => {
          const n = e.target.value === "" ? null : Number(e.target.value);
          onChange(n !== null && Number.isFinite(n) && (allowZero ? n >= 0 : n > 0) ? n : null);
        }}
        className="w-16 rounded-lg border border-sand-deep bg-card px-2 py-1.5 text-sm"
      />
      {label}
    </label>
  );
}

function SaveAsTemplate({ onSave, defaultTitle, disabled }: { onSave: (title: string) => void; defaultTitle: string; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [t, setT] = useState(defaultTitle);
  if (!open) {
    return (
      <div>
        <Button variant="secondary" onClick={() => setOpen(true)} disabled={disabled}>Salva come modello</Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-2.5">
      <div className="min-w-[240px] flex-1">
        <label htmlFor="tpl-title" className="mb-1.5 block text-sm font-semibold">Nome del modello</label>
        <Input id="tpl-title" value={t} onChange={(e) => setT(e.target.value)} />
      </div>
      <Button onClick={() => { onSave(t); setOpen(false); }} disabled={disabled}>Salva modello</Button>
      <Button variant="ghost" onClick={() => setOpen(false)}>Annulla</Button>
    </div>
  );
}

/**
 * Menu "Progressione": compila le settimane successive partendo dalla prima
 * scritta, con una regola (+1 ripetizione, +2,5 kg…), senza AI e all'istante.
 */
function ProgressionMenu({ label, onApply, wide }: { label: string; onApply: (rule: ProgressionRule, deloadLast: boolean) => void; wide?: boolean }) {
  const [deloadLast, setDeloadLast] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDetailsElement>(null);
  // Il menu è "fixed": così non viene tagliato dalla tabella che scorre di lato
  // né coperto dai pulsanti sotto l'ultima riga. Si apre verso l'alto se sotto non c'è posto.
  const place = () => {
    const el = ref.current;
    if (!el?.open) return setPos(null);
    const r = el.querySelector("summary")!.getBoundingClientRect();
    const W = 288, H = 300, gap = 4;
    const left = Math.min(Math.max(8, wide ? r.left : r.right - W), window.innerWidth - W - 8);
    const below = r.bottom + gap + H < window.innerHeight - 80;
    setPos({ top: below ? r.bottom + gap : Math.max(8, r.top - gap - H), left });
  };
  useEffect(() => {
    if (!pos) return;
    const close = (e: Event) => {
      if (e.target instanceof Node && ref.current?.contains(e.target)) return;
      ref.current?.removeAttribute("open");
      setPos(null);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos]);
  return (
    <details ref={ref} className="relative" onToggle={place}>
      <summary
        aria-label={label}
        title={label}
        className={cx(
          "flex cursor-pointer list-none items-center justify-center gap-1.5 rounded-full text-muted hover:bg-sand hover:text-ink [&::-webkit-details-marker]:hidden",
          wide ? "min-h-9 px-3 text-sm font-semibold ring-1 ring-sand-deep" : "h-9 w-9",
        )}
      >
        <IconTrend size={16} />
        {wide ? "Progressione" : null}
      </summary>
      <div
        className={cx("z-50 w-72 rounded-2xl bg-card p-3 shadow-xl ring-1 ring-sand-deep", pos ? "fixed" : cx("absolute mt-1", wide ? "left-0" : "right-0"))}
        style={pos ? { top: pos.top, left: pos.left, maxHeight: 300, overflowY: "auto" } : undefined}
      >
        <p className="mb-2 px-1 text-xs text-muted">Parte dalla prima settimana scritta e compila le altre.</p>
        <div className="flex flex-col">
          {PROGRESSION_RULES.map((r) => (
            <button
              key={r.key}
              type="button"
              className="rounded-xl px-2.5 py-2 text-left text-sm font-semibold hover:bg-sand"
              onClick={() => {
                onApply(r.key, deloadLast);
                ref.current?.removeAttribute("open");
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2 border-t border-sand-deep px-1 pt-2 text-sm">
          <input type="checkbox" checked={deloadLast} onChange={(e) => setDeloadLast(e.target.checked)} className="h-4 w-4 accent-[#1b1a17]" />
          Ultima settimana di scarico
        </label>
      </div>
    </details>
  );
}

function IconTrend({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4 17 5-5 4 3 7-8" />
      <path d="M15 7h5v5" />
    </svg>
  );
}

/** Un blocco nella vista telefono: esercizio, prescrizione della settimana scelta, recupero e note. */
function MobileBlock({
  block,
  blockIdx,
  blockCount,
  week,
  weeks,
  aiNotes,
  lastLogFor,
  aiEnabled,
  programId,
  onBlock,
  onItemName,
}: {
  block: ProgramBlock;
  blockIdx: number;
  blockCount: number;
  aiEnabled: boolean;
  programId: string;
  week: number;
  weeks: number;
  aiNotes: Record<string, string>;
  lastLogFor: (it: ProgramItem) => string | undefined;
  onBlock: (fn: (b: ProgramBlock, siblings: ProgramBlock[]) => void) => void;
  onItemName: (itemIdx: number, name: string) => void;
}) {
  const multi = block.kind !== "single" && block.kind !== "text";
  const moves = (
    <div className="flex items-center">
      <IconBtn label="Sposta blocco su" disabled={blockIdx === 0} onClick={() => onBlock((_, s) => swap(s, blockIdx, blockIdx - 1))}><IconUp size={16} /></IconBtn>
      <IconBtn label="Sposta blocco giù" disabled={blockIdx === blockCount - 1} onClick={() => onBlock((_, s) => swap(s, blockIdx, blockIdx + 1))}><IconDown size={16} /></IconBtn>
      <IconBtn label="Elimina blocco" onClick={() => { if (window.confirm("Eliminare questo blocco?")) onBlock((_, s) => void s.splice(blockIdx, 1)); }}><IconTrash size={16} /></IconBtn>
    </div>
  );
  if (block.kind === "text") {
    return (
      <div className="rounded-2xl bg-sand/60 p-3">
        <div className="mb-2 flex items-center justify-between"><span className="text-sm font-bold">{blockLetter(blockIdx)} · Testo</span>{moves}</div>
        <input aria-label="Titolo del blocco di testo" value={block.title} onChange={(e) => onBlock((b) => void (b.title = e.target.value))} placeholder="Titolo (es. Riscaldamento)" className={cx(cellInput, "mb-1.5 font-semibold")} />
        <textarea aria-label="Testo del blocco" value={block.notes} onChange={(e) => onBlock((b) => void (b.notes = e.target.value))} rows={3} className={cx(cellInput, "min-h-16")} />
      </div>
    );
  }
  return (
    <div className={cx("rounded-2xl p-3", multi ? "bg-sand/60 ring-1 ring-sand-deep" : "bg-sand/30")}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-bold">{multi ? `${blockLetter(blockIdx)} · ${BLOCK_KIND_LABELS[block.kind]}${block.rounds ? ` · ${block.rounds} giri` : block.durationMin ? ` · ${block.durationMin} min` : ""}` : <span className="font-semibold text-muted">Esercizio singolo</span>}</span>
        {moves}
      </div>
      {multi ? (
        <details className="mb-2">
          <summary className="flex min-h-10 cursor-pointer items-center text-xs font-semibold text-muted">Tipo, giri, minuti e nota del blocco</summary>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <BlockSettings block={block} weeks={weeks} onBlock={onBlock} />
          </div>
        </details>
      ) : null}
      <div className="flex flex-col gap-3">
        {block.items.map((it, itemIdx) => {
          const last = lastLogFor(it);
          return (
            <div key={it.id} className={cx("flex flex-col gap-1.5", itemIdx > 0 && "border-t border-sand-deep pt-3", aiNotes[it.id] && "rounded-xl bg-accent-soft/40 p-2")}>
              <div className="flex items-center gap-2">
                <span className="w-7 shrink-0 text-sm font-semibold text-muted">{itemLabel(block, blockIdx, itemIdx)}</span>
                <input list="exercise-library" aria-label="Esercizio" value={it.name} onChange={(e) => onItemName(itemIdx, e.target.value)} placeholder="Esercizio" className={cx(cellInput, "flex-1 font-semibold")} />
                {multi && block.items.length > 1 ? (
                  <>
                    <IconBtn label="Sposta su nel gruppo" disabled={itemIdx === 0} onClick={() => onBlock((b) => swap(b.items, itemIdx, itemIdx - 1))}><IconUp size={16} /></IconBtn>
                    <IconBtn label="Sposta giù nel gruppo" disabled={itemIdx === block.items.length - 1} onClick={() => onBlock((b) => swap(b.items, itemIdx, itemIdx + 1))}><IconDown size={16} /></IconBtn>
                  </>
                ) : null}
                <IconBtn label="Togli esercizio" onClick={() => onBlock((b, s) => { b.items.splice(itemIdx, 1); if (b.items.length === 0) s.splice(blockIdx, 1); else if (b.items.length === 1 && b.kind === "superset") b.kind = "single"; })}><IconX size={16} /></IconBtn>
              </div>
              <div className="grid grid-cols-[1fr_6rem] gap-2 pl-9">
                <input aria-label={`${it.name || "Esercizio"}, settimana ${week + 1}`} value={it.prescriptions[week] ?? ""} onChange={(e) => onBlock((b) => void (b.items[itemIdx].prescriptions[week] = e.target.value))} placeholder={`Settimana ${week + 1}: 4x8 60kg`} className={cellInput} />
                <input aria-label="Recupero" value={it.rest} onChange={(e) => onBlock((b) => void (b.items[itemIdx].rest = e.target.value))} placeholder="Rec. 90&quot;" className={cellInput} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-9 text-xs text-muted">
                {last ? <span>Ultimo log: {last}</span> : null}
                {aiNotes[it.id] ? <span className="text-ink"><IconSparkle size={12} className="mr-1 inline" />{aiNotes[it.id]}</span> : null}
                {week > 0 && !it.prescriptions[week] && it.prescriptions[week - 1] ? (
                  <button type="button" className="font-semibold text-ink underline" onClick={() => onBlock((b) => void (b.items[itemIdx].prescriptions[week] = b.items[itemIdx].prescriptions[week - 1]))}>Copia dalla settimana {week}</button>
                ) : null}
                <ProgressionMenu
                  label={`Compila le settimane di ${it.name || "questo esercizio"}`}
                  onApply={(rule, deloadLast) =>
                    onBlock((b) => {
                      const item = b.items[itemIdx];
                      item.prescriptions = progressPrescriptions(item.prescriptions, rule, { deloadLast });
                    })
                  }
                />
                {aiEnabled && it.name.trim() ? (
                  <RowAiButtons
                    programId={programId}
                    item={it}
                    weeks={weeks}
                    onPrescriptions={(p) => onBlock((b) => void (b.items[itemIdx].prescriptions = p))}
                    onReplace={(name) => onItemName(itemIdx, name)}
                  />
                ) : null}
              </div>
              <details className="pl-9">
                <summary className="cursor-pointer text-xs font-semibold text-muted">Indicazioni{it.notes ? ": " + (it.notes.length > 30 ? it.notes.slice(0, 30) + "…" : it.notes) : ""}</summary>
                <textarea aria-label="Indicazioni" rows={2} value={it.notes} onChange={(e) => onBlock((b) => void (b.items[itemIdx].notes = e.target.value))} className={cx(cellInput, "mt-1.5")} />
              </details>
            </div>
          );
        })}
        <button type="button" className="flex min-h-11 items-center gap-1.5 self-start pl-9 text-sm font-semibold text-muted" onClick={() => onBlock((b) => { b.items.push(emptyItem(weeks)); if (b.kind === "single") b.kind = "superset"; })}>
          <IconPlus size={14} /> {multi ? `Esercizio in ${BLOCK_KIND_LABELS[block.kind].toLowerCase()}` : "Fai superserie con un altro esercizio"}
        </button>
      </div>
    </div>
  );
}
