"use client";

/**
 * Conversazione: messaggi, foto e video. Si aggiorna da sola ogni pochi
 * secondi mentre è aperta. Niente messaggi vocali (scelta voluta).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { deleteMessage, prepareUpload, sendMessage } from "@/app/chat/actions";
import { MAX_ATTACHMENTS, attachmentKind, sizeError, type ChatAttachment, type ChatMessage } from "@/lib/chat-shared";
import { cx } from "@/components/ui";
import { IconPaperclip, IconPlay, IconSend, IconX } from "@/components/icons";
import { prepareImage, uploadWithProgress, videoSize } from "./media";

type Pending = { id: string; file: File; kind: "image" | "video"; preview: string; progress: number; error?: string };

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
}: {
  clientId: string;
  initial: ChatMessage[];
  /** Mostra il nome di chi scrive (utile allo staff: titolare e collaboratore nella stessa chat) */
  showSenderNames?: boolean;
  emptyText: string;
  className?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stick = useRef(true);
  const lastAt = useRef<string | null>(initial.length ? initial[initial.length - 1].createdAt : null);

  const merge = useCallback((incoming: ChatMessage[], deleted: string[] = []) => {
    setMessages((cur) => {
      const byId = new Map(cur.map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, m);
      for (const id of deleted) {
        const m = byId.get(id);
        if (m) byId.set(id, { ...m, deleted: true, body: "", attachments: [] });
      }
      const all = [...byId.values()].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      if (all.length) lastAt.current = all[all.length - 1].createdAt;
      return all;
    });
  }, []);

  // aggiornamento automatico
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const q = lastAt.current ? `?after=${encodeURIComponent(lastAt.current)}` : "";
        const res = await fetch(`/api/chat/${clientId}${q}`, { cache: "no-store" });
        if (!res.ok || stop) return;
        const data = (await res.json()) as { messages: ChatMessage[]; deleted: string[] };
        if (data.messages.length || data.deleted.length) merge(data.messages, data.deleted);
      } catch {
        /* rete assente: si riprova al giro dopo */
      }
    };
    const id = setInterval(tick, 4000);
    const onVis = () => !document.hidden && void tick();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [clientId, merge]);

  // resta in fondo quando arrivano messaggi (se si era già in fondo)
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, pending.length]);

  const onScroll = () => {
    const el = listRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    setError(null);
    const next: Pending[] = [];
    for (const f of Array.from(files)) {
      const kind = attachmentKind(f.type);
      if (!kind) {
        setError("Si possono mandare solo foto e video.");
        continue;
      }
      const tooBig = sizeError(kind, f.size);
      if (tooBig) {
        setError(tooBig);
        continue;
      }
      next.push({ id: `${f.name}-${f.size}-${Math.random()}`, file: f, kind, preview: URL.createObjectURL(f), progress: 0 });
    }
    setPending((cur) => [...cur, ...next].slice(0, MAX_ATTACHMENTS));
  };

  const removePending = (id: string) =>
    setPending((cur) => {
      const p = cur.find((x) => x.id === id);
      if (p) URL.revokeObjectURL(p.preview);
      return cur.filter((x) => x.id !== id);
    });

  const send = async () => {
    if (sending) return;
    const body = text.trim();
    if (!body && pending.length === 0) return;
    setSending(true);
    setError(null);
    stick.current = true;
    try {
      const attachments: ChatAttachment[] = [];
      for (const p of pending) {
        const ready = p.kind === "image" ? await prepareImage(p.file) : { blob: p.file as Blob, type: p.file.type, name: p.file.name, ...(await videoSize(p.file)) };
        const ticket = await prepareUpload(clientId, { type: ready.type, size: ready.blob.size });
        if ("error" in ticket) throw new Error(ticket.error);
        await uploadWithProgress(ticket.signedUrl, ready.blob, ready.type, (v) => setPending((cur) => cur.map((x) => (x.id === p.id ? { ...x, progress: v } : x))));
        attachments.push({ path: ticket.path, kind: p.kind, name: ready.name, size: ready.blob.size, width: ready.width, height: ready.height });
      }
      const res = await sendMessage(clientId, { body, attachments });
      if (!res.ok) throw new Error(res.error);
      merge([res.message]);
      setText("");
      pending.forEach((p) => URL.revokeObjectURL(p.preview));
      setPending([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invio non riuscito.");
    } finally {
      setSending(false);
    }
  };

  const remove = async (m: ChatMessage) => {
    if (!window.confirm("Eliminare questo messaggio per tutti?")) return;
    const r = await deleteMessage(clientId, m.id);
    if (r.ok) merge([], [m.id]);
    setSelected(null);
  };

  return (
    <div className={cx("flex min-h-0 flex-col overflow-hidden rounded-[24px] bg-card", className)}>
      <div ref={listRef} onScroll={onScroll} className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-4 sm:px-5" aria-live="polite">
        {messages.length === 0 ? <p className="m-auto max-w-sm px-4 text-center text-[15px] text-muted">{emptyText}</p> : null}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const showDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
          const showName = showSenderNames && !m.mine && (!prev || prev.mine || prev.senderName !== m.senderName || showDay);
          return (
            <div key={m.id} className="flex flex-col">
              {showDay ? <div className="my-3 self-center rounded-full bg-sand px-3 py-1 text-xs font-semibold text-muted first-letter:uppercase">{dayLabel(m.createdAt)}</div> : null}
              {showName && m.senderName ? <div className="mt-1 mb-0.5 px-2 text-xs font-semibold text-muted">{m.senderName}</div> : null}
              <div className={cx("flex max-w-[85%] flex-col gap-1 sm:max-w-[70%]", m.mine ? "items-end self-end" : "items-start self-start")}>
                {m.attachments.length ? (
                  <div className={cx("grid gap-1", m.attachments.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                    {m.attachments.map((a) =>
                      !a.url ? (
                        <div key={a.path} className="flex h-32 w-40 items-center justify-center rounded-2xl bg-sand text-xs text-muted">Non disponibile</div>
                      ) : a.kind === "image" ? (
                        <button key={a.path} type="button" onClick={() => setViewer(a.url)} className="overflow-hidden rounded-2xl bg-sand">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={a.url} alt="Foto allegata" loading="lazy" className="max-h-72 w-full max-w-[280px] object-cover" style={a.width && a.height ? { aspectRatio: `${a.width} / ${a.height}` } : undefined} />
                        </button>
                      ) : (
                        <video key={a.path} src={a.url} controls playsInline preload="metadata" className="max-h-80 w-full max-w-[300px] rounded-2xl bg-ink" />
                      ),
                    )}
                  </div>
                ) : null}
                {m.deleted ? (
                  <div className="rounded-2xl border border-dashed border-sand-deep px-3.5 py-2 text-sm text-muted italic">Messaggio eliminato</div>
                ) : m.body ? (
                  <button
                    type="button"
                    onClick={() => m.mine && setSelected(selected === m.id ? null : m.id)}
                    className={cx(
                      "rounded-[20px] px-3.5 py-2 text-left text-[15px] leading-snug whitespace-pre-wrap break-words",
                      m.mine ? "rounded-br-md bg-ink text-card" : "rounded-bl-md bg-sand text-ink",
                      !m.mine && "cursor-text",
                    )}
                  >
                    {m.body}
                  </button>
                ) : null}
                <div className="flex items-center gap-3 px-1 text-[11px] text-muted">
                  <span>{timeOf(m.createdAt)}</span>
                  {m.mine && !m.deleted && (selected === m.id || !m.body) ? (
                    <button type="button" onClick={() => void remove(m)} className="font-semibold text-accent-deep">Elimina</button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* composizione */}
      <div className="border-t border-sand-deep bg-card px-3 py-3 sm:px-4">
        {error ? <p role="alert" className="mb-2 rounded-xl bg-accent-soft px-3 py-2 text-sm">{error}</p> : null}
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
                {sending ? (
                  <div className="absolute inset-x-1 bottom-1 h-1.5 rounded-full bg-white/60"><div className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.round(p.progress * 100)}%` }} /></div>
                ) : (
                  <button type="button" aria-label="Togli allegato" onClick={() => removePending(p.id)} className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink/80 text-card"><IconX size={14} /></button>
                )}
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="sr-only" aria-label="Allega foto o video" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          <button type="button" aria-label="Allega foto o video" disabled={sending || pending.length >= MAX_ATTACHMENTS} onClick={() => fileRef.current?.click()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sand text-ink disabled:opacity-40">
            <IconPaperclip size={20} />
          </button>
          <label htmlFor={`chat-${clientId}`} className="sr-only">Messaggio</label>
          <textarea
            id={`chat-${clientId}`}
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
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
            className="max-h-40 min-h-11 flex-1 resize-none rounded-[22px] border border-sand-deep bg-sand px-4 py-2.5 text-[16px] leading-snug focus:border-ink focus:outline-none"
          />
          <button type="button" aria-label="Invia" onClick={() => void send()} disabled={sending || (!text.trim() && pending.length === 0)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white disabled:opacity-40">
            {sending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <IconSend size={19} />}
          </button>
        </div>
      </div>

      {viewer ? (
        <div role="dialog" aria-label="Foto" className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/90 p-4" onClick={() => setViewer(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewer} alt="Foto allegata" className="max-h-full max-w-full rounded-xl object-contain" />
          <button type="button" aria-label="Chiudi" className="absolute top-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-card text-ink"><IconX /></button>
        </div>
      ) : null}
    </div>
  );
}
