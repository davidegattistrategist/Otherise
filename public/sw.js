/* Service worker di Otherise: apertura immediata dell'app, notifiche push e numerino sull'icona. */

/*
 * Apertura dell'app: aprendo "/" (l'icona sulla Home, l'app sul computer, il
 * sito scritto nella barra) il service worker mostra subito la pagina di
 * avvio /apertura (logo con il glitch, tenuta da parte qui), senza aspettare
 * il server; la pagina carica poi "/?app=1", che passa dalla rete come sempre.
 * Se cambi il logo o lo stile dello splash (src/lib/splash-markup.ts)
 * aumenta APERTURA_VERSION: così i telefoni riprendono la pagina nuova.
 */
const APERTURA_VERSION = 1;
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

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate" || req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname !== "/" || url.searchParams.has("app")) return;
  event.respondWith(
    (async () => {
      try {
        const cached = await caches.match(APERTURA_URL, { cacheName: APERTURA_CACHE });
        if (cached) return cached;
      } catch {
        // niente pagina di avvio: si va dritti all'app
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
