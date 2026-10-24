"use client";

/**
 * Conversazione: messaggi, foto, video e vocali (con la trascrizione sotto).
 * Si aggiorna da sola ogni pochi secondi mentre è aperta.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { loadDraft, useDraft } from "../use-draft";
import { Linkified } from "./linkify";
import { friendlyError } from "@/lib/friendly-error";
import { deleteMessage, dismissReplyDraft, prepareUpload, requestReplyDraft, sendMessage } from "@/app/chat/actions";
import type { ReplyDraft } from "@/lib/ai/reply";
import { MAX_ATTACHMENTS, attachmentKind, sizeError, mediaExpired, voiceLength, type ChatAttachment, type ChatMessage, type Transcript } from "@/lib/chat-shared";
import { cx } from "@/components/ui";
import { IconDownload, IconPaperclip, IconPlay, IconSend, IconSparkle, IconX } from "@/components/icons";
import { prepareImage, saveAttachment, uploadWithProgress, videoSize } from "./media";
import { VoicePlayer, useVoiceRecorder, voiceSupported } from "./voice";
import { useKeepAwake } from "../use-keep-awake";
import { opensKeyboard } from "../nav-behavior";
import { METHOD_LABELS, canCompressVideo, compressVideo, shouldCompress, type CompressMethod } from "./compress-video";

const MicIcon = () => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0" /><path d="M12 17.5V21" />
  </svg>
);

/** `preparing`: il video si sta riducendo (da 0 a 1); `width`/`height` dal video compresso */
type Pending = {
  id: string;
  file: File;
  kind: "image" | "video";
  preview: string;
  progress: number;
  error?: string;
  preparing?: number;
  width?: number;
  height?: number;
  /** Peso del video prima della riduzione (per mostrare quanto si è risparmiato) */
  originalSize?: number;
  /** Secondi impiegati per ridurlo e come */
  reduceSeconds?: number;
  reduceMethod?: CompressMethod;
  /** Il video sta già salendo mentre scrivi il messaggio */
  uploading?: boolean;
};
type Uploaded = ChatAttachment;
const mb = (bytes: number) => `${bytes < 10 * 1024 * 1024 ? (bytes / 1048576).toFixed(1).replace(".", ",") : Math.round(bytes / 1048576)} MB`;

