"use client";

/**
 * Tiene lo schermo acceso finché `active` è vero (compressione e invio di un
 * video, caricamento di foto, allenamento in corso): se il telefono si spegne
 * per inattività il lavoro si ferma.
 *
 * - Blocco dello schermo del browser (Wake Lock), richiesto di nuovo quando
 *   l'app torna in primo piano (il telefono lo toglie da solo).
 * - Su iPhone/iPad in più un piccolo video muto in loop, invisibile: nelle app
 *   messe sulla Home il blocco del browser non sempre funziona, il video sì
 *   (lo stesso trucco della libreria NoSleep).
 */
import { useEffect } from "react";

type Lock = { release: () => Promise<void> };
type WakeNav = Navigator & { wakeLock?: { request: (t: "screen") => Promise<Lock> } };

function isApple(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function useKeepAwake(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    let stopped = false;
    let lock: Lock | null = null;
    const nav = navigator as WakeNav;
    const request = () => {
      if (document.visibilityState !== "visible" || !nav.wakeLock) return;
      nav.wakeLock
        .request("screen")
        .then((l) => {
          if (stopped) void l.release().catch(() => undefined);
          else lock = l;
        })
        .catch(() => undefined);
    };
    request();

    let video: HTMLVideoElement | null = null;
    if (isApple() || !nav.wakeLock) {
      video = document.createElement("video");
      video.muted = true;
      video.defaultMuted = true;
      video.loop = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("aria-hidden", "true");
      for (const [src, type] of [["/keep-awake.mp4", "video/mp4"], ["/keep-awake.webm", "video/webm"]]) {
        const source = document.createElement("source");
        source.src = src;
        source.type = type;
        video.append(source);
      }
      Object.assign(video.style, { position: "fixed", left: "0", bottom: "0", width: "1px", height: "1px", opacity: "0.01", pointerEvents: "none", zIndex: "-1" });
      document.body.append(video);
      void video.play().catch(() => undefined);
    }

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      request();
      void video?.play().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => undefined);
      if (video) {
        video.pause();
        video.replaceChildren();
        video.load();
        video.remove();
      }
    };
  }, [active]);
}
