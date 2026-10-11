import "server-only";
/**
 * Controlli automatici giornalieri (chiamati da /api/cron/daily).
 */
import { createAdminClient } from "./supabase/admin";
import { notify, type NewNotification } from "./notify";
import { deliverPendingEmails, sendEmail } from "./email";
import { addDays, ageOn, diffDays, formatHeading, formatLong, isBirthday, isoWeekday, mondayOf, todayISO } from "./dates";
import { siteUrl } from "./site";
import { billingStatus, clientFacingStatus, type PlanKind } from "./billing";
import { checkinWeekFor } from "./checkin";
import { programEndDate } from "./program/schedule";

export async function runDailyChecks(today = todayISO()) {
  const admin = createAdminClient();
  const out: NewNotification[] = [];
  const [{ data: owners }, { data: clients }, { data: settings }] = await Promise.all([
    admin.from("profiles").select("id").eq("role", "owner"),
    admin.from("clients").select("id, first_name, last_name, coach_id, user_id, weekly_checkin, status, birth_date").eq("status", "active"),
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
    // al cliente scriviamo solo per scadenze vicine: un ritardo lungo lo gestisce il coach di persona
    if (c.user_id && clientFacingStatus(st)) {
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

  // 4) Clienti che non registrano allenamenti da 7+ giorni con un programma in corso (avviso settimanale)
  const { data: lastLogs } = await admin.from("workout_logs").select("client_id, performed_on").order("performed_on", { ascending: false }).limit(3000);
  const lastBy = new Map<string, string>();
  for (const l of lastLogs ?? []) if (!lastBy.has(l.client_id)) lastBy.set(l.client_id, l.performed_on);
  for (const p of programs ?? []) {
    if (!p.start_date || !p.client_id || p.start_date > addDays(today, -7)) continue;
    const c = byId.get(p.client_id);
    if (!c || !c.user_id) continue;
    if (diffDays(today, programEndDate(p.start_date, p.weeks)) < 0) continue;
    const last = lastBy.get(c.id);
    const since = last ? diffDays(last, today) : null;
    if (since !== null && since < 7) continue;
    const recipients = new Set(ownerIds);
    if (c.coach_id) recipients.add(c.coach_id);
    for (const r of recipients) {
      out.push({
        recipient_id: r,
        client_id: c.id,
        kind: "inactive",
        title: `Da sentire: ${name(c)}`,
        body: since === null ? "Non ha ancora registrato allenamenti sul programma in corso." : `Nessun allenamento registrato da ${since} giorni.`,
        link: `/staff/clienti/${c.id}`,
        dedupe_key: `inactive:${c.id}:${mondayOf(today)}`,
      });
    }
  }

  // 5) Compleanni: avviso allo staff per fare gli auguri
  for (const c of clients ?? []) {
    if (!isBirthday(c.birth_date, today)) continue;
    const recipients = new Set(ownerIds);
    if (c.coach_id) recipients.add(c.coach_id);
    for (const r of recipients) {
      out.push({
        recipient_id: r,
        client_id: c.id,
        kind: "birthday",
        title: `Compleanno: ${name(c)}`,
        body: `Oggi compie ${ageOn(c.birth_date, today)} anni: fagli gli auguri!`,
        link: `/staff/messaggi/${c.id}?promemoria=compleanno`,
        dedupe_key: `bday:${c.id}:${today.slice(0, 4)}`,
      });
    }
  }

  // 6) Clienti che non senti in chat da più di 10 giorni (solo dopo che la chat è iniziata):
  //    un promemoria per chiedere come va; si può scrivere o ignorare (segnandola come letta)
  const { data: msgs } = await admin.from("messages").select("client_id, created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(5000);
  const lastMsg = new Map<string, string>();
  for (const m of msgs ?? []) if (!lastMsg.has(m.client_id)) lastMsg.set(m.client_id, m.created_at);
  for (const c of clients ?? []) {
    const at = lastMsg.get(c.id);
    if (!at || !c.user_id) continue;
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
    const since = diffDays(day, today);
    if (since <= 10) continue;
    const recipients = new Set(ownerIds);
    if (c.coach_id) recipients.add(c.coach_id);
    for (const r of recipients) {
      out.push({
        recipient_id: r,
        client_id: c.id,
        kind: "chat_silence",
        title: `Non senti ${name(c)} da ${since} giorni`,
        body: `Ultimo messaggio in chat il ${formatLong(day)}. Scrivigli per chiedere come sta andando, oppure segna la notifica come letta per ignorarla.`,
        link: `/staff/messaggi/${c.id}?promemoria=saluto`,
        // una sola volta per ogni silenzio: se vi scrivete, il conteggio riparte
        dedupe_key: `silence:${c.id}:${day}`,
      });
    }
  }

  // 7) Privacy: ex clienti da più di 5 anni (come scritto nell'informativa per i dati sulla salute)
  const { data: oldArchived } = await admin
    .from("clients")
    .select("id, first_name, last_name")
    .eq("status", "archived")
    .lt("archived_at", `${addDays(today, -1826)}T00:00:00Z`);
  for (const c of oldArchived ?? []) {
    for (const o of ownerIds) {
      out.push({
        recipient_id: o,
        client_id: c.id,
        kind: "privacy_retention",
        title: `Privacy: ${name(c)} ha finito il percorso da 5 anni`,
        body: "L'informativa prevede di cancellare i dati sulla salute 5 anni dopo la fine del percorso. Se non ti servono più, eliminalo dalla sua scheda (i dati fiscali restano nei tuoi documenti contabili).",
        link: `/staff/clienti/${c.id}/profilo`,
        dedupe_key: `retention:${c.id}`,
      });
    }
  }

  await notify(out);
  const digests = await sendStaffDigests(today);
  const emailed = (await deliverPendingEmails()) + digests;
  // pulizia: notifiche lette più vecchie di 6 mesi
  await admin.from("notifications").delete().lt("created_at", `${addDays(today, -180)}T00:00:00Z`).not("read_at", "is", null);
  return { ok: true, today, notifications: out.length, emailed };
}

/**
 * Un'unica email al mattino per ogni membro dello staff con tutto quello che
 * è emerso (pagamenti, programmi, clienti da sentire), invece di tante email.
 * Check-up con problemi e messaggi in chat partono invece subito, a parte.
 */
async function sendStaffDigests(today: string): Promise<number> {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return 0;
  const admin = createAdminClient();
  const since = new Date(Date.now() - 26 * 3600 * 1000).toISOString();
  const { data: staff } = await admin.from("profiles").select("id, email, full_name").in("role", ["owner", "coach"]);
  const base = await siteUrl();
  let sent = 0;
  for (const s of staff ?? []) {
    const { data: items } = await admin
      .from("notifications")
      .select("id, kind, title, body")
      .eq("recipient_id", s.id)
      .is("emailed_at", null)
      .in("kind", ["birthday", "payment_due", "program_ending", "inactive", "chat_silence"])
      .gte("created_at", since)
      .order("kind");
    if (!items?.length) continue;
    const groups: Array<[string, string]> = [["birthday", "Compleanni"], ["payment_due", "Pagamenti"], ["program_ending", "Programmi da preparare"], ["inactive", "Clienti da sentire"], ["chat_silence", "Da sentire in chat"]];
    const lines: string[] = [`Ciao ${s.full_name.split(" ")[0] || ""}, ecco il riepilogo di ${formatHeading(today).toLowerCase()}.`, ""];
    for (const [kind, label] of groups) {
      const g = items.filter((i) => i.kind === kind);
      if (!g.length) continue;
      lines.push(`${label}:`);
      for (const i of g) lines.push(`• ${i.title.replace(/^[^:]+: /, "")} — ${i.body}`);
      lines.push("");
    }
    lines.push(`${base}/staff`);
    const ok = await sendEmail(s.email, `Il riepilogo di oggi (${items.length})`, lines.join("\n"));
    if (ok) {
      sent++;
      await admin.from("notifications").update({ emailed_at: new Date().toISOString() }).in("id", items.map((i) => i.id));
    }
  }
  return sent;
}
