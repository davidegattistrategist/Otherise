"use client";

/**
 * Fotocamera dentro l'app (modalità check): si apre a tutto schermo, fai
 * tutti gli scatti di fila e ognuno parte subito per il caricamento (ridotto
 * e ricompresso come le foto scelte dalla galleria). "Fatto" chiude.
 * Se il telefono non dà la fotocamera all'app si usa quella del telefono.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useKeepAwake } from "./use-keep-awake";
import { IconFlip } from "./icons";
import { cx } from "./ui";

const GRID_KEY = "otherise:camera-grid";

type Facing = "environment" | "user";

function readGrid() {
  try {
    return localStorage.getItem(GRID_KEY) !== "off";
  } catch {
    return true;
  }
}

/** Scatto dal video: la foto è esattamente quello che vedi (poi si riduce a 1600 px). */
async function grab(video: HTMLVideoElement): Promise<File | null> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(video, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
  if (!blob) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return new File([blob], `scatto-${stamp}.jpg`, { type: "image/jpeg" });
}

export function CheckCamera({
  onShot,
  onClose,
  onUnavailable,
  status,
}: {
  onShot: (file: File) => void;
  onClose: () => void;
  /** l'app non può usare la fotocamera: si apre quella del telefono */
  onUnavailable: () => void;
  /** "2 di 5 caricate" o simile, sotto la barra */
  status: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [shots, setShots] = useState(0);
  const [last, setLast] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [grid, setGrid] = useState(readGrid);
  const [cameras, setCameras] = useState(1);
  useKeepAwake(true);

  // la pagina sotto resta ferma
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const stop = () => {
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
    (async () => {
      setReady(false);
      setError("");
      if (!navigator.mediaDevices?.getUserMedia) {
        onUnavailable();
        return;
      }
      try {
        stop();
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facing }, width: { ideal: 4096 }, height: { ideal: 4096 } },
        });
        if (!alive) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        const v = video.current;
        if (v) {
          v.srcObject = s;
          await v.play().catch(() => undefined);
        }
        setReady(true);
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (alive) setCameras(devices.filter((d) => d.kind === "videoinput").length || 1);
      } catch (e) {
        if (!alive) return;
        const name = e instanceof DOMException ? e.name : "";
        setError(
          name === "NotAllowedError" || name === "SecurityError"
            ? "L'app non ha il permesso di usare la fotocamera. Puoi darglielo nelle impostazioni del telefono, oppure usare la fotocamera del telefono qui sotto."
            : "Non riesco ad aprire la fotocamera. Usa la fotocamera del telefono qui sotto.",
        );
      }
    })();
    return () => {
      alive = false;
      stop();
    };
  }, [facing, onUnavailable]);

  useEffect(() => () => {
    if (last) URL.revokeObjectURL(last);
  }, [last]);

  const shoot = useCallback(async () => {
    const v = video.current;
    if (!v || busy) return;
    setBusy(true);
    setFlash(true);
    setTimeout(() => setFlash(false), 140);
    try {
      const file = await grab(v);
      if (!file) return;
      try {
        navigator.vibrate?.(30);
      } catch {
        /* niente */
      }
      setShots((n) => n + 1);
      setLast(URL.createObjectURL(file));
      onShot(file);
    } finally {
      setBusy(false);
    }
  }, [busy, onShot]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.key === " " || e.key === "Enter") && ready) {
        e.preventDefault();
        void shoot();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, shoot, ready]);

  const toggleGrid = () => {
    setGrid((g) => {
      try {
        localStorage.setItem(GRID_KEY, g ? "off" : "on");
      } catch {
        /* niente */
      }
      return !g;
    });
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Fotocamera del check" className="fixed inset-0 z-[120] flex flex-col bg-black text-white" data-check-camera>
      <div className="flex items-center justify-between gap-3 px-4 pt-[max(env(safe-area-inset-top),12px)] pb-2">
        <span className="text-sm font-semibold" aria-live="polite" data-camera-count>
          {shots ? (shots === 1 ? "1 scatto" : `${shots} scatti`) : "Inquadra e scatta"}
        </span>
        <button type="button" onClick={toggleGrid} aria-pressed={grid} className="min-h-10 rounded-full bg-white/15 px-4 text-sm font-semibold">
          Griglia
        </button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={video} playsInline muted autoPlay className={cx("absolute inset-0 h-full w-full object-contain", facing === "user" && "-scale-x-100")} />
        {grid && ready ? (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute inset-y-0 left-1/3 w-px bg-white/35" />
            <div className="absolute inset-y-0 left-1/2 w-px bg-white/60" />
            <div className="absolute inset-y-0 left-2/3 w-px bg-white/35" />
            <div className="absolute inset-x-0 top-1/3 h-px bg-white/35" />
            <div className="absolute inset-x-0 top-2/3 h-px bg-white/35" />
          </div>
        ) : null}
        {flash ? <div aria-hidden="true" className="absolute inset-0 bg-white/70" /> : null}
        {!ready && !error ? <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Apro la fotocamera…</p> : null}
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center" role="alert">
            <p className="text-[15px] leading-relaxed">{error}</p>
            <button type="button" onClick={onUnavailable} className="min-h-11 rounded-full bg-white px-5 text-sm font-semibold text-black">
              Usa la fotocamera del telefono
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),16px)]">
        <p className="min-h-5 text-center text-xs text-white/75" aria-live="polite" data-camera-status>{status}</p>
        <div className="grid grid-cols-3 items-center">
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className="min-h-11 rounded-full bg-white px-5 text-sm font-semibold text-black" data-camera-done>
              Fatto
            </button>
          </div>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => void shoot()}
              disabled={!ready || busy}
              aria-label="Scatta"
              className="flex h-[74px] w-[74px] items-center justify-center rounded-full border-4 border-white disabled:opacity-40"
              data-camera-shoot
            >
              <span className="h-[58px] w-[58px] rounded-full bg-white" />
            </button>
          </div>
          <div className="flex items-center justify-end gap-3">
            {last ? (
              // eslint-disable-next-line @next/next/no-img-element -- anteprima locale dello scatto
              <img src={last} alt="Ultimo scatto" className="h-12 w-9 rounded-md object-cover ring-2 ring-white/70" />
            ) : null}
            {cameras > 1 ? (
              <button type="button" onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))} aria-label="Cambia fotocamera" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15">
                <IconFlip size={20} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

