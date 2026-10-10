"use client";

/**
 * Registra il service worker (serve per le notifiche push) e tiene da parte
 * la richiesta di installazione di Android, che il browser manda una volta
 * sola all'apertura: la usa la guida "Metti l'app sulla Home".
 */
import { useEffect } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
declare global {
  interface Window {
    __otheriseInstall?: InstallEvent | null;
  }
}

export const INSTALL_READY = "otherise:install-ready";

export function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      window.__otheriseInstall = e as InstallEvent;
      window.dispatchEvent(new Event(INSTALL_READY));
    };
    const onInstalled = () => {
      window.__otheriseInstall = null;
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}