const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
function dayLabel(iso: string) {
  const k = dayKey(iso);
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 864e5).toISOString());
  if (k === today) return "Oggi";
  if (k === yesterday) return "Ieri";
  return new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
}
const timeOf = (iso: string) => new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function ChatThread({
  clientId,
  initial,
  showSenderNames,
  emptyText,
  className,
  drafts,
  prefill,
}: {
  clientId: string;
  initial: ChatMessage[];
  /** Mostra il nome di chi scrive (utile allo staff: titolare e collaboratore nella stessa chat) */
  showSenderNames?: boolean;
  emptyText: string;
  className?: string;
  /** Solo staff: bozze di risposta dell'assistente AI (null = nessuna pronta) */
  drafts?: { initial: ReplyDraft | null; clientName?: string };
  /** Testo già scritto nel campo (es. promemoria di pagamento): parte solo se premi invio */
  prefill?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [text, setText] = useState(prefill ?? "");
  // quello che stai scrivendo resta anche se chiudi l'app (si cancella all'invio)
  const textDraftKey = `chat:${clientId}`;
  const { adopt: adoptText, clear: clearTextDraft } = useDraft(textDraftKey, text, { isEmpty: (t) => !t.trim() });
  useEffect(() => {
    let alive = true;
    void loadDraft<string>(textDraftKey).then((d) => {
      if (!alive || !d || typeof d.data !== "string" || !d.data.trim()) return;
      adoptText(d.data, d.at);
      // con un testo già pronto (promemoria) quello che stavi scrivendo non si butta: resta sopra
      setText((t) => (prefill ? (t === prefill && !d.data.includes(prefill) ? `${d.data.trimEnd()}\n\n${prefill}` : t) : t || d.data));
    });
    return () => {
      alive = false;
    };
  }, [textDraftKey, prefill, adoptText]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ url: string; name: string; path: string } | null>(null);
  /** Arrivato un messaggio mentre eri più in alto: compare "Nuovo messaggio ↓" */
  const [newBelow, setNewBelow] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const download = async (url: string, name: string, path: string) => {
    setDownloading(path);
    setError(null);
    try {
      await saveAttachment(url, name);
    } catch {
      setError("Non sono riuscito a scaricarlo. Controlla la connessione e riprova.");
    } finally {
      setDownloading(null);
    }
  };
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stick = useRef(true);
  const lastAt = useRef<string | null>(initial.length ? initial[initial.length - 1].createdAt : null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState<ReplyDraft | null>(drafts?.initial ?? null);
  const [usedDraft, setUsedDraft] = useState<string | null>(null);
  const [hiddenDraft, setHiddenDraft] = useState<string | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const draftsOn = Boolean(drafts);
  const [canVoice, setCanVoice] = useState(false);
  const voice = useVoiceRecorder(() => void sendVoice());
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dipende dal browser: si sa solo dopo il caricamento
    setCanVoice(voiceSupported());
  }, []);

  // messaggi più vecchi: la prima pagina ne ha 80, gli altri si caricano a richiesta
  const [hasOlder, setHasOlder] = useState(initial.length >= 80);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadOlder = async () => {
    const oldest = messages[0]?.createdAt;
    const el = listRef.current;
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const r = await fetch(`/api/chat/${clientId}?before=${encodeURIComponent(oldest)}`, { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as { messages: ChatMessage[]; more: boolean };
      const keep = el ? el.scrollHeight - el.scrollTop : 0;
      setMessages((cur) => {
        const known = new Set(cur.map((m) => m.id));
        return [...d.messages.filter((m) => !known.has(m.id)), ...cur];
      });
      setHasOlder(d.more);
      // resta allo stesso punto della conversazione
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - keep;
      });
    } finally {
      setLoadingOlder(false);
    }
  };

  // `advance`: sposta il punto da cui l'aggiornamento automatico legge i messaggi nuovi. Dopo un
  // invio NON si sposta: un messaggio dell'altra persona arrivato un attimo prima del mio
  // (con `created_at` più vecchio) altrimenti non comparirebbe mai senza ricaricare
  const merge = useCallback((incoming: ChatMessage[], deleted: string[] = [], transcripts: Record<string, Transcript> = {}, advance = true) => {
    setMessages((cur) => {
      const byId = new Map(cur.map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, m);
      for (const [id, t] of Object.entries(transcripts)) {
        const m = byId.get(id);
        if (m && (m.transcript?.status !== t.status || m.transcript?.text !== t.text)) byId.set(id, { ...m, transcript: t });
      }
      for (const id of deleted) {
        const m = byId.get(id);
        if (m) byId.set(id, { ...m, deleted: true, body: "", attachments: [] });
      }
      const all = [...byId.values()].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      if (advance && all.length) lastAt.current = all[all.length - 1].createdAt;
      return all;
    });
  }, []);

  // aggiornamento automatico: ogni 4 secondi mentre la conversazione è viva
  // (un messaggio negli ultimi 2 minuti, o stai scrivendo), altrimenti ogni 10;
  // subito quando torni sull'app
  const lastActivity = useRef(0);
  useEffect(() => {
    lastActivity.current = Date.now();
  }, [messages.length, text]);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const q = lastAt.current ? `?after=${encodeURIComponent(lastAt.current)}` : "";
        const res = await fetch(`/api/chat/${clientId}${q}`, { cache: "no-store" });
        if (!res.ok || stop) return;
        const data = (await res.json()) as { messages: ChatMessage[]; deleted: string[]; transcripts?: Record<string, Transcript>; draft?: ReplyDraft | null };
        if (data.messages.length || data.deleted.length || Object.keys(data.transcripts ?? {}).length) merge(data.messages, data.deleted, data.transcripts ?? {});
        if (draftsOn && data.draft !== undefined) setDraft(data.draft);
      } catch {
        /* rete assente: si riprova al giro dopo */
      }
    };
    const loop = () => {
      const lively = Date.now() - lastActivity.current < 120_000;
      timer = setTimeout(async () => {
        await tick();
        if (!stop) loop();
      }, lively ? 4000 : 10_000);
    };
    loop();
    const onVis = () => !document.hidden && void tick();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [clientId, merge, draftsOn]);

  // resta in fondo quando arrivano messaggi (se si era già in fondo); se eri
  // più in alto a leggere, compare "Nuovo messaggio ↓" invece di farti saltare
  const lastSeenId = useRef(messages[messages.length - 1]?.id);
  useLayoutEffect(() => {
    const el = listRef.current;
    const lastId = messages[messages.length - 1]?.id;
    const arrived = lastId !== lastSeenId.current;
    lastSeenId.current = lastId;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
    else if (arrived && !messages[messages.length - 1]?.mine) setNewBelow(true);
  }, [messages, pending.length]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (stick.current && newBelow) setNewBelow(false);
  };
  const toBottom = () => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    stick.current = true;
    setNewBelow(false);
  };

  // Telefono con la tastiera aperta: la chat (messaggi + casella) occupa
  // esattamente la parte visibile sopra la tastiera, fissa, come la nota a
  // tutto schermo. Prima si accorciava ma la pagina scorreva verso l'alto e
  // bisognava tornare giù col pollice per vedere cosa si scriveva.
  useEffect(() => {
    const vv = window.visualViewport;
    const box = boxRef.current;
    if (!vv || !box) return;
    const KEYS = ["position", "top", "left", "width", "height", "zIndex", "borderRadius"] as const;
    let on = false;
    const reset = () => {
      if (!on) return;
      on = false;
      for (const k of KEYS) box.style[k] = "";
    };
    // sul telefono basta stare scrivendo nella chat: su iPhone (app sulla Home)
    // la pagina a volte si accorcia insieme alla tastiera e la differenza di
    // altezza non si vede, così la chat restava alta come prima, staccata dalla tastiera
    const touch = window.matchMedia("(pointer: coarse)").matches;
    const fit = () => {
      const active = document.activeElement;
      const inChat = box.contains(active);
      const keyboard = inChat && ((touch && opensKeyboard(active)) || window.innerHeight - vv.height > 120);
      if (!keyboard) return reset();
      const wasOn = on;
      on = true;
      box.style.position = "fixed";
      box.style.top = `${Math.round(vv.offsetTop)}px`;
      box.style.left = `${Math.round(vv.offsetLeft)}px`;
      box.style.width = `${Math.round(vv.width)}px`;
      box.style.height = `${Math.round(vv.height)}px`;
      box.style.zIndex = "80";
      box.style.borderRadius = "0";
      const el = listRef.current;
      if (el && (stick.current || !wasOn)) {
        stick.current = true;
        el.scrollTop = el.scrollHeight;
      }
    };
    // dopo il tocco la tastiera si apre in un attimo: si ricontrolla appena ha finito
    const later = () => {
      // subito solo se si entra in una casella; toccando un pulsante (microfono,
      // graffetta) la chat non deve muoversi sotto il dito
      if (opensKeyboard(document.activeElement)) fit();
      setTimeout(fit, 150);
      setTimeout(fit, 400);
    };
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    document.addEventListener("focusin", later);
    // uscendo dalla casella si aspetta un attimo: toccando "Invia" la chat non
    // deve saltare tra il dito giù e il dito su (il tocco andrebbe perso)
    const leave = () => {
      setTimeout(fit, 180);
      setTimeout(fit, 450);
    };
    document.addEventListener("focusout", leave);
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
      document.removeEventListener("focusin", later);
      document.removeEventListener("focusout", leave);
      reset();
    };
  }, []);

  // video in compressione: si possono annullare togliendo l'allegato
  const compressing = useRef(new Map<string, AbortController>());
  useEffect(() => {
    const running = compressing.current;
    return () => running.forEach((c) => c.abort());
  }, []);

  // video che salgono già prima di "Invia" (come WhatsApp): id → caricamento in corso
  const uploads = useRef(new Map<string, Promise<Uploaded>>());
  const setProgress = (id: string, v: number) => setPending((cur) => cur.map((x) => (x.id === id ? { ...x, progress: v } : x)));

  /** Carica un allegato nello storage e restituisce i dati per il messaggio. */
  const uploadOne = async (p: Pick<Pending, "id" | "file" | "kind" | "width" | "height">): Promise<Uploaded> => {
    const ready = p.kind === "image" ? await prepareImage(p.file) : { blob: p.file as Blob, type: p.file.type, name: p.file.name, ...(p.width && p.height ? { width: p.width, height: p.height } : await videoSize(p.file)) };
    const ticket = await prepareUpload(clientId, { type: ready.type, size: ready.blob.size });
    if ("error" in ticket) throw new Error(ticket.error);
    await uploadWithProgress(ticket.signedUrl, ready.blob, ready.type, (v) => setProgress(p.id, v));
    return { path: ticket.path, kind: p.kind, name: ready.name, size: ready.blob.size, width: ready.width, height: ready.height };
  };

  /** Il video parte subito: quando tocchi "Invia" è già (quasi) caricato. */
  const preUpload = (p: Pick<Pending, "id" | "file" | "kind" | "width" | "height">) => {
    setPending((cur) => cur.map((x) => (x.id === p.id ? { ...x, uploading: true, progress: 0 } : x)));
    const job = uploadOne(p);
    uploads.current.set(p.id, job);
    job.then(
      () => setPending((cur) => cur.map((x) => (x.id === p.id ? { ...x, uploading: false, progress: 1 } : x))),
      () => {
        // riproverà al momento dell'invio
        uploads.current.delete(p.id);
        setPending((cur) => cur.map((x) => (x.id === p.id ? { ...x, uploading: false, progress: 0 } : x)));
      },
    );
  };

  /** Riduce il video come WhatsApp; se non si può, tiene l'originale (se non è troppo pesante). */
  const prepareVideo = async (id: string, original: File) => {
    const ctrl = new AbortController();
    compressing.current.set(id, ctrl);
    const started = performance.now();
    const res = await compressVideo(original, (v) => setPending((cur) => cur.map((x) => (x.id === id ? { ...x, preparing: v } : x))), ctrl.signal);
    compressing.current.delete(id);
    if (ctrl.signal.aborted) return;
    const file = res?.file ?? original;
    const tooBig = sizeError("video", file.size);
    if (tooBig) {
      setError(res ? tooBig : `${tooBig} Questo telefono non riesce a ridurlo da solo.`);
      setPending((cur) => cur.filter((x) => x.id !== id));
      return;
    }
    setPending((cur) => cur.map((x) => (x.id === id ? { ...x, file, preparing: undefined, width: res?.width, height: res?.height, originalSize: res ? original.size : undefined, reduceSeconds: res ? Math.max(1, Math.round((performance.now() - started) / 1000)) : undefined, reduceMethod: res?.method } : x)));
    preUpload({ id, file, kind: "video", width: res?.width, height: res?.height });
  };

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    setError(null);
    const next: Pending[] = [];
    const toCompress: Pending[] = [];
    for (const f of Array.from(files)) {
      const kind = attachmentKind(f.type);
      if (!kind || kind === "audio") {
        setError(kind === "audio" ? "Per i vocali tocca il microfono accanto alla casella del messaggio." : "Si possono mandare solo foto e video.");
        continue;
      }
      const item: Pending = { id: `${f.name}-${f.size}-${Math.random()}`, file: f, kind, preview: URL.createObjectURL(f), progress: 0 };
      if (kind === "video" && canCompressVideo() && shouldCompress(f)) {
        // il controllo del peso si fa dopo la compressione
        item.preparing = 0;
        toCompress.push(item);
      } else {
        const tooBig = sizeError(kind, f.size);
        if (tooBig) {
          URL.revokeObjectURL(item.preview);
          setError(tooBig);
          continue;
        }
      }
      next.push(item);
    }
    const room = MAX_ATTACHMENTS - pending.length;
    const added = next.slice(0, Math.max(0, room));
    setPending((cur) => [...cur, ...added].slice(0, MAX_ATTACHMENTS));
    for (const p of toCompress) if (added.includes(p)) void prepareVideo(p.id, p.file);
    for (const p of added) if (p.kind === "video" && p.preparing === undefined) preUpload(p);
  };

  const removePending = (id: string) => {
    compressing.current.get(id)?.abort();
    compressing.current.delete(id);
    uploads.current.delete(id);
    setPending((cur) => {
      const p = cur.find((x) => x.id === id);
      if (p) URL.revokeObjectURL(p.preview);
      return cur.filter((x) => x.id !== id);
    });
  };
  const preparingVideo = pending.some((p) => p.preparing !== undefined);
  const uploadingVideo = pending.some((p) => p.uploading) || (sending && pending.some((p) => p.kind === "video"));
  const reduced = pending.find((p) => p.originalSize && p.preparing === undefined);
  const videoNote = reduced ? `Video ridotto da ${mb(reduced.originalSize!)} a ${mb(reduced.file.size)}${reduced.reduceSeconds ? ` in ${reduced.reduceSeconds} s` : ""}${reduced.reduceMethod ? ` (${METHOD_LABELS[reduced.reduceMethod]})` : ""}.` : "";
  const busyWithMedia = preparingVideo || uploadingVideo;

  // mentre un video si riduce o sale: schermo acceso e avviso se provi a chiudere la pagina
  // schermo acceso mentre il video si riduce e sale (e mentre si invia con allegati)
  useKeepAwake(busyWithMedia || (sending && pending.length > 0));
  useEffect(() => {
    if (!busyWithMedia) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
    };
  }, [busyWithMedia]);

  const send = async () => {
    if (sending) return;
    const body = text.trim();
    if (!body && pending.length === 0) return;
    if (preparingVideo) return;
    setSending(true);
    setError(null);
    stick.current = true;
    try {
      const attachments: ChatAttachment[] = [];
      for (const p of pending) {
        // se il video stava già salendo aspettiamo quello; se era fallito, riproviamo adesso
        const early = uploads.current.get(p.id);
        let done: Uploaded | null = null;
        if (early) done = await early.catch(() => null);
        attachments.push(done ?? (await uploadOne(p)));
      }
      uploads.current.clear();
      const res = await sendMessage(clientId, { body, attachments, draftId: usedDraft });
      if (!res.ok) throw new Error(res.error);
      merge([res.message], [], {}, false);
      // il messaggio è partito davvero: la bozza non serve più. Se intanto hai scritto altro
      // nella casella (un video sale anche un minuto), quello resta
      if (body) clearTextDraft();
      setText((cur) => (cur.trim() === body ? "" : cur.startsWith(body) ? cur.slice(body.length).trimStart() : cur));
      if (inputRef.current) inputRef.current.style.height = "auto";
      if (body && draft) setDraft(null);
      setUsedDraft(null);
      pending.forEach((p) => URL.revokeObjectURL(p.preview));
      setPending([]);
    } catch (e) {
      setError(friendlyError(e, "Invio non riuscito: riprova."));
    } finally {
      setSending(false);
    }
  };

  const startVoice = async () => {
    setError(null);
    try {
      await voice.start();
    } catch {
      setError("Per mandare un vocale consenti all'app di usare il microfono (te lo chiede il telefono). Se l'hai negato, riattivalo nelle impostazioni del browser.");
    }
  };

  // vocale registrato ma non partito (rete): resta qui con "Riprova", non si riregistra
  const [failedVoice, setFailedVoice] = useState<{ blob: Blob; type: string; seconds: number; path?: string } | null>(null);
  async function sendVoice(again?: { blob: Blob; type: string; seconds: number; path?: string }) {
    const stopped = again ?? (await voice.stop(true));
    if (!stopped) return;
    const rec: { blob: Blob; type: string; seconds: number; path?: string } = stopped;
    if (rec.seconds < 1) {
      setError("Vocale troppo corto.");
      return;
    }
    setSending(true);
    setError(null);
    stick.current = true;
    let path = rec.path;
    try {
      if (!path) {
        const ticket = await prepareUpload(clientId, { type: rec.type, size: rec.blob.size });
        if ("error" in ticket) throw new Error(ticket.error);
        await uploadWithProgress(ticket.signedUrl, rec.blob, rec.type, () => undefined);
        path = ticket.path;
      }
      const res = await sendMessage(clientId, { body: "", attachments: [{ path, kind: "audio", name: "Vocale", size: rec.blob.size, seconds: Math.round(rec.seconds) }] });
      if (!res.ok) throw new Error(res.error);
      merge([res.message], [], {}, false);
      setFailedVoice(null);
    } catch (e) {
      setFailedVoice({ blob: rec.blob, type: rec.type, seconds: rec.seconds, path });
      setError(friendlyError(e, "Vocale non inviato: riprova."));
    } finally {
      setSending(false);
    }
  }

  const resize = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  // testo già pronto (promemoria): campo alto quanto il messaggio
  useEffect(() => {
    if (!prefill) return;
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [prefill]);

  const applyDraft = (d: ReplyDraft) => {
    setText(d.body);
    setUsedDraft(d.id);
    setHiddenDraft(d.id);
    requestAnimationFrame(() => {
      resize();
      inputRef.current?.focus();
    });
  };

  const writeFromScratch = (d: ReplyDraft) => {
    setHiddenDraft(d.id);
    setUsedDraft(null);
    void dismissReplyDraft(clientId, d.id);
    inputRef.current?.focus();
  };

  const askDraft = async () => {
    setDraftBusy(true);
    setDraftError(null);
    try {
      const r = await requestReplyDraft(clientId);
      if (!r.ok) setDraftError(r.error);
      else if (r.draft) {
        setDraft(r.draft);
        setHiddenDraft(null);
      }
    } catch {
      setDraftError("L'assistente non ha risposto, riprova tra poco.");
    } finally {
      setDraftBusy(false);
    }
  };

  const lastMsg = messages[messages.length - 1];
  const clientWaiting = Boolean(lastMsg && !lastMsg.mine && !lastMsg.senderIsStaff && !lastMsg.deleted);
  const showDraft = draftsOn && draft && draft.id !== hiddenDraft;

  const remove = async (m: ChatMessage) => {
    if (!window.confirm("Eliminare questo messaggio per tutti?")) return;
    const r = await deleteMessage(clientId, m.id);
    if (r.ok) merge([], [m.id]);
    setSelected(null);
  };

  return (
    <div ref={boxRef} className={cx("relative flex min-h-0 flex-col overflow-hidden rounded-[24px] bg-card", className)}>
      <div ref={listRef} onScroll={onScroll} className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-4 sm:px-5" aria-live="polite">
        {messages.length === 0 ? <p className="m-auto max-w-sm px-4 text-center text-[15px] text-muted">{emptyText}</p> : null}
        {hasOlder ? (
          <button type="button" onClick={() => void loadOlder()} disabled={loadingOlder} className="mb-2 self-center rounded-full bg-sand px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60">
            {loadingOlder ? "Carico…" : "Messaggi precedenti"}
          </button>
        ) : null}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const showDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
          const showName = showSenderNames && !m.mine && (!prev || prev.mine || prev.senderName !== m.senderName || showDay);
          return (
            <div key={m.id} className="flex flex-col">
              {showDay ? <div className="my-3 self-center rounded-full bg-sand px-3 py-1 text-xs font-semibold text-muted first-letter:uppercase">{dayLabel(m.createdAt)}</div> : null}
              {showName && m.senderName ? <div className="mt-1 mb-0.5 px-2 text-xs font-semibold text-muted">{m.senderName}</div> : null}
              <div className={cx("flex max-w-[85%] flex-col gap-1 sm:max-w-[70%]", m.mine ? "items-end self-end" : "items-start self-start")}>
                {m.attachments.filter((a) => a.kind === "audio").map((a) => (
                  <VoicePlayer key={a.path} url={mediaExpired("audio", m.createdAt) ? null : a.url} seconds={a.seconds} transcript={m.transcript} mine={m.mine} expired={mediaExpired("audio", m.createdAt)} />
                ))}
                {m.attachments.some((a) => a.kind !== "audio") ? (
                  <div className={cx("grid gap-1", m.attachments.filter((a) => a.kind !== "audio").length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                    {m.attachments.filter((a) => a.kind !== "audio").map((a) =>
                      !a.url || mediaExpired(a.kind, m.createdAt) ? (
                        <div key={a.path} className="flex h-32 w-40 items-center justify-center rounded-2xl bg-sand px-3 text-center text-xs text-muted">
                          {mediaExpired(a.kind, m.createdAt) ? "Video scaduto: dopo 2 mesi si cancella da solo per fare spazio" : "Non disponibile"}
                        </div>
                      ) : (
                        <div key={a.path} className={cx("flex flex-col gap-0.5", m.mine ? "items-end" : "items-start")}>
                          {a.kind === "image" ? (
                            <button type="button" onClick={() => setViewer({ url: a.url!, name: a.name, path: a.path })} aria-label="Apri la foto (da lì la scarichi)" className="overflow-hidden rounded-2xl bg-sand">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={a.url!} alt="Foto allegata" loading="lazy" className="max-h-72 w-full max-w-[280px] object-cover" style={a.width && a.height ? { aspectRatio: `${a.width} / ${a.height}` } : undefined} />
                            </button>
                          ) : (
                            <video src={a.url!} controls playsInline preload="metadata" className="max-h-80 w-full max-w-[300px] rounded-2xl bg-ink" />
                          )}
                          {/* la foto si scarica dal visore a tutto schermo; il video da qui */}
                          {a.kind === "video" ? (
                            <button
                              type="button"
                              onClick={() => void download(a.url!, a.name, a.path)}
                              disabled={downloading === a.path}
                              className="inline-flex min-h-9 items-center gap-1 px-1 text-xs font-semibold text-muted hover:text-ink disabled:opacity-60"
                            >
                              <IconDownload size={14} /> {downloading === a.path ? "Scarico…" : "Scarica il video"}
                            </button>
                          ) : null}
                        </div>
                      ),
                    )}
                  </div>
                ) : null}
                {m.deleted ? (
                  <div className="rounded-2xl border border-dashed border-sand-deep px-3.5 py-2 text-sm text-muted italic">Messaggio eliminato</div>
                ) : m.body ? (
                  // un div (non un pulsante) così i link nel testo si possono toccare
                  <div
                    role={m.mine ? "button" : undefined}
                    tabIndex={m.mine ? 0 : undefined}
                    onClick={() => m.mine && setSelected(selected === m.id ? null : m.id)}
                    onKeyDown={(e) => m.mine && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSelected(selected === m.id ? null : m.id))}
                    className={cx(
                      "rounded-[20px] px-3.5 py-2 text-left text-[15px] leading-snug whitespace-pre-wrap [overflow-wrap:anywhere]",
                      m.mine ? "cursor-pointer rounded-br-md bg-ink text-card" : "rounded-bl-md bg-sand text-ink",
                    )}
                  >
                    <Linkified text={m.body} />
                  </div>
                ) : null}
                <div className="flex items-center gap-3 px-1 text-[11px] text-muted">
                  <span>{timeOf(m.createdAt)}</span>
                  {m.mine && !m.deleted && selected === m.id ? (
                    <button type="button" onClick={() => void remove(m)} className="font-semibold text-accent-deep">Elimina</button>
                  ) : m.mine && !m.deleted && !m.body ? (
                    <button type="button" onClick={() => setSelected(m.id)} aria-label="Altre azioni sul messaggio" className="-my-2 min-h-9 px-2 text-base leading-none font-bold">⋯</button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
        {newBelow ? (
          <div className="sticky bottom-1 z-10 flex justify-center pt-2">
            <button type="button" onClick={toBottom} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-card shadow-lg">Nuovo messaggio ↓</button>
          </div>
        ) : null}
      </div>

      {/* composizione */}
      <div className="border-t border-sand-deep bg-card px-3 py-3 sm:px-4">
        {error ? <p role="alert" className="mb-2 rounded-xl bg-accent-soft px-3 py-2 text-sm">{error}</p> : null}
        {failedVoice ? (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-sm" data-failed-voice>
            <span>Vocale di {Math.round(failedVoice.seconds)} s non inviato.</span>
            <button type="button" disabled={sending} onClick={() => void sendVoice(failedVoice)} className="min-h-9 rounded-full bg-ink px-3 font-semibold text-card">Riprova</button>
            <button type="button" onClick={() => { setFailedVoice(null); setError(null); }} className="min-h-9 rounded-full px-3 font-semibold ring-1 ring-ink/30">Elimina</button>
          </div>
        ) : null}
        {showDraft ? (
          <div className="mb-3 rounded-2xl border border-sand-deep bg-sand/60 p-3" aria-label="Bozza di risposta">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted uppercase"><IconSparkle size={14} /> Bozza di risposta</span>
              <button type="button" onClick={() => void askDraft()} disabled={draftBusy} className="-my-2 min-h-10 px-2 text-sm font-semibold text-muted underline disabled:opacity-50">{draftBusy ? "Sto riscrivendo…" : "Rifai"}</button>
            </div>
            <p className="mt-1.5 max-h-40 overflow-y-auto text-[15px] leading-snug whitespace-pre-wrap [overflow-wrap:anywhere]">{draft.body}</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button type="button" onClick={() => applyDraft(draft)} className="min-h-10 rounded-full bg-ink px-4 text-sm font-semibold text-card">Usa e modifica</button>
              <button type="button" onClick={() => writeFromScratch(draft)} className="min-h-10 rounded-full px-4 text-sm font-semibold ring-1 ring-sand-deep">Scrivo da zero</button>
            </div>
          </div>
        ) : draftsOn && clientWaiting && !text ? (
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <button type="button" onClick={() => void askDraft()} disabled={draftBusy} className="flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink disabled:opacity-60">
              <IconSparkle size={15} /> {draftBusy ? "Sto scrivendo la bozza…" : "Prepara una bozza di risposta"}
            </button>
          </div>
        ) : draftsOn && !text && !draftBusy ? (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-muted" data-testid="draft-hint">
            <IconSparkle size={13} /> Quando {drafts?.clientName || "il cliente"} ti scrive, qui trovi una bozza di risposta dell&apos;AI.
          </p>
        ) : null}
        {draftError ? <p role="alert" className="mb-2 rounded-xl bg-accent-soft px-3 py-2 text-sm">{draftError}</p> : null}
        {pending.length ? (
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {pending.map((p) => (
              <div key={p.id} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-sand">
                {p.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.preview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-ink text-card"><IconPlay size={22} /></div>
                )}
                {p.preparing !== undefined ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-ink/70 px-1.5 text-card" data-testid="video-compressing">
                    <span className="text-[11px] font-semibold">Riduco…</span>
                    <span className="text-xs font-bold tabular">{Math.round(p.preparing * 100)}%</span>
                    <div className="h-1 w-full rounded-full bg-white/30"><div className="h-1 rounded-full bg-white" style={{ width: `${Math.round(p.preparing * 100)}%` }} /></div>
                  </div>
                ) : null}
                {p.kind === "video" && p.preparing === undefined ? (
                  <span className="absolute top-1 left-1 rounded-full bg-ink/80 px-1.5 py-0.5 text-[10px] font-semibold text-card tabular" data-testid="video-size">{mb(p.file.size)}</span>
                ) : null}
                {sending || p.uploading || (p.kind === "video" && p.progress > 0 && p.progress < 1) ? (
                  <div className="absolute inset-x-1 bottom-1 h-1.5 rounded-full bg-white/60"><div className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.round(p.progress * 100)}%` }} /></div>
                ) : null}
                {!sending ? (
                  <button type="button" aria-label="Togli allegato" onClick={() => removePending(p.id)} className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink/80 text-card"><IconX size={14} /></button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        {preparingVideo ? (
          <p className="mb-2 text-xs text-muted" aria-live="polite">Riduco il video per mandarlo più leggero e veloce: tieni aperta l&apos;app qualche secondo.</p>
        ) : uploadingVideo ? (
          <p className="mb-2 text-xs text-muted" aria-live="polite">
            {videoNote ? `${videoNote} ` : ""}Il video sta già partendo: intanto puoi scrivere e toccare Invia. Tieni aperta l&apos;app finché non è inviato.
          </p>
        ) : videoNote ? (
          <p className="mb-2 text-xs text-muted">{videoNote}</p>
        ) : null}
        {voice.recording ? (
          <div className="flex items-center gap-2" aria-label="Registrazione del vocale">
            <button type="button" aria-label="Annulla il vocale" onClick={() => void voice.stop(false)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sand text-ink"><IconX size={20} /></button>
            <div className="flex h-11 flex-1 items-center gap-2.5 rounded-[22px] bg-accent-soft px-4" role="timer">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" aria-hidden="true" />
              <span className="text-[16px] font-semibold tabular">{voiceLength(voice.seconds)}</span>
              <span className="truncate text-sm text-ink-soft">Sto registrando…</span>
            </div>
            <button type="button" aria-label="Manda il vocale" onClick={() => void sendVoice()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white"><IconSend size={19} /></button>
          </div>
        ) : (
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="sr-only" aria-label="Allega foto o video" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          <button type="button" aria-label="Allega foto o video" disabled={sending || pending.length >= MAX_ATTACHMENTS} onClick={() => fileRef.current?.click()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sand text-ink disabled:opacity-40">
            <IconPaperclip size={20} />
          </button>
          <label htmlFor={`chat-${clientId}`} className="sr-only">Messaggio</label>
          <textarea
            ref={inputRef}
            id={`chat-${clientId}`}
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              resize();
            }}
            onKeyDown={(e) => {
              // da computer: Invio manda, Maiusc+Invio va a capo
              if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Scrivi un messaggio"
            maxLength={4000}
            data-clamp-ok
            className="max-h-40 min-h-11 flex-1 resize-none rounded-[22px] border border-sand-deep bg-sand px-4 py-2.5 text-[16px] leading-snug focus:border-ink focus:outline-none"
          />
          {canVoice && !text.trim() && pending.length === 0 && !sending ? (
            <button type="button" aria-label="Registra un vocale" onClick={() => void startVoice()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white">
              <MicIcon />
            </button>
          ) : (
            <button type="button" aria-label="Invia" onPointerDown={(e) => { if (e.pointerType !== "mouse") e.preventDefault(); }} onClick={() => void send()} disabled={sending || preparingVideo || (!text.trim() && pending.length === 0)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white disabled:opacity-40">
              {sending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <IconSend size={19} />}
            </button>
          )}
        </div>
        )}
      </div>

      {viewer ? (
        <div role="dialog" aria-label="Foto" className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/90 p-4" onClick={() => setViewer(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewer.url} alt="Foto allegata" className="max-h-full max-w-full rounded-xl object-contain" />
          <button type="button" aria-label="Chiudi" className="absolute top-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-card text-ink"><IconX /></button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void download(viewer.url, viewer.name, viewer.path);
            }}
            disabled={downloading === viewer.path}
            className="absolute bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-1/2 inline-flex min-h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-card px-5 text-[15px] font-semibold text-ink disabled:opacity-60"
          >
            <IconDownload size={18} /> {downloading === viewer.path ? "Scarico…" : "Scarica la foto"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
