import "server-only";
import { createAdminClient } from "./supabase/admin";

export type NewNotification = {
  recipient_id: string;
  client_id?: string | null;
  kind: string;
  title: string;
  body?: string;
  link?: string | null;
  dedupe_key?: string | null;
};

/** Crea notifiche in app (le notifiche doppie con la stessa dedupe_key vengono ignorate). */
export async function notify(items: NewNotification[]) {
  if (items.length === 0) return;
  const admin = createAdminClient();
  for (const n of items) {
    const row = { ...n, body: n.body ?? "" };
    if (n.dedupe_key) await admin.from("notifications").upsert(row, { onConflict: "recipient_id,dedupe_key", ignoreDuplicates: true });
    else await admin.from("notifications").insert(row);
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
