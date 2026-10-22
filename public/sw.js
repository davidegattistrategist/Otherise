/* Service worker di Otherise: riceve le notifiche push, le mostra e aggiorna il numerino sull'icona. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

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
