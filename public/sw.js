/* Service worker di Otherise: riceve le notifiche push e le mostra. */
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
    })(),
  );
});

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
