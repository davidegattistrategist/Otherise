import "server-only";
/**
 * Notifiche push (Web Push): arrivano sul telefono anche ad app chiusa.
 *
 * Le chiavi VAPID (che identificano l'app presso i servizi push di Apple,
 * Google e Mozilla) si creano da sole al primo uso e restano nella tabella
 * app_secrets: chi installa non deve fare niente. Se si preferisce, si
 * possono impostare a mano con VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY.
 *
 * Il contenuto viaggia cifrato: i servizi push non possono leggerlo.
 */
import webpush from "web-push";
import { createAdminClient } from "./supabase/admin";
import { pushPayload, type PushPayload } from "./push-shared";

type Keys = { publicKey: string; privateKey: string };
let cached: Keys | null = null;

/** Chiavi VAPID: dalle variabili d'ambiente, dal database o create ora. */
export async function vapidKeys(): Promise<Keys | null> {
  if (cached) return cached;
  const envPub = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPriv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (envPub && envPriv) return (cached = { publicKey: envPub, privateKey: envPriv });
  try {
    const admin = createAdminClient();
    const read = async () => {
      const { data } = await admin.from("app_secrets").select("value").eq("name", "vapid").maybeSingle();
      return data?.value ? (JSON.parse(data.value) as Keys) : null;
    };
    let keys = await read();
    if (!keys) {
      // se due richieste arrivano insieme vince la prima: l'altra rilegge
      await admin.from("app_secrets").upsert({ name: "vapid", value: JSON.stringify(webpush.generateVAPIDKeys()) }, { onConflict: "name", ignoreDuplicates: true });
      keys = await read();
    }
    if (keys?.publicKey && keys.privateKey) cached = keys;
    return cached;
  } catch {
    return null;
  }
}

/** Chiave pubblica da dare al browser per attivare le notifiche. */
export async function vapidPublicKey() {
  return (await vapidKeys())?.publicKey ?? null;
}

function subject() {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return site && site.startsWith("https://") ? site : "mailto:avvisi@example.com";
}

/**
 * Manda una notifica push a tutti i dispositivi di queste persone.
 * Non lancia mai errori: se qualcosa va storto la notifica in app resta.
 */
export async function sendPush(userIds: string[], payload: PushPayload): Promise<number> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return 0;
  try {
    const keys = await vapidKeys();
    if (!keys) return 0;
    const admin = createAdminClient();
    const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("user_id", ids);
    if (!subs?.length) return 0;
    const body = JSON.stringify(pushPayload(payload));
    const options = { vapidDetails: { subject: subject(), publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 60 * 60 * 24, urgency: "high" as const, timeout: 8000 };
    const results = await Promise.allSettled(
      subs.map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, options)),
    );
    const gone: string[] = [];
    const used: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") used.push(subs[i].id);
      else {
        const code = (r.reason as { statusCode?: number })?.statusCode;
        // 404/410: il dispositivo ha tolto il permesso o l'iscrizione è scaduta
        if (code === 404 || code === 410) gone.push(subs[i].id);
      }
    });
    await Promise.all([
      gone.length ? admin.from("push_subscriptions").delete().in("id", gone) : null,
      used.length ? admin.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).in("id", used) : null,
    ]);
    return used.length;
  } catch {
    return 0;
  }
}
