import "server-only";
/**
 * Controlli automatici giornalieri (chiamati da /api/cron/daily).
 */
import { createAdminClient } from "./supabase/admin";
import { rpcOr } from "./data/rpc";
import { latestDate } from "./free-workout";
import { removeOrphanChatUploads } from "./storage-cleanup";
import { notify, type NewNotification } from "./notify";
import { deliverPendingEmails } from "./email";
import { addDays, ageOn, diffDays, formatLong, isBirthday, isoWeekday, todayISO } from "./dates";
import { billingStatus, clientFacingStatus, withUnpaidRows, type PlanKind, type UnpaidRow } from "./billing";
import { clientPaymentText, paymentEvent, staffPaymentText } from "./payment-alerts";
import { checkinWeekFor } from "./checkin";
import { programEndDate } from "./program/schedule";
import { CHAT_BUCKET, CHAT_MEDIA_KEEP_DAYS, EXPIRING_KINDS, type ChatAttachment } from "./chat-shared";
import { backupNotice, type BackupRun } from "./backup-notice";
import { CHAT_SNOOZE_DAYS, chatSilenceAlert, romeDay } from "./chat-silence";

/** Giorni prima della fine del programma in cui arriva l'avviso "Prossima fase da preparare". */
export const PROGRAM_ENDING_NOTICE_DAYS = 3;
/** Giorni senza allenamenti registrati dopo cui il cliente è "da sentire" (come in Oggi). */
export const INACTIVE_DAYS = 7;
/** Se il controllo del mattino salta un giorno, gli avvisi "quando succede" partono nei giorni subito dopo. */
const GRACE_DAYS = 2;

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
  const [{ data: billing }, { data: unpaid }] = await Promise.all([
    admin.rpc("billing_overview"),
    admin.from("payments").select("id, client_id, period_start, period_end").eq("unpaid", true).not("period_start", "is", null).not("period_end", "is", null),
  ]);
  const unpaidBy = new Map<string, UnpaidRow[]>();
  for (const r of unpaid ?? []) unpaidBy.set(r.client_id, [...(unpaidBy.get(r.client_id) ?? []), { id: r.id, period_start: r.period_start!, period_end: r.period_end! }]);
  for (const b of billing ?? []) {
    const c = byId.get(b.client_id);
    if (!c) continue;
    const kind = b.kind as PlanKind;
    // un periodo saltato ("da saldare") resta scaduto anche se ha pagato quello dopo
    const st = withUnpaidRows(billingStatus({ ...b, kind }, today, reminderDays), unpaidBy.get(b.client_id) ?? [], today);
    // pochi avvisi, una volta sola (regole in payment-alerts.ts): il resto lo vedi in Oggi e in Pagamenti
    const ev = paymentEvent(st, today, reminderDays, b.sessions_bought);
    if (!ev) continue;
    const staffText = staffPaymentText(ev, name(c));
    if (staffText) {
      for (const o of ownerIds) {
        out.push({ recipient_id: o, client_id: c.id, kind: "payment_due", ...staffText, link: `/staff/clienti/${c.id}/pagamenti`, dedupe_key: `pay:${c.id}:${ev.key}` });
      }
    }
    // al cliente scriviamo con calma e solo per il periodo in corso o uno rimasto indietro
    const clientText = c.user_id && clientFacingStatus(st) ? clientPaymentText(ev, kind) : null;
    if (c.user_id && clientText) {
      out.push({ recipient_id: c.user_id, client_id: c.id, kind: "payment_reminder", ...clientText, link: "/cliente", dedupe_key: `payclient:${c.id}:${ev.key}` });
    }
  }

  // 2) Programmi in chiusura: un avviso 3 giorni prima della fine (se la fase dopo non c'è ancora);
  //    poi il cliente resta nella card Programmi di Oggi, senza altre notifiche
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
    if (left > PROGRAM_ENDING_NOTICE_DAYS || left < 0 || nextByClient.get(c.id)) continue;
    const recipients = new Set(ownerIds);
    if (c.coach_id) recipients.add(c.coach_id);
    for (const r of recipients) {
      out.push({
        recipient_id: r,
        client_id: c.id,
        kind: "program_ending",
        title: `Prossima fase da preparare: ${name(c)}`,
        body: `“${p.title}” finisce ${left === 0 ? "oggi" : left === 1 ? "domani" : `tra ${left} giorni`}.`,
        link: `/staff/clienti/${c.id}/programma`,
        dedupe_key: `progend:${p.id}:soon`,
      });
    }
  }

  // 3) Diario settimanale (venerdì apertura, domenica ultimo promemoria)
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
        title: dow === 5 ? "Il diario della settimana è aperto" : "Ultimo giorno per il diario",
        body: "Quattro domande, tre minuti.",
        link: "/cliente/diario",
        dedupe_key: `checkin:${c.id}:${week}:${dow}`,
      });
    }
  }

  // 4) Clienti con un programma in corso che non registrano allenamenti da 7 giorni: UN avviso
  //    quando succede; poi restano nella card Allenamenti di Oggi finché non riprendono
  //    (contano anche gli allenamenti liberi: spinning, corsa, un circuito…)
  const activity = await rpcOr<Array<{ client_id: string; last_workout: string | null; last_free: string | null }>>(admin.rpc("last_activity"), async () => {
    const [{ data: lastLogs }, { data: lastFree }] = await Promise.all([
      admin.from("workout_logs").select("client_id, performed_on").order("performed_on", { ascending: false }).limit(1000),
      admin.from("free_workouts").select("client_id, performed_on").gte("performed_on", addDays(today, -60)).order("performed_on", { ascending: false }).limit(1000),
    ]);
    return [...(lastLogs ?? []).map((l) => ({ client_id: l.client_id, last_workout: l.performed_on, last_free: null })), ...(lastFree ?? []).map((l) => ({ client_id: l.client_id, last_workout: null, last_free: l.performed_on }))];
  });
  const lastBy = new Map<string, string>();
  for (const a of activity) {
    const d = latestDate(a.last_workout, a.last_free, lastBy.get(a.client_id));
    if (d) lastBy.set(a.client_id, d);
  }
  for (const p of programs ?? []) {
    if (!p.start_date || !p.client_id || p.start_date > addDays(today, -INACTIVE_DAYS)) continue;
    const c = byId.get(p.client_id);
    if (!c || !c.user_id) continue;
    if (diffDays(today, programEndDate(p.start_date, p.weeks)) < 0) continue;
    // da quanti giorni: dall'ultimo allenamento o, se non ne ha registrati su questo programma, dal suo inizio
    const logged = lastBy.get(c.id);
    const last = logged && logged >= p.start_date ? logged : null;
    const since = diffDays(last ?? p.start_date, today);
    if (since < INACTIVE_DAYS || since > INACTIVE_DAYS + GRACE_DAYS) continue;
    const recipients = new Set(ownerIds);
    if (c.coach_id) recipients.add(c.coach_id);
    for (const r of recipients) {
      out.push({
        recipient_id: r,
        client_id: c.id,
        kind: "inactive",
        title: `Da sentire: ${name(c)}`,
        body: last ? `Nessun allenamento registrato da ${since} giorni.` : "Non ha ancora registrato allenamenti sul programma in corso.",
        link: `/staff/clienti/${c.id}`,
        dedupe_key: `inactive:${c.id}:${last ?? `inizio:${p.start_date}`}`,
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
  //    UNA notifica quando succede; in Oggi si può rimandare di 5 giorni (poi, se non vi siete scritti, un nuovo avviso)
  const [msgs, { data: snoozes }] = await Promise.all([
    rpcOr<Array<{ client_id: string; created_at: string }>>(admin.rpc("last_messages", { include_deleted: false }), async () =>
      (await admin.from("messages").select("client_id, created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(1000)).data ?? [],
    ),
    admin.from("chat_snoozes").select("client_id, until"),
  ]);
  const snoozedBy = new Map((snoozes ?? []).map((z) => [z.client_id, z.until]));
  const lastMsg = new Map<string, string>();
  for (const m of msgs ?? []) if (!lastMsg.has(m.client_id)) lastMsg.set(m.client_id, m.created_at);
  for (const c of clients ?? []) {
    const at = lastMsg.get(c.id);
    if (!at || !c.user_id) continue;
    const day = romeDay(at);
    const alert = chatSilenceAlert(c.id, day, today, snoozedBy.get(c.id) ?? null);
    if (!alert) continue;
    const recipients = new Set(ownerIds);
    if (c.coach_id) recipients.add(c.coach_id);
    for (const r of recipients) {
      out.push({
        recipient_id: r,
        client_id: c.id,
        kind: "chat_silence",
        title: `Non senti ${name(c)} da ${alert.days} giorni`,
        body: `Ultimo messaggio in chat il ${formatLong(day)}. Scrivigli per chiedere come sta andando, oppure rimanda di ${CHAT_SNOOZE_DAYS} giorni da Oggi.`,
        link: `/staff/messaggi/${c.id}?promemoria=saluto`,
        dedupe_key: alert.key,
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
  // ogni passo per conto suo: se uno non riesce, gli altri girano lo stesso
  const step = async <T,>(job: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await job();
    } catch {
      return fallback;
    }
  };
  const backup = await step(() => backupCheck(ownerIds), null);
  const videosRemoved = await step(() => removeOldChatMedia(today), 0);
  // allegati della chat caricati e mai inviati, dopo 24 ore
  const orphansRemoved = await step(() => removeOrphanChatUploads(), 0);
  // niente riepilogo per email: il riepilogo è "Oggi" nell'app
  const emailed = await step(() => deliverPendingEmails(), 0);
  await step(async () => {
    // pulizia: bozze dimenticate da più di 2 mesi
    await admin.from("drafts").delete().lt("updated_at", `${addDays(today, -60)}T00:00:00Z`);
    // i segni delle bozze cancellate servono solo per poco
    await admin.from("drafts").delete().not("data->__deleted", "is", null).lt("updated_at", `${addDays(today, -1)}T00:00:00Z`);
    // pulizia: notifiche lette più vecchie di 6 mesi
    await admin.from("notifications").delete().lt("created_at", `${addDays(today, -180)}T00:00:00Z`).not("read_at", "is", null);
  }, undefined);
  // l'ultimo giro lo mostra Impostazioni → Collegamenti (se non gira, il titolare se ne accorge)
  await step(async () => {
    await admin.from("app_secrets").upsert({ name: "daily_checks_last_run", value: JSON.stringify({ at: new Date().toISOString(), notifications: out.length, emailed }) }, { onConflict: "name" });
  }, undefined);
  return { ok: true, today, notifications: out.length, emailed, videosRemoved, orphansRemoved, backup };
}

/**
 * Video e vocali della chat più vecchi di 2 mesi si cancellano dallo spazio
 * file (deciso dal titolare per non riempire lo spazio). Il messaggio resta: al
 * posto del video compare "Video scaduto", il vocale tiene la trascrizione
 * scritta. Le foto restano.
 */
export async function removeOldChatMedia(today: string): Promise<number> {
  const admin = createAdminClient();
  const cutoff = `${addDays(today, -CHAT_MEDIA_KEEP_DAYS)}T00:00:00Z`;
  // si riparte da dove si era arrivati ieri (prima ripartiva sempre dai più
  // vecchi e, oltre 1000 messaggi, non arrivava mai ai più nuovi)
  const { data: mark } = await admin.from("app_secrets").select("value").eq("name", MEDIA_MARK).maybeSingle();
  const from = mark?.value && !Number.isNaN(Date.parse(mark.value)) ? new Date(mark.value).toISOString() : "1970-01-01T00:00:00.000Z";
  if (Date.parse(from) >= Date.parse(cutoff)) return 0;
  const paths: string[] = [];
  let next = cutoff;
  for (const kind of EXPIRING_KINDS) {
    const { data, error } = await admin
      .from("messages")
      .select("attachments, created_at")
      .gte("created_at", from)
      .lt("created_at", cutoff)
      .is("deleted_at", null)
      // stringa JSON: con un array supabase-js scriverebbe la sintassi degli array di Postgres
      .contains("attachments", JSON.stringify([{ kind }]))
      .order("created_at")
      .limit(MEDIA_BATCH);
    if (error) {
      console.error("pulizia video e vocali", error);
      return 0; // il segno resta dov'era: si riprova domani
    }
    for (const m of data ?? []) paths.push(...((m.attachments as ChatAttachment[] | null) ?? []).filter((a) => a.kind === kind).map((a) => a.path));
    // troppi per un giro: domani si riparte dall'ultimo visto
    if ((data?.length ?? 0) >= MEDIA_BATCH) {
      const lastSeen = new Date(data![data!.length - 1].created_at).toISOString();
      if (Date.parse(lastSeen) < Date.parse(next)) next = lastSeen;
    }
  }
  // remove restituisce solo i file che c'erano davvero: quelli già cancellati non contano
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const { data: gone, error } = await admin.storage.from(CHAT_BUCKET).remove(paths.slice(i, i + 100));
    if (error) return removed; // il segno resta: domani si riprova
    removed += gone?.length ?? 0;
  }
  await admin.from("app_secrets").upsert({ name: MEDIA_MARK, value: next }, { onConflict: "name" });
  return removed;
}

const MEDIA_MARK = "chat_media_cleaned_until";
const MEDIA_BATCH = 1000;

/**
 * Conferma del backup notturno al titolare: riuscito (solo nell'app), non
 * riuscito o mancante (anche sul telefono). Il registro lo scrive il backup su
 * GitHub; senza righe il backup non è configurato e non si dice niente.
 */
export async function backupCheck(ownerIds: string[], now = new Date()): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("backup_runs").select("finished_at, ok, tables, db_bytes, files_bytes, message").order("finished_at", { ascending: false }).limit(1);
  if (error) return "registro non disponibile";
  const last = (data?.[0] ?? null) as BackupRun | null;
  const notice = backupNotice(last ? { ...last, db_bytes: last.db_bytes === null ? null : Number(last.db_bytes), files_bytes: last.files_bytes === null ? null : Number(last.files_bytes) } : null, now);
  if (!notice) return "non configurato";
  await notify(
    ownerIds.map((o) => ({ recipient_id: o, kind: "backup", title: notice.title, body: notice.body, link: "/staff/impostazioni#backup", dedupe_key: notice.key })),
    { push: notice.urgent },
  );
  return notice.key.split(":")[1];
}
