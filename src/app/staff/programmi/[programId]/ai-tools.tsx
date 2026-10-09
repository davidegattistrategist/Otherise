"use client";

/**
 * Assistente AI nell'editor del programma:
 * - pannello "Chiedi all'AI": descrivi a voce o per iscritto cosa cambiare, allega i test
 * - pulsanti sulla riga: "Fai progredire" e "Alternative"
 * Le proposte dell'AI arrivano nell'editor come modifiche NON salvate: il
 * trainer le rivede e decide se salvarle.
 */
import { useRef, useState, useSyncExternalStore } from "react";
import type { ProgramContent, ProgramItem } from "@/lib/program/types";
import { Button, Card, Eyebrow, Notice, Textarea, cx } from "@/components/ui";
import { IconMic, IconSparkle, IconX } from "@/components/icons";

type Img = { mediaType: "image/jpeg"; data: string; preview: string };

async function post<T>(body: unknown): Promise<T> {
  const res = await fetch("/api/ai/program", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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

type SpeechRec = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null };

function getSpeech(): (new () => SpeechRec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noopSubscribe = () => () => {};

/** Richieste frequenti: un tocco le aggiunge al testo, poi si può completare a voce. */
const AI_PRESETS = [
  "Stessa struttura, progressione secondo il mio metodo",
  "Ultima settimana di scarico",
  "Cambia i complementari, tieni i fondamentali",
  "Tieni conto dei fastidi segnalati nei check-up e nelle note",
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
}: {
  programId: string;
  currentContent: ProgramContent;
  weeks: number;
  disabled: boolean;
  dirty: boolean;
  onApply: (content: ProgramContent, notes: Record<string, string>, weeks?: number) => void;
}) {
  const [open, setOpen] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("ai") === "1");
  const [instruction, setInstruction] = useState("");
  const [images, setImages] = useState<Img[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const canDictate = useSyncExternalStore(noopSubscribe, () => getSpeech() !== null, () => false);
  const recRef = useRef<SpeechRec | null>(null);


  const toggleDictation = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Ctor = getSpeech();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "it-IT";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) text += e.results[i][0].transcript;
      if (text) setInstruction((v) => (v ? `${v} ${text.trim()}` : text.trim()));
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const title = (document.getElementById("program-title") as HTMLInputElement | null)?.value ?? "";
      const description = (document.getElementById("desc") as HTMLTextAreaElement | null)?.value ?? "";
      const res = await post<{ summary: string; content: ProgramContent; notes: Record<string, string>; weeks: number }>({
        mode: "revise",
        programId,
        instruction,
        current: { title, description, weeks, content: currentContent },
        images: images.map(({ mediaType, data }) => ({ mediaType, data })),
      });
      onApply(res.content, res.notes, res.weeks);
      setSummary(res.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
    }
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
            Descrivi cosa vuoi per questa fase. L&apos;AI conosce il tuo metodo, i programmi precedenti, il logbook del cliente, i check, la posturale e i check-up. La bozza arriva qui sotto da rivedere: il cliente non vede nulla finché non pubblichi.
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
          onChange={(e) => setInstruction(e.target.value)}
          rows={4}
          placeholder="Es. Passiamo a volumizzazione per 6 settimane. Togli lo stacco da terra per il fastidio lombare, aggiungi un giorno di corsa facile, tieni gli allungamenti per i quadricipiti."
          className="!border-line-dark !bg-[#26241f] !text-card placeholder:!text-muted-dark"
        />
        <div className="flex flex-wrap items-center gap-2.5">
          {canDictate ? (
            <button type="button" onClick={toggleDictation} className={cx("inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold", listening ? "bg-accent text-ink" : "bg-line-dark text-card")}>
              <IconMic size={18} /> {listening ? "Sto ascoltando… tocca per fermare" : "Detta"}
            </button>
          ) : (
            <span className="text-sm text-muted-dark">Per dettare usa il microfono della tastiera del telefono.</span>
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
        {summary ? (
          <div className="rounded-2xl bg-[#26241f] px-4 py-3 text-[15px] leading-relaxed">
            <div className="mb-1 font-semibold">Cosa ha cambiato l&apos;AI</div>
            {summary}
          </div>
        ) : null}
        <div>
          <button
            type="button"
            onClick={run}
            disabled={busy || disabled || instruction.trim().length < 3}
            className="inline-flex min-h-12 items-center gap-3 rounded-full bg-card py-1.5 pr-5 pl-1.5 font-semibold text-ink disabled:opacity-50"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent"><IconSparkle size={18} /></span>
            {busy ? "Sto preparando la bozza… (anche un minuto)" : "Prepara la bozza"}
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
      setInfo(e instanceof Error ? e.message : "Errore");
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
      setInfo(e instanceof Error ? e.message : "Errore");
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
