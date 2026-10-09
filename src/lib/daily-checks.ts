import "server-only";
/**
 * Controlli automatici giornalieri (chiamati da /api/cron/daily).
 */
import { createAdminClient } from "./supabase/admin";
import { notify, type NewNotification } from "./notify";
import { deliverPendingEmails } from "./email";
import { addDays, diffDays, formatLong, isoWeekday, todayISO } from "./dates";
import { billingStatus, type PlanKind } from "./billing";
import { checkinWeekFor } from "./checkin";
import { programEndDate } from "./program/schedule";

export async function runDailyChecks(today = todayISO()) {
  const admin = createAdminClient();
  const out: NewNotification[] = [];
  const [{ data: owners }, { data: clients }, { data: settings }] = await Promise.all([
    admin.from("profiles").select("id").eq("role", "owner"),
    admin.from("clients").select("id, first_name, last_name, coach_id, user_id, weekly_checkin, status").eq("status", "active"),
    admin.from("app_settings").select("reminder_days").maybeSingle(),
  ]);
  const ownerIds = (owners ?? []).map((o) => o.id);
  const byId = new Map((clients ?? []).map((c) => [c.id, c]));
  const name = (c: { first_name: string; last_name: string }) => `${c.first_name} ${c.last_name}`.trim();
  const reminderDays = settings?.reminder_days ?? 7;

  // 1) Pagamenti
  const { data: billing } = await admin.rpc("billing_overview");
  for (const b of billing ?? []) {
    const c = byId.get(b.client_id);
    if (!c) continue;
    const st = billingStatus({ ...b, kind: b.kind as PlanKind }, today, reminderDays);
    if (st.state !== "due_soon" && st.state !== "overdue") continue;
    const key = st.dueDate ? `${st.dueDate}` : `s${b.sessions_bought}`;
    for (const o of ownerIds) {
      out.push({ recipient_id: o, client_id: c.id, kind: "payment_due", title: `Pagamento: ${name(c)}`, body: st.label, link: `/staff/clienti/${c.id}/pagamenti`, dedupe_key: `pay:${c.id}:${key}:${st.state}` });
    }
    if (c.user_id) {
      const body = st.sessionsLeft !== null
        ? st.sessionsLeft <= 0 ? "Il tuo pacchetto di sessioni è terminato: quando vuoi rinnova con il tuo coach." : `Ti restano ${st.sessionsLeft} sessioni nel pacchetto.`
        : st.state === "overdue" ? "Il periodo saldato è terminato: quando vuoi rinnova con il tuo coach." : `Il periodo saldato termina il ${formatLong(st.dueDate!)}.`;
      out.push({ recipient_id: c.user_id, client_id: c.id, kind: "payment_reminder", title: "Promemoria rinnovo", body, link: "/cliente/profilo", dedupe_key: `payclient:${c.id}:${key}:${st.state}` });
    }
  }

  // 2) Programmi in chiusura
  const { data: programs } = await admin.from("programs").select("id, client_id, title, weeks, start_date").eq("status", "published").not("client_id", "is", null);
  const nextByClient = new Map<string, boolean>();
  for (const p of programs ?? []) if (p.start_date && p.start_date > today && p.client_id) nextByClient.set(p.client_id, true);
  const { data: drafts } = await admin.from("programs").select("client_id").eq("status", "draft").not("client_id", "is", null);
  for (const d of drafts ?? []) if (d.client_id) nextByClient.set(d.client_id, true);
  for (const p of programs ?? []) {
    if (!p.start_date || !p.client_id || p.start_date > today) continue;
    const c = byId.get(p.client_id);
    if (!c) continue;
    const end = programEndDate(p.start_date, p.weeks);
    const left = diffDays(today, end);
    if (left > 7 || left < -14 || nextByClient.get(c.id)) continue;
    const recipients = new Set(ownerIds);
    if (c.coach_id) recipients.add(c.coach_id);
    for (const r of recipients) {
      out.push({
        recipient_id: r,
        client_id: c.id,
        kind: "program_ending",
        title: `Prossima fase da preparare: ${name(c)}`,
        body: left >= 0 ? `“${p.title}” finisce ${left === 0 ? "oggi" : `tra ${left} giorni`}.` : `“${p.title}” è finito da ${-left} giorni.`,
        link: `/staff/clienti/${c.id}/programma`,
        dedupe_key: `progend:${p.id}:${left >= 0 ? "soon" : "late"}`,
      });
    }
  }

  // 3) Check-up settimanale (venerdì apertura, domenica ultimo promemoria)
  const week = checkinWeekFor(today);
  const dow = isoWeekday(today);
  if (week && (dow === 5 || dow === 7)) {
    const { data: done } = await admin.from("checkins").select("client_id").eq("week_start", week);
    const doneSet = new Set((done ?? []).map((d) => d.client_id));
    for (const c of clients ?? []) {
      if (!c.weekly_checkin || !c.user_id || doneSet.has(c.id)) continue;
      out.push({
        recipient_id: c.user_id,
        client_id: c.id,
        kind: "checkin_reminder",
        title: dow === 5 ? "Il check-up della settimana è aperto" : "Ultimo giorno per il check-up",
        body: "Quattro domande, tre minuti.",
        link: "/cliente/checkup",
        dedupe_key: `checkin:${c.id}:${week}:${dow}`,
      });
    }
  }

  await notify(out);
  const emailed = await deliverPendingEmails();
  // pulizia: notifiche lette più vecchie di 6 mesi
  await admin.from("notifications").delete().lt("created_at", `${addDays(today, -180)}T00:00:00Z`).not("read_at", "is", null);
  return { ok: true, today, notifications: out.length, emailed };
}
