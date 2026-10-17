"use client";

import { loadDraft, useDraft } from "@/components/use-draft";
/**
 * Assistente AI nell'editor del programma:
 * - pannello "Chiedi all'AI": descrivi a voce o per iscritto cosa cambiare, allega i test
 * - pulsanti sulla riga: "Fai progredire" e "Alternative"
 * Le proposte dell'AI arrivano nell'editor come modifiche NON salvate: il
 * trainer le rivede e decide se salvarle.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { jobLabel, type JobView } from "@/lib/ai/program-jobs-shared";
import { closeAiJob } from "./ai-job-actions";
import { useDictation } from "@/components/use-dictation";
import { friendlyError } from "@/lib/friendly-error";
import type { ProgramContent, ProgramItem } from "@/lib/program/types";
import { Button, Card, Eyebrow, Notice, Textarea, cx } from "@/components/ui";
import { IconMic, IconSparkle, IconX } from "@/components/icons";

type Img = { mediaType: "image/jpeg"; data: string; preview: string };

/** Oltre questo tempo smettiamo di aspettare (il server si ferma comunque a 5 minuti). */
const AI_TIMEOUT_MS = 290_000;

async function post<T>(body: unknown): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch("/api/ai/program", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error("L'assistente non ha risposto in tempo: riprova tra poco. Il programma non è stato modificato.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
  const json = await res.json().catch(() => ({ error: "Risposta non valida" }));
  if (!res.ok) throw new Error(json.error ?? "Errore dell'assistente");
  return json as T;
}

/** Riduce la foto a 1600 px e la converte in JPEG (meno costi e caricamenti più veloci). */
function resizeImage(file: File): Promise<Img> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL("image/jpeg", 0.85);
      URL.revokeObjectURL(img.src);
      resolve({ mediaType: "image/jpeg", data: url.split(",")[1], preview: url });
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/** Richieste frequenti: un tocco le aggiunge al testo, poi si può completare a voce. */
const AI_PRESETS = [
  "Stessa struttura, progressione secondo il mio metodo",
  "Ultima settimana di scarico",
  "Cambia i complementari, tieni i fondamentali",
  "Tieni conto dei fastidi segnalati nei diari e nelle note",
  "Più lavoro posturale e di core",
  "Usa i carichi del logbook",
];

export function AiPanel({
  programId,
  currentContent,
  weeks,
  disabled,
  dirty,
  onApply,
  initialJob = null,
  updatedAt,
  getEdits,
}: {
  programId: string;
  currentContent: ProgramContent;
  weeks: number;
  disabled: boolean;
  dirty: boolean;
  onApply: (content: ProgramContent, notes: Record<string, string>, weeks?: number, sessionMinutes?: number | null) => void;
  /** richiesta in coda ancora aperta per questo programma (in preparazione, domande, pronta, non riuscita) */
  initialJob?: JobView | null;
  /** updated_at del programma salvato: se cambia dopo la richiesta, aprendo la bozza si avvisa */
  updatedAt: string;
  /** contatore delle modifiche nell'editor */
  getEdits: () => number;
}) {
  const [open, setOpen] = useState(() => Boolean(initialJob) || (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("ai") === "1"));
  // bozza in coda: l'AI lavora sul server, intanto puoi passare a un altro cliente
  const [job, setJob] = useState<JobView | null>(initialJob);
  // richiesta partita da qui (in questa visita): se arriva la bozza e non hai toccato niente, si apre da sola
  const startedHere = useRef<{ edits: number } | null>(null);
  // ripresa di una richiesta in coda: c'è già il testo che avevi scritto
  const [instruction, setInstruction] = useState(initialJob?.instruction ?? "");
  // la richiesta all'assistente resta anche se esci prima di mandarla
  const instructionKey = `assistente:${programId}`;
  const { adopt: adoptInstruction, clear: clearInstruction } = useDraft(instructionKey, instruction, { isEmpty: (t) => !t.trim() });
  useEffect(() => {
    let alive = true;
    void loadDraft<string>(instructionKey).then((d) => {
      if (!alive || !d || typeof d.data !== "string" || !d.data.trim()) return;
      adoptInstruction(d.data, d.at);
      setInstruction((v) => v || d.data);
    });
    return () => {
      alive = false;
    };
  }, [instructionKey, adoptInstruction]);
  const [images, setImages] = useState<Img[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  // domande dell'AI prima della bozza (null = non ancora chieste per questa richiesta)
  const [questions, setQuestions] = useState<Array<{ question: string; options: string[] }> | null>(initialJob?.status === "questions" ? initialJob.questions ?? [] : null);
  const [answers, setAnswers] = useState<string[]>(() => (initialJob?.status === "questions" ? (initialJob.questions ?? []).map(() => "") : []));
  // risposte già date in questo giro (es. il tempo per seduta), da rimandare con le successive
  const [asked, setAsked] = useState<Array<{ question: string; answer: string }>>(initialJob?.status === "questions" ? initialJob.answers : []);
  const dictation = useDictation((text) => setInstruction((v) => (v ? `${v.trimEnd()} ${text}` : text)));
  const { listening, interim, transcribing } = dictation;
  // tempo trascorso mentre l'AI lavora, così si vede che non è bloccata
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => {
      clearInterval(t);
      setElapsed(0);
    };
  }, [busy]);

  /** Il testo da mandare: quello scritto più quello che si sta ancora dettando. */
  const fullInstruction = (extra = "") => {
    const tail = extra || (listening && interim ? interim : "");
    return tail ? `${instruction.trimEnd()} ${tail}`.trim() : instruction.trim();
  };

  /** Se stai ancora dettando, finisce la registrazione e aspetta il testo. */
  const finishDictation = async () => (listening ? ((await dictation.stop()) ?? "") : "");

  const request = (extra = "") => {
    const title = (document.getElementById("program-title") as HTMLInputElement | null)?.value ?? "";
    const description = (document.getElementById("desc") as HTMLTextAreaElement | null)?.value ?? "";
    return {
      programId,
      instruction: fullInstruction(extra),
      current: { title, description, weeks, content: currentContent },
      images: images.map(({ mediaType, data }) => ({ mediaType, data })),
    };
  };

  type QA = { question: string; answer: string };
  type DraftRes = NonNullable<JobView["draft"]>;

  /** La bozza arriva nell'editor (modifiche da rivedere e salvare). */
  const applyDraft = (res: DraftRes) => {
    onApply(res.content, res.notes ?? {}, res.weeks, res.sessionMinutes);
    // richiesta eseguita: non serve più ritrovarla alla prossima apertura
    clearInstruction();
    setSummary(res.summary ?? "");
    setQuestions(null);
    setAnswers([]);
    setAsked([]);
  };

  /** Apre la bozza pronta della richiesta in coda (con l'avviso se nel frattempo il programma è cambiato). */
  const openJobDraft = (j: JobView, confirmChanges = true) => {
    if (!j.draft) return;
    const changedSaved = Boolean(j.baseUpdatedAt && j.baseUpdatedAt !== updatedAt);
    const changedHere = startedHere.current ? getEdits() !== startedHere.current.edits : dirty;
    if (confirmChanges && (changedSaved || changedHere) && !window.confirm("Dopo aver chiesto la bozza hai modificato il programma: aprendo la bozza dell'AI quelle modifiche vengono sostituite. Aprirla lo stesso?")) return;
    applyDraft(j.draft);
    setJob(null);
    startedHere.current = null;
    void closeAiJob(j.id, "applied");
  };

  /** Arrivato un aggiornamento della richiesta in coda. */
  const onJob = (j: JobView) => {
    setJob(j);
    if (j.status === "questions") {
      setAsked(j.answers);
      setQuestions(j.questions ?? []);
      setAnswers((j.questions ?? []).map(() => ""));
    }
    // partita da qui e non hai toccato niente nel frattempo: la bozza si apre da sola, come prima
    if (j.status === "ready" && j.draft && startedHere.current && getEdits() === startedHere.current.edits) openJobDraft(j, false);
  };

  // finché l'AI lavora, la pagina chiede a che punto è (se sei andato altrove ti avvisa la notifica)
  useEffect(() => {
    if (job?.status !== "working") return;
    let stop = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch(`/api/ai/jobs?id=${job.id}`, { cache: "no-store" });
        if (!r.ok || stop) return;
        const d = (await r.json()) as { job: JobView };
        if (!stop && d.job.status !== "working") onJob(d.job);
      } catch {
        // rete assente: si riprova al giro dopo
      }
    };
    const t = setInterval(tick, 3000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      stop = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.status]);

  // tempo che passa sulla richiesta in coda
  const [, setNow] = useState(0);
  useEffect(() => {
    if (job?.status !== "working") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [job?.status]);

  /** Manda la richiesta in coda: risponde subito, l'AI lavora sul server. */
  const enqueue = async (payload: Record<string, unknown>) => {
    const res = await post<{ job: JobView }>({ ...payload, background: true, baseUpdatedAt: updatedAt });
    startedHere.current = { edits: getEdits() };
    setSummary(null);
    setQuestions(null);
    setAnswers([]);
    setJob(res.job);
  };

  /**
   * Un tocco: l'AI scrive la bozza oppure, se ha un dubbio forte, fa prima
   * qualche domanda (spesso nessuna). Le risposte già date restano.
   */
  const run = async () => {
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const extra = await finishDictation();
      if (fullInstruction(extra).length < 3) {
        setError("Scrivi o detta cosa vuoi per questa fase, poi riprova.");
        return;
      }
      if (questions === null) {
        await enqueue({ mode: "questions", ...request(extra) });
      } else {
        const qa: QA[] = [...asked, ...questions.map((q, i) => ({ question: q.question, answer: answers[i]?.trim() ?? "" }))];
        await enqueue({ mode: "revise", ...request(extra), answers: qa });
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const skipQuestions = async () => {
    setBusy(true);
    setError(null);
    try {
      const extra = await finishDictation();
      await enqueue({ mode: "revise", ...request(extra), answers: asked, skip: true });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const discardJob = () => {
    if (!job) return;
    void closeAiJob(job.id, "discarded");
    setJob(null);
    setQuestions(null);
    setAnswers([]);
    setAsked([]);
    startedHere.current = null;
  };

  if (!open) {
    return (
      <div>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <IconSparkle size={18} /> Chiedi all&apos;AI <span className="hidden sm:inline">di preparare o modificare la bozza</span>
        </Button>
      </div>
    );
  }

  return (
    <Card dark>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Eyebrow dark>Assistente AI</Eyebrow>
          <p className="mt-1.5 max-w-prose text-[15px] leading-relaxed text-muted-dark">
            Descrivi cosa vuoi per questa fase. L&apos;AI conosce il tuo metodo, i programmi precedenti, il logbook del cliente, i check, la posturale e i diari. La bozza arriva qui sotto da rivedere: il cliente non vede nulla finché non pubblichi.
          </p>
        </div>
        <button type="button" aria-label="Chiudi assistente" onClick={() => setOpen(false)} className="rounded-full p-2 text-muted-dark hover:text-card">
          <IconX />
        </button>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5" aria-label="Richieste rapide">
          {AI_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setInstruction((v) => (v.trim() ? `${v.trim().replace(/[.]$/, "")}. ${p}.` : `${p}.`))}
              className="rounded-full bg-line-dark px-3 py-1.5 text-[13px] font-semibold text-card hover:bg-[#3a3832]"
            >
              + {p}
            </button>
          ))}
        </div>
        <label htmlFor="ai-instruction" className="sr-only">Richiesta per l&apos;AI</label>
        <Textarea
          id="ai-instruction"
          value={instruction}
          onChange={(e) => {
            setInstruction(e.target.value);
            setQuestions(null);
            setAsked([]);
          }}
          rows={4}
          placeholder="Es. Passiamo a volumizzazione per 6 settimane. Togli lo stacco da terra per il fastidio lombare, aggiungi un giorno di corsa facile, tieni gli allungamenti per i quadricipiti."
          className="!border-line-dark !bg-[#26241f] !text-card placeholder:!text-muted-dark"
        />
        {listening ? (
          <p className="-mt-1 text-sm text-muted-dark italic" aria-live="polite">
            {dictation.mode === "server" ? "Parla pure: quando tocchi di nuovo il pulsante, il testo compare qui. Puoi anche toccare subito \"Prepara la bozza\"." : interim ? `${interim}…` : "Parla pure: il testo compare qui mentre lo trascrivo."}
          </p>
        ) : transcribing ? (
          <p className="-mt-1 text-sm text-muted-dark italic" aria-live="polite">Sto trascrivendo quello che hai detto…</p>
        ) : null}
        {dictation.error ? <Notice tone="error">{dictation.error}</Notice> : null}
        <div className="flex flex-wrap items-center gap-2.5">
          {dictation.supported ? (
            <button type="button" onClick={dictation.toggle} disabled={transcribing || busy} className={cx("inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold disabled:opacity-70", listening ? "bg-accent text-ink" : "bg-line-dark text-card")}>
              <IconMic size={18} />{" "}
              {transcribing ? "Trascrivo…" : listening ? (dictation.mode === "server" ? `${Math.floor(dictation.seconds / 60)}:${String(Math.floor(dictation.seconds % 60)).padStart(2, "0")} · tocca per finire` : "Sto ascoltando… tocca per fermare") : "Detta"}
            </button>
          ) : (
            <span className="text-sm text-muted-dark">Per dettare tocca la casella e usa il microfono della tastiera.</span>
          )}
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-line-dark px-4 text-sm font-semibold text-card">
            Allega foto dei test
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={async (e) => {
                const files = Array.from(e.target.files ?? []).slice(0, 4 - images.length);
                const done = await Promise.all(files.map(resizeImage));
                setImages((v) => [...v, ...done].slice(0, 4));
                e.target.value = "";
              }}
            />
          </label>
          {images.map((img, i) => (
            <span key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.preview} alt={`Allegato ${i + 1}`} className="h-11 w-11 rounded-lg object-cover" />
              <button type="button" aria-label="Togli allegato" onClick={() => setImages((v) => v.filter((_, j) => j !== i))} className="absolute -top-2 -right-2 rounded-full bg-card p-0.5 text-ink">
                <IconX size={14} />
              </button>
            </span>
          ))}
        </div>
        {dirty ? <p className="text-sm text-muted-dark">L&apos;AI parte dalla versione che vedi ora, comprese le modifiche non salvate.</p> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        {questions?.length ? (
          <div className="flex flex-col gap-4 rounded-2xl bg-[#26241f] px-4 py-4" aria-label="Domande dell'AI">
            <div>
              <div className="font-semibold">Prima di preparare la bozza, qualche domanda</div>
              <p className="mt-1 text-sm text-muted-dark">Rispondi solo a quelle che vuoi: le altre le lascia decidere al tuo metodo.</p>
            </div>
            {questions.map((q, i) => (
              <div key={i} className="flex flex-col gap-2">
                <label htmlFor={`ai-answer-${i}`} className="text-[15px] leading-snug">{i + 1}. {q.question}</label>
                {q.options.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {q.options.map((o) => (
                      <button
                        key={o}
                        type="button"
                        onClick={() => setAnswers((a) => a.map((x, j) => (j === i ? o : x)))}
                        className={cx("rounded-full px-3 py-1.5 text-[13px] font-semibold", answers[i] === o ? "bg-card text-ink" : "bg-line-dark text-card hover:bg-[#3a3832]")}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                ) : null}
                <input
                  id={`ai-answer-${i}`}
                  value={answers[i] ?? ""}
                  onChange={(e) => setAnswers((a) => a.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder="La tua risposta"
                  className="min-h-11 rounded-xl border border-line-dark bg-[#1b1a17] px-3 text-[15px] text-card placeholder:text-muted-dark"
                />
              </div>
            ))}
            <button type="button" onClick={skipQuestions} disabled={busy} className="self-start text-sm font-semibold text-muted-dark underline disabled:opacity-50">Salta le domande e prepara la bozza</button>
          </div>
        ) : null}
        {job?.status === "working" ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-[#26241f] px-4 py-4" data-ai-job="working" aria-live="polite">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" /><span className="relative inline-flex h-3 w-3 rounded-full bg-accent" /></span>
              <span className="font-semibold">{jobLabel(job)}</span>
            </div>
            <p className="text-sm leading-relaxed text-muted-dark">Puoi passare a un altro cliente: l&apos;AI continua da sola. Quando è pronta ti arriva la notifica e la trovi qui, in questo programma, e tra le Bozze AI (il pulsante con la stellina).</p>
            <div className="flex flex-wrap items-center gap-2.5">
              <Link href="/staff#programmi" className="inline-flex min-h-11 items-center rounded-full bg-card px-4 text-sm font-semibold text-ink">Prossimo cliente</Link>
              <button type="button" onClick={discardJob} className="min-h-11 px-2 text-sm font-semibold text-muted-dark underline">Annulla la richiesta</button>
            </div>
          </div>
        ) : null}
        {job?.status === "ready" && job.draft ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-[#26241f] px-4 py-4" data-ai-job="ready">
            <div className="font-semibold">La bozza è pronta</div>
            {job.draft.summary ? <p className="text-[15px] leading-relaxed text-muted-dark">{job.draft.summary}</p> : null}
            <div className="flex flex-wrap items-center gap-2.5">
              <button type="button" onClick={() => openJobDraft(job)} className="inline-flex min-h-11 items-center rounded-full bg-card px-4 text-sm font-semibold text-ink">Apri la bozza</button>
              <button type="button" onClick={discardJob} className="min-h-11 px-2 text-sm font-semibold text-muted-dark underline">Scartala</button>
            </div>
          </div>
        ) : null}
        {job?.status === "failed" ? <Notice tone="error">{job.error ?? "La bozza non è riuscita: riprova."}</Notice> : null}
        {summary ? (
          <div className="rounded-2xl bg-[#26241f] px-4 py-3 text-[15px] leading-relaxed">
            <div className="mb-1 font-semibold">Cosa ha cambiato l&apos;AI</div>
            {summary}
          </div>
        ) : null}
        <div className={cx((job?.status === "working" || job?.status === "ready") && "hidden")}>
          <button
            type="button"
            onClick={run}
            disabled={busy || transcribing || disabled || job?.status === "working" || (fullInstruction().length < 3 && !listening)}
            className="inline-flex min-h-12 items-center gap-3 rounded-full bg-card py-1.5 pr-5 pl-1.5 font-semibold text-ink disabled:opacity-50"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent"><IconSparkle size={18} /></span>
            {busy
              ? `Invio la richiesta… ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`
              : questions?.length ? "Prepara la bozza con queste risposte" : job?.status === "failed" ? "Riprova" : "Prepara la bozza"}
          </button>
        </div>
      </div>
    </Card>
  );
}

export function RowAiButtons({
  programId,
  item,
  weeks,
  onPrescriptions,
  onReplace,
}: {
  programId: string;
  item: ProgramItem;
  weeks: number;
  onPrescriptions: (p: string[]) => void;
  onReplace: (name: string) => void;
}) {
  const [busy, setBusy] = useState<"progress" | "alt" | null>(null);
  const [alts, setAlts] = useState<Array<{ name: string; reason: string }> | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const progress = async () => {
    setBusy("progress");
    setInfo(null);
    try {
      const r = await post<{ prescriptions: string[]; reason: string }>({ mode: "progress", programId, weeks, item: { name: item.name, prescriptions: item.prescriptions, notes: item.notes, exerciseId: item.exerciseId } });
      onPrescriptions(r.prescriptions);
      setInfo(r.reason);
    } catch (e) {
      setInfo(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };
  const alternatives = async () => {
    setBusy("alt");
    setInfo(null);
    try {
      const r = await post<{ alternatives: Array<{ name: string; reason: string }> }>({ mode: "alternatives", programId, item: { name: item.name } });
      setAlts(r.alternatives);
    } catch (e) {
      setInfo(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <span className="relative flex w-full flex-col items-end">
      <button
        type="button"
        title="Fai progredire le settimane con l'AI"
        aria-label="Fai progredire le settimane con l'AI"
        disabled={busy !== null}
        onClick={progress}
        className="flex h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold whitespace-nowrap text-muted hover:bg-sand hover:text-ink disabled:opacity-40"
      >
        <IconSparkle size={15} /> {busy === "progress" ? "…" : "Progredisci"}
      </button>
      <button
        type="button"
        title="Proponi alternative con l'AI"
        aria-label="Proponi esercizi alternativi con l'AI"
        disabled={busy !== null}
        onClick={alternatives}
        className="flex h-8 items-center rounded-full px-2 text-xs font-semibold whitespace-nowrap text-muted hover:bg-sand hover:text-ink disabled:opacity-40"
      >
        {busy === "alt" ? "…" : "Alternative"}
      </button>
      {alts || info ? (
        <div role="dialog" aria-label="Proposte dell'AI" className="absolute top-10 right-0 z-20 w-72 rounded-2xl bg-ink p-3 text-sm text-card shadow-lg">
          <div className="mb-2 flex justify-between gap-2">
            <span className="font-semibold">{alts ? "Alternative" : "AI"}</span>
            <button type="button" aria-label="Chiudi" onClick={() => { setAlts(null); setInfo(null); }}><IconX size={16} /></button>
          </div>
          {info ? <p className="leading-relaxed text-muted-dark">{info}</p> : null}
          {alts?.map((a) => (
            <button
              key={a.name}
              type="button"
              onClick={() => {
                onReplace(a.name);
                setAlts(null);
              }}
              className="mb-1 block w-full rounded-xl p-2 text-left hover:bg-line-dark"
            >
              <span className="font-semibold">{a.name}</span>
              <span className="block text-xs text-muted-dark">{a.reason}</span>
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}
