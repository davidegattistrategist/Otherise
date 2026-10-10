"use server";

import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseSubscription } from "@/lib/push-shared";
import { sendPush, vapidPublicKey } from "@/lib/push";

/** Salva il dispositivo su cui la persona collegata ha attivato le notifiche. */
export async function savePushSubscription(raw: unknown, userAgent: string): Promise<{ ok: boolean }> {
  const me = await requireUser();
  const sub = parseSubscription(raw);
  if (!sub) return { ok: false };
  const { error } = await createAdminClient()
    .from("push_subscriptions")
    .upsert({ user_id: me.id, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, user_agent: String(userAgent).slice(0, 300) }, { onConflict: "endpoint" });
  return { ok: !error };
}

/** Toglie questo dispositivo (notifiche disattivate). */
export async function removePushSubscription(endpoint: string): Promise<{ ok: boolean }> {
  const me = await requireUser();
  if (typeof endpoint !== "string" || !endpoint) return { ok: false };
  const { error } = await createAdminClient().from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", me.id);
  return { ok: !error };
}

/** Notifica di prova sul proprio dispositivo. */
export async function sendTestPush(): Promise<{ ok: boolean }> {
  const me = await requireUser();
  const sent = await sendPush([me.id], { title: "Notifiche attive", body: "Da ora gli avvisi arrivano anche qui, ad app chiusa.", url: me.role === "client" ? "/cliente" : "/staff", tag: "test" });
  return { ok: sent > 0 };
}

/** Chiave pubblica per attivare le notifiche nel browser. */
export async function getPushKey(): Promise<string | null> {
  await requireUser();
  return vapidPublicKey();
}
