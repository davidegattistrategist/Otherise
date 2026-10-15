import "server-only";
import { pushLater } from "./notify";
import { createAdminClient } from "./supabase/admin";
import { siteUrl } from "./site";
import { bundleEmail } from "./email-bundle";

/**
 * Email transazionali (avvisi, promemoria) con Resend: https://resend.com
 * Servono RESEND_API_KEY ed EMAIL_FROM (es. "Otherise <avvisi@tuodominio.it>").
 * Senza chiave le email non partono e restano solo le notifiche in app.
 * Le email di accesso (inviti, nuova password) le manda invece Supabase.
 */
export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return false;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#1b1a17;max-width:520px">${text
    .split("\n")
    .map((l) => (l.startsWith("http") ? `<p><a href="${l}" style="color:#1b1a17;font-weight:600">${l}</a></p>` : `<p>${escapeHtml(l)}</p>`))
    .join("")}</div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text, html }),
  });
  return res.ok;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Il titolare sceglie in Impostazioni chi può ricevere gli avvisi per email:
 * lo staff (di serie no: vede tutto nell'app) e i clienti (di serie sì).
 */
export async function emailPrefs(): Promise<{ staff: boolean; clients: boolean }> {
  const { data } = await createAdminClient().from("app_settings").select("staff_emails, client_emails").maybeSingle();
  // se le colonne non ci sono ancora (file SQL non eseguito): niente email allo staff
  return { staff: data?.staff_emails ?? false, clients: data?.client_emails ?? true };
}

/** Al massimo un'email ogni tanto per persona: le novità arrivate nel frattempo vanno nella stessa. */
export const EMAIL_EVERY_HOURS = 20;
/** Chi ha le notifiche sul telefono riceve un'email solo per queste, se dopo questi giorni non le ha ancora viste. */
export const PUSH_REMINDER_KINDS = ["chat", "program_published"];
export const PUSH_REMINDER_DAYS = 3;

/**
 * Email il meno possibile. Le notifiche restano sempre nell'app (e sul
 * telefono con le notifiche push).
 * - Chi NON ha le notifiche sul telefono: le novità non ancora lette, al
 *   massimo un'email ogni EMAIL_EVERY_HOURS ore con tutto insieme, e ogni
 *   email consiglia di attivare le notifiche.
 * - Chi HA le notifiche sul telefono: solo un messaggio in chat o il
 *   programma nuovo ancora non visti dopo PUSH_REMINDER_DAYS giorni.
 * - Solo a chi le può ricevere (Impostazioni → Avvisi per email).
 * Le notifiche che non serviranno mai per email si segnano come gestite;
 * quelle che potrebbero servire più avanti restano in attesa.
 */
/**
 * Le email partono dopo la risposta (chi ha premuto il pulsante non aspetta
 * Resend). Fuori da una richiesta (script, test) partono subito.
 */
export async function emailsLater() {
  await pushLater(() => deliverPendingEmails());
}

export async function deliverPendingEmails(): Promise<number> {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return 0;
  const admin = createAdminClient();
  const prefs = await emailPrefs();
  const since = new Date(Date.now() - (PUSH_REMINDER_DAYS + 4) * 24 * 3600 * 1000).toISOString();
  const { data: pending } = await admin
    .from("notifications")
    .select("id, recipient_id, kind, title, body, link, read_at, created_at")
    .is("emailed_at", null)
    .gte("created_at", since)
    .order("created_at")
    .limit(500);
  if (!pending?.length) return 0;
  const ids = [...new Set(pending.map((n) => n.recipient_id))];
  const [{ data: profiles }, { data: subs }] = await Promise.all([
    admin.from("profiles").select("id, email, role, last_email_at").in("id", ids),
    admin.from("push_subscriptions").select("user_id").in("user_id", ids),
  ]);
  const withPush = new Set((subs ?? []).map((s) => s.user_id));
  const now = Date.now();
  const due = now - PUSH_REMINDER_DAYS * 24 * 3600 * 1000;
  const handled: string[] = [];
  const base = await siteUrl();
  let sent = 0;
  for (const p of profiles ?? []) {
    const mine = pending.filter((n) => n.recipient_id === p.id);
    const allowed = p.role === "owner" || p.role === "coach" ? prefs.staff : prefs.clients;
    if (!allowed || !p.email) {
      handled.push(...mine.map((n) => n.id));
      continue;
    }
    // già viste nell'app: niente email
    handled.push(...mine.filter((n) => n.read_at).map((n) => n.id));
    let send = mine.filter((n) => !n.read_at);
    const push = withPush.has(p.id);
    if (push) {
      // con le notifiche sul telefono: solo chat e programma, e solo se dopo qualche giorno non li ha visti
      handled.push(...send.filter((n) => !PUSH_REMINDER_KINDS.includes(n.kind)).map((n) => n.id));
      send = send.filter((n) => PUSH_REMINDER_KINDS.includes(n.kind) && new Date(n.created_at).getTime() <= due);
    }
    if (!send.length) continue;
    // ha già ricevuto un'email da poco: queste aspettano la prossima (o vengono lette nell'app)
    if (p.last_email_at && now - new Date(p.last_email_at).getTime() < EMAIL_EVERY_HOURS * 3600 * 1000) continue;
    const { subject, text } = bundleEmail(send, base, push ? "reminder" : "no-push");
    const ok = await sendEmail(p.email, subject, text);
    if (ok) {
      sent++;
      handled.push(...send.map((n) => n.id));
      await admin.from("profiles").update({ last_email_at: new Date().toISOString() }).eq("id", p.id);
    }
  }
  // destinatari senza profilo: niente da mandare
  const known = new Set((profiles ?? []).map((p) => p.id));
  handled.push(...pending.filter((n) => !known.has(n.recipient_id)).map((n) => n.id));
  for (let i = 0; i < handled.length; i += 100) {
    await admin.from("notifications").update({ emailed_at: new Date().toISOString() }).in("id", handled.slice(i, i + 100));
  }
  return sent;
}
