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
import { formatLong, type ISODate } from "@/lib/dates";
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

export type EditorProgram = {
  id: string;
  title: string;
  description: string;
  weeks: number;
  start_date: string | null;
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
  nextPhaseNotes: { date: ISODate; text: string } | null;
  clientName: string | null;
  aiEnabled: boolean;
  backHref: string;
};

const STATUS_LABEL = { draft: "Bozza", published: "Pubblicato", archived: "Archiviato" } as const;

export function ProgramEditor({ program, initialContent, exercises, lastLogs, nextPhaseNotes, clientName, aiEnabled, backHref }: Props) {
  const [title, setTitle] = useState(program.title);
  const [description, setDescription] = useState(program.description);
  const [weeks, setWeeks] = useState(program.weeks);
  const [startDate, setStartDate] = useState(program.start_date ?? "");
  const [content, setContent] = useState<ProgramContent>(() => normalizeWeeks(initialContent, program.weeks));
  const [aiNotes, setAiNotes] = useState<Record<string, string>>(program.ai_notes ?? {});
  const [updatedAt, setUpdatedAt] = useState(program.updated_at);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState(program.status);
  const [isExample, setIsExample] = useState(program.is_ai_example);

  const exerciseByName = useMemo(() => new Map(exercises.map((e) => [e.name.trim().toLowerCase(), e])), [exercises]);
  const exerciseById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);

  const mutate = useCallback((fn: (d: ProgramContent) => void) => {
    setContent((c) => {
      const d = structuredClone(c);
      fn(d);
      return d;
    });
    setDirty(true);
  }, []);

  const doSave = useCallback(() => {
    startTransition(async () => {
      const res = await saveProgram(program.id, {
        title,
        description,
        weeks,
        start_date: program.is_template ? null : startDate || null,
        content,
        expected_updated_at: updatedAt,
      });
      if (res.ok) {
        setUpdatedAt(res.updated_at);
        setDirty(false);
        setSavedAt(new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }));
        setUnknown(res.unknownExercises);
        setMessage(null);
      } else {
        setMessage({ tone: "error", text: res.error });
      }
    });
  }, [program.id, program.is_template, title, description, weeks, startDate, content, updatedAt]);

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

  // avviso se si esce con modifiche non salvate
  useEffect(() => {
    if (!dirty) return;
    const onBefore = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [dirty]);

  const changeWeeks = (n: number) => {
    const losing = content.days.some((d) => d.blocks.some((b) => b.items.some((it) => it.prescriptions.slice(n).some((p) => p.trim()))));
    if (losing && !window.confirm(`Le settimane dalla ${n + 1} in poi contengono prescrizioni che verranno cancellate. Continuare?`)) return;
    setWeeks(n);
    setContent((c) => normalizeWeeks(c, n));
    setDirty(true);
  };

  const runAction = (fn: () => Promise<{ ok?: boolean; error?: string; message?: string } | null>, after?: () => void) => {
    startTransition(async () => {
      const r = await fn();
      if (r?.error) setMessage({ tone: "error", text: r.error });
      else {
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
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setDirty(true);
              }}
              className="w-full rounded-xl bg-transparent px-1 py-1 text-[32px] leading-tight font-normal tracking-tight hover:bg-card focus:bg-card focus:outline-none"
              placeholder="Nome della fase (es. Intensificazione 2)"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2 px-1 text-sm text-muted">
              <Pill active={status === "published"}>{program.is_template ? "Modello" : STATUS_LABEL[status]}</Pill>
              {program.source === "ai" ? <Pill><IconSparkle size={14} /> Bozza preparata con l&apos;AI</Pill> : null}
              <span aria-live="polite">{pending ? "Salvataggio…" : dirty ? "Modifiche non salvate" : savedAt ? `Salvato alle ${savedAt}` : ""}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Button onClick={doSave} disabled={pending || !dirty} variant={dirty ? "primary" : "secondary"}>
              Salva
            </Button>
            {!program.is_template && status === "draft" ? (
              <Button
                variant="secondary"
                disabled={pending || dirty || !hasContent}
                title={dirty ? "Salva prima di pubblicare" : undefined}
                onClick={() => runAction(() => publishProgram(program.id), () => setStatus("published"))}
              >
                Pubblica
              </Button>
            ) : null}
          </div>
        </div>
      </div>

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
                  setDirty(true);
                }}
              />
            </div>
          ) : null}
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
                setDirty(true);
              }}
              placeholder="Obiettivo della fase, indicazioni generali, riscaldamento…"
            />
          </div>
        </div>
        {nextPhaseNotes ? (
          <div className="mt-5 rounded-2xl bg-sand px-4 py-3">
            <Eyebrow>Note per la prossima fase · check del {formatLong(nextPhaseNotes.date)}</Eyebrow>
            <p className="mt-1.5 text-[15px] leading-relaxed whitespace-pre-line">{nextPhaseNotes.text}</p>
          </div>
        ) : null}
      </Card>

      {aiEnabled && program.client_id ? (
        <AiPanel
          programId={program.id}
          disabled={pending}
          dirty={dirty}
          onApply={(next, notes, nextWeeks) => {
            if (nextWeeks && nextWeeks !== weeks) setWeeks(nextWeeks);
            setContent(normalizeWeeks(next, nextWeeks ?? weeks));
            setAiNotes(notes);
            setDirty(true);
            setMessage({ tone: "info", text: "Bozza dell'AI applicata: le modifiche sono evidenziate. Rivedi le caselle e salva quando sei soddisfatto." });
          }}
          currentContent={content}
          weeks={weeks}
        />
      ) : null}

      {/* giorni */}
      {content.days.map((day, dayIdx) => (
        <Card key={day.id} className="!p-0">
          <div className="flex flex-wrap items-center gap-3 px-5 pt-5 sm:px-6">
            <label htmlFor={`day-${day.id}`} className="sr-only">Nome del giorno</label>
            <input
              id={`day-${day.id}`}
              value={day.title}
              onChange={(e) => mutate((d) => void (d.days[dayIdx].title = e.target.value))}
              className="min-w-0 flex-1 rounded-lg bg-transparent px-1 py-1 text-xl font-semibold hover:bg-sand focus:bg-sand focus:outline-none"
            />
            <div className="flex gap-1">
              <IconBtn label="Sposta su" disabled={dayIdx === 0} onClick={() => mutate((d) => swap(d.days, dayIdx, dayIdx - 1))}><IconUp size={18} /></IconBtn>
              <IconBtn label="Sposta giù" disabled={dayIdx === content.days.length - 1} onClick={() => mutate((d) => swap(d.days, dayIdx, dayIdx + 1))}><IconDown size={18} /></IconBtn>
              <IconBtn label="Duplica giorno" onClick={() => { setContent((c) => duplicateDay(c, day.id)); setDirty(true); }}><IconCopy size={18} /></IconBtn>
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

          <div className="scroll-x mt-3 px-3 pb-2 sm:px-4">
            <table className="w-full border-collapse text-sm" style={{ minWidth: 520 + weeks * 112 }}>
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th scope="col" className="w-10 px-2 py-2 font-semibold"><span className="sr-only">Etichetta</span></th>
                  <th scope="col" className="min-w-[220px] px-2 py-2 font-semibold">Esercizio</th>
                  {Array.from({ length: weeks }, (_, w) => (
                    <th key={w} scope="col" className="w-[112px] px-1 py-2 font-semibold">
                      <span className="flex items-center gap-1">
                        S{w + 1}
                        {w < weeks - 1 ? (
                          <button
                            type="button"
                            title={`Copia la settimana ${w + 1} sulle settimane successive vuote`}
                            aria-label={`Copia la settimana ${w + 1} sulle successive vuote`}
                            className="rounded p-0.5 text-muted hover:bg-sand hover:text-ink"
                            onClick={() => {
                              setContent((c) => {
                                const copied = copyWeekToOthers(c, w, weeks);
                                // copia solo verso le settimane successive
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
                              });
                              setDirty(true);
                            }}
                          >
                            <IconCopy size={13} />
                          </button>
                        ) : null}
                      </span>
                    </th>
                  ))}
                  <th scope="col" className="w-[96px] px-1 py-2 font-semibold">Recupero</th>
                  <th scope="col" className="min-w-[200px] px-1 py-2 font-semibold">Indicazioni</th>
                  <th scope="col" className="w-[150px] px-1 py-2"><span className="sr-only">Azioni</span></th>
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
          <div className="flex flex-wrap gap-2 border-t border-sand-deep px-5 py-4 sm:px-6">
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
        </Card>
      ))}

      <div>
        <Button variant="secondary" onClick={() => mutate((d) => void d.days.push(emptyDay(weeks, d.days.length)))}>
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
          <form action={deleteProgram.bind(null, program.id)}>
            <button
              type="submit"
              className={buttonClass("danger", "sm")}
              onClick={(e) => {
                if (!window.confirm("Eliminare questo programma? Si perde anche il logbook del cliente su questo programma.")) e.preventDefault();
              }}
            >
              Elimina {program.is_template ? "modello" : "programma"}
            </button>
          </form>
        </div>
      </Card>
    </div>
  );
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
      <IconBtn label="Elimina blocco" onClick={() => onBlock((_, s) => void s.splice(blockIdx, 1))}><IconTrash size={16} /></IconBtn>
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
                className={cx(cellInput, "min-w-[220px] flex-1 bg-card")}
              />
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
              <div className="flex flex-wrap items-center gap-0.5">
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
