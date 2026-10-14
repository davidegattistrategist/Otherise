import "server-only";
import { after } from "next/server";
import { createAdminClient } from "./supabase/admin";
import { sendPush } from "./push";

export type NewNotification = {
  recipient_id: string;
  client_id?: string | null;
  kind: string;
  title: string;
  body?: string;
  link?: string | null;
  dedupe_key?: string | null;
};

/**
 * Crea notifiche in app (le notifiche doppie con la stessa dedupe_key vengono
 * ignorate) e, per quelle nuove, manda anche la notifica push sui dispositivi
 * dove è attiva. Con push: false solo in app (la chat manda le sue push a parte).
 */
export async function notify(items: NewNotification[], opts: { push?: boolean } = {}) {
  if (items.length === 0) return;
  const admin = createAdminClient();
  const created: NewNotification[] = [];
  // tutte insieme (a blocchi), non una alla volta: al mattino possono essere decine
  const full = (n: NewNotification) => ({ recipient_id: n.recipient_id, client_id: n.client_id ?? null, kind: n.kind, title: n.title, body: n.body ?? "", link: n.link ?? null, dedupe_key: n.dedupe_key ?? null });
  const keyed = items.filter((n) => n.dedupe_key);
  const plain = items.filter((n) => !n.dedupe_key);
  for (let i = 0; i < keyed.length; i += 200) {
    const chunk = keyed.slice(i, i + 200);
    // le notifiche già mandate (stessa chiave) vengono saltate: tornano solo quelle nuove
    const { data } = await admin.from("notifications").upsert(chunk.map(full), { onConflict: "recipient_id,dedupe_key", ignoreDuplicates: true }).select("recipient_id, dedupe_key");
    const fresh = new Set((data ?? []).map((r) => `${r.recipient_id}|${r.dedupe_key}`));
    created.push(...chunk.filter((n) => fresh.has(`${n.recipient_id}|${n.dedupe_key}`)));
  }
  for (let i = 0; i < plain.length; i += 200) {
    const chunk = plain.slice(i, i + 200);
    const { error } = await admin.from("notifications").insert(chunk.map(full));
    if (!error) created.push(...chunk);
  }
  if (opts.push === false || created.length === 0) return;
  await pushLater(() =>
    Promise.all(created.map((n) => sendPush([n.recipient_id], { title: n.title, body: n.body, url: n.link, tag: n.kind === "chat" && n.client_id ? `chat:${n.client_id}` : null }))),
  );
}

/** Le push partono dopo la risposta, così chi preme il pulsante non aspetta. */
export async function pushLater(job: () => Promise<unknown>) {
  try {
    after(() => job().catch(() => undefined));
  } catch {
    // fuori da una richiesta (script, test): si manda subito
    await job().catch(() => undefined);
  }
}

export async function staffRecipients(clientId: string): Promise<string[]> {
  const admin = createAdminClient();
  const [{ data: owners }, { data: client }] = await Promise.all([
    admin.from("profiles").select("id").eq("role", "owner"),
    admin.from("clients").select("coach_id").eq("id", clientId).maybeSingle(),
  ]);
  const ids = new Set((owners ?? []).map((o) => o.id));
  if (client?.coach_id) ids.add(client.coach_id);
  return [...ids];
}
