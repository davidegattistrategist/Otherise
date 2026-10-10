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
  for (const n of items) {
    const row = { ...n, body: n.body ?? "" };
    const { data } = n.dedupe_key
      ? await admin.from("notifications").upsert(row, { onConflict: "recipient_id,dedupe_key", ignoreDuplicates: true }).select("id")
      : await admin.from("notifications").insert(row).select("id");
    if (data?.length) created.push(n);
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
