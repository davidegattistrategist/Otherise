"use client";

/**
 * Messaggi vocali: registrazione dal microfono (un tocco per iniziare, uno
 * per mandare o annullare) e lettore con la trascrizione sotto, da aprire con
 * "Visualizza trascrizione".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_VOICE_SECONDS, voiceLength, type Transcript } from "@/lib/chat-shared";
import { cx } from "@/components/ui";

export type Recording = { blob: Blob; type: string; seconds: number };

/** Formato supportato dal telefono: iPhone registra in mp4, Android e computer in webm. */
function pickType(): string {
  const options = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  if (typeof MediaRecorder === "undefined") return "";
  return options.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? "";
}

export function voiceSupported() {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

export function useVoiceRecorder(onLimit: () => void, maxSeconds = MAX_VOICE_SECONDS) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const done = useRef<((r: Recording | null) => void) | null>(null);
  const limitRef = useRef(onLimit);
  useEffect(() => {
    limitRef.current = onLimit;
  });

  const cleanup = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    rec.current = null;
    setRecording(false);
  }, []);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => {
      const s = (Date.now() - started.current) / 1000;
      setSeconds(s);
      if (s >= maxSeconds) limitRef.current();
    }, 250);
    return () => clearInterval(id);
  }, [recording, maxSeconds]);

  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);

  const start = useCallback(async () => {
    const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    stream.current = media;
    const type = pickType();
    const r = type ? new MediaRecorder(media, { mimeType: type, audioBitsPerSecond: 64000 }) : new MediaRecorder(media);
    chunks.current = [];
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = () => {
      const t = (r.mimeType || type || "audio/mp4").split(";")[0];
      const blob = new Blob(chunks.current, { type: t });
      const secs = (Date.now() - started.current) / 1000;
      const cb = done.current;
      done.current = null;
      cleanup();
      cb?.(blob.size ? { blob, type: t, seconds: Math.min(secs, maxSeconds) } : null);
    };
    rec.current = r;
    started.current = Date.now();
    setSeconds(0);
    r.start(1000);
    setRecording(true);
  }, [cleanup, maxSeconds]);

  /** Ferma e restituisce la registrazione (null se annullata o vuota). */
  const stop = useCallback((keep: boolean) => {
    return new Promise<Recording | null>((resolve) => {
      const r = rec.current;
      if (!r || r.state === "inactive") {
        cleanup();
        resolve(null);
        return;
      }
      done.current = keep ? resolve : () => resolve(null);
      r.stop();
    });
  }, [cleanup]);

  return { recording, seconds, start, stop };
}

const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z" /></svg>
);
const PauseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4.5" height="16" rx="1.2" /><rect x="13.5" y="4" width="4.5" height="16" rx="1.2" /></svg>
);

/** Lettore del vocale, con la trascrizione da aprire sotto. */
export function VoicePlayer({ url, seconds, transcript, mine }: { url: string | null; seconds?: number | null; transcript?: Transcript | null; mine: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [length, setLength] = useState(seconds ?? 0);
  const [open, setOpen] = useState(false);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => undefined);
    else a.pause();
  };

  return (
    <div className={cx("flex w-[260px] max-w-full flex-col gap-1.5 rounded-[20px] px-3 py-2.5", mine ? "rounded-br-md bg-ink text-card" : "rounded-bl-md bg-sand text-ink")} data-testid="voice-message">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={!url}
          aria-label={playing ? "Metti in pausa il vocale" : "Ascolta il vocale"}
          className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-40", mine ? "bg-card text-ink" : "bg-ink text-card")}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className={cx("h-1.5 w-full rounded-full", mine ? "bg-card/25" : "bg-sand-deep")}>
            <div className={cx("h-1.5 rounded-full", mine ? "bg-card" : "bg-accent")} style={{ width: `${length ? Math.min(100, (pos / length) * 100) : 0}%` }} />
          </div>
          <span className={cx("text-[12px] tabular", mine ? "text-card/70" : "text-muted")}>{voiceLength(playing || pos ? pos : length)}</span>
        </div>
      </div>
      {url ? (
        <audio
          ref={audio}
          src={url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setPos(0);
          }}
          onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && e.currentTarget.duration > 0 && setLength(e.currentTarget.duration)}
          className="hidden"
        />
      ) : null}
      {transcript && transcript.status !== "off" ? (
        transcript.status === "done" && transcript.text ? (
          <div>
            <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={cx("flex min-h-8 items-center gap-1.5 text-[13px] font-semibold", mine ? "text-card/80" : "text-ink-soft")}>
              <span className={cx("inline-block text-[10px] transition-transform", open && "rotate-90")} aria-hidden="true">▶</span>
              {open ? "Nascondi trascrizione" : "Visualizza trascrizione"}
            </button>
            {open ? <p className="pb-0.5 text-[14px] leading-snug whitespace-pre-wrap">{transcript.text}</p> : null}
          </div>
        ) : (
          <span className={cx("text-[12px]", mine ? "text-card/70" : "text-muted")}>
            {transcript.status === "pending" ? "Trascrizione in corso…" : transcript.status === "failed" ? "Trascrizione non riuscita" : "Nessuna parola riconosciuta"}
          </span>
        )
      ) : null}
    </div>
  );
}
