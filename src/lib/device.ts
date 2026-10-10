/** Riconoscimento del dispositivo nel browser (solo lato client). */

export type Platform = "ios" | "android" | "other";

export function platform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

/** Aperta dall'icona sulla schermata Home (come un'app)? */
export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export type PushSupport = "ok" | "needs-install" | "unsupported";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  const has = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  // su iPhone le notifiche esistono solo per l'app aggiunta alla schermata Home
  if (platform() === "ios" && !isInstalled()) return "needs-install";
  return has ? "ok" : "unsupported";
}

// salvataggi di comodità sul dispositivo (possono mancare: navigazione privata)
export function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function writeLocal(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // niente: al massimo l'avviso ricompare
  }
}
