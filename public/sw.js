/* Service worker di Otherise: apertura immediata dell'app, notifiche push e numerino sull'icona. */

/*
 * Apertura dell'app: aprendo una pagina dell'app con il browser (icona sulla
 * Home, app del computer, pagina ricaricata, notifica toccata) il service
 * worker mostra subito la pagina di avvio /apertura (logo con il glitch,
 * tenuta da parte qui), senza aspettare il server; la pagina di avvio carica
 * subito lo stesso indirizzo, che questa volta passa dalla rete (`bypass`, o
 * "app=1" nell'indirizzo). I cambi di pagina dentro l'app non passano di qui.
 * Se cambi il logo, lo stile dello splash (src/lib/splash-markup.ts) o la
 * pagina di avvio, aumenta APERTURA_VERSION: così i telefoni la riprendono.
 */
const APERTURA_VERSION = 3;
const APERTURA_CACHE = `otherise-apertura-${APERTURA_VERSION}`;
const APERTURA_URL = "/apertura";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APERTURA_CACHE)
      .then((c) => c.add(new Request(APERTURA_URL, { cache: "reload" })))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("otherise-apertura-") && k !== APERTURA_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

/* pagine che non passano dalla pagina di avvio */
const SKIP = /^\/(api|auth|_next|apertura|sw\.js|manifest)(\/|$|\.)|\.[a-z0-9]{2,5}$/i;
/* indirizzi appena mostrati con la pagina di avvio: la prossima richiesta va in rete */
const bypass = new Map();

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate" || req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || SKIP.test(url.pathname) || url.searchParams.has("app")) return;
  const key = url.href.split("#")[0];
  const now = Date.now();
  for (const [k, t] of bypass) if (now - t > 10000) bypass.delete(k);
  if (bypass.has(key)) {
    bypass.delete(key);
    return;
  }
  event.respondWith(
    (async () => {
      try {
        const cached = await caches.match(APERTURA_URL, { cacheName: APERTURA_CACHE });
        if (cached) {
          bypass.set(key, Date.now());
          return cached;
        }
      } catch {
        // niente pagina di avvio: si va dritti alla pagina
      }
      return fetch(req);
    })(),
  );
});

self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { body: event.data ? event.data.text() : "" };
  }
  const title = d.title || "Otherise";
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, {
        body: d.body || "",
        tag: d.tag || undefined,
        renotify: Boolean(d.tag),
        icon: "/icon-192.png",
        badge: "/badge-96.png",
        data: { url: d.url || "/" },
      });
      // le pagine aperte aggiornano subito campanella e messaggi
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      open.forEach((c) => c.postMessage({ type: "otherise:push" }));
      await updateBadge();
    })(),
  );
});

/* Numerino rosso sull'icona dell'app: quante chat (staff) o quanti messaggi (cliente) da leggere. */
async function updateBadge() {
  const nav = self.navigator;
  if (!nav || !nav.setAppBadge) return;
  try {
    const r = await fetch("/api/badge", { credentials: "include", cache: "no-store" });
    if (!r.ok) return;
    const { count } = await r.json();
    if (count > 0) await nav.setAppBadge(count);
    else if (nav.clearAppBadge) await nav.clearAppBadge();
  } catch {
    // senza rete o non supportato: resta il numero di prima
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of open) {
        if (new URL(c.url).origin !== self.location.origin) continue;
        await c.focus();
        if ("navigate" in c) await c.navigate(url).catch(() => undefined);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
