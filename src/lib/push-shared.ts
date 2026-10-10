/** Contenuto di una notifica push (lo legge il service worker in public/sw.js). */
export type PushPayload = { title: string; body?: string; url?: string | null; tag?: string | null };

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Testi corti e solo link interni all'app. */
export function pushPayload(p: PushPayload) {
  const url = p.url && p.url.startsWith("/") && !p.url.startsWith("//") ? p.url : "/";
  return { title: clip(p.title.trim() || "Otherise", 80), body: clip((p.body ?? "").trim(), 180), url, tag: p.tag ?? undefined };
}

/** Iscrizione inviata dal browser (PushSubscription.toJSON()). */
export function parseSubscription(raw: unknown): { endpoint: string; p256dh: string; auth: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof r.endpoint !== "string" || !/^https:\/\/[^\s]{8,2000}$/.test(r.endpoint)) return null;
  const p256dh = r.keys?.p256dh;
  const auth = r.keys?.auth;
  if (typeof p256dh !== "string" || typeof auth !== "string" || !/^[\w-]{20,200}={0,2}$/.test(p256dh) || !/^[\w-]{8,100}={0,2}$/.test(auth)) return null;
  return { endpoint: r.endpoint, p256dh, auth };
}
