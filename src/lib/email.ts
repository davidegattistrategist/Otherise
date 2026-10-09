import "server-only";
import { createAdminClient } from "./supabase/admin";
import { siteUrl } from "./site";

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

/** Manda per email le notifiche in app non ancora inviate (ultime 48 ore). */
export async function deliverPendingEmails(): Promise<number> {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return 0;
  const admin = createAdminClient();
  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const { data: pending } = await admin
    .from("notifications")
    .select("id, recipient_id, title, body, link")
    .is("emailed_at", null)
    .gte("created_at", since)
    .limit(100);
  if (!pending?.length) return 0;
  const ids = [...new Set(pending.map((n) => n.recipient_id))];
  const { data: profiles } = await admin.from("profiles").select("id, email").in("id", ids);
  const emailOf = new Map((profiles ?? []).map((p) => [p.id, p.email]));
  const base = await siteUrl();
  let sent = 0;
  for (const n of pending) {
    const to = emailOf.get(n.recipient_id);
    if (!to) continue;
    const ok = await sendEmail(to, n.title, [n.body, n.link ? `${base}${n.link}` : ""].filter(Boolean).join("\n"));
    if (ok) {
      sent++;
      await admin.from("notifications").update({ emailed_at: new Date().toISOString() }).eq("id", n.id);
    }
  }
  return sent;
}
