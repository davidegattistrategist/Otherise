/**
 * Test dei permessi sul database vero (Supabase locale o un progetto di prova).
 * Richiede: TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, TEST_SUPABASE_SERVICE_KEY
 * e un database VUOTO (il primo utente creato diventa titolare).
 *
 *   npm run test:integration
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_SUPABASE_URL!;
const anonKey = process.env.TEST_SUPABASE_ANON_KEY!;
const serviceKey = process.env.TEST_SUPABASE_SERVICE_KEY!;
const run = Boolean(url && anonKey && serviceKey);

const admin = run ? createClient(url, serviceKey, { auth: { persistSession: false } }) : (null as never);
const PASSWORD = "Password-di-prova-123";
const stamp = Date.now();
const mail = (n: string) => `${n}.${stamp}@prova.local`;

async function userClient(email: string): Promise<SupabaseClient> {
  const { error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  const c = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: e2 } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (e2) throw e2;
  return c;
}

describe.skipIf(!run)("permessi", () => {
  let owner: SupabaseClient, coach: SupabaseClient, clientA: SupabaseClient, stranger: SupabaseClient;
  let coachId: string, clientAId: string, clientBId: string;
  let draftId: string, publishedId: string;

  beforeAll(async () => {
    const { count } = await admin.from("profiles").select("*", { count: "exact", head: true });
    if (count) throw new Error("Il database di prova deve essere vuoto: lancia scripts/reset-local-db.sh");

    owner = await userClient(mail("titolare"));
    await owner.from("staff_invites").insert({ email: mail("collaboratore"), full_name: "Collaboratore Prova" }).throwOnError();
    const { data: a } = await owner.from("clients")
      .insert({ first_name: "Anna", last_name: "Prova", sex: "F", email: mail("anna"), birth_date: "1992-04-10" })
      .select().single().throwOnError();
    const { data: b } = await owner.from("clients")
      .insert({ first_name: "Bruno", last_name: "Prova", sex: "M", email: mail("bruno") })
      .select().single().throwOnError();
    clientAId = a!.id; clientBId = b!.id;

    coach = await userClient(mail("collaboratore"));
    coachId = (await coach.auth.getUser()).data.user!.id;
    await owner.from("clients").update({ coach_id: coachId }).eq("id", clientAId).throwOnError();

    clientA = await userClient(mail("anna"));
    stranger = await userClient(mail("sconosciuto"));

    const content = { days: [{ id: "d1", title: "Giorno 1", blocks: [{ id: "b1", kind: "single", items: [{ id: "i1", name: "Squat", prescriptions: ["4x8"] }] }] }] };
    const { data: d } = await coach.from("programs")
      .insert({ client_id: clientAId, title: "Bozza", weeks: 1, content }).select().single().throwOnError();
    const { data: p } = await coach.from("programs")
      .insert({ client_id: clientAId, title: "Pubblicato", weeks: 1, content, status: "published", start_date: "2026-10-05" })
      .select().single().throwOnError();
    draftId = d!.id; publishedId = p!.id;
  });

  it("assegna i ruoli giusti alla prima entrata", async () => {
    const roles = await admin.from("profiles").select("email, role");
    const byEmail = Object.fromEntries(roles.data!.map((r) => [r.email, r.role]));
    expect(byEmail[mail("titolare")]).toBe("owner");
    expect(byEmail[mail("collaboratore")]).toBe("coach");
    expect(byEmail[mail("anna")]).toBe("client");
    expect(byEmail[mail("sconosciuto")]).toBe("none");
    const { data: linked } = await admin.from("clients").select("user_id").eq("id", clientAId).single();
    expect(linked!.user_id).toBeTruthy();
  });

  it("il collaboratore vede solo i clienti assegnati", async () => {
    const { data } = await coach.from("clients").select("id");
    expect(data!.map((c) => c.id)).toEqual([clientAId]);
  });

  it("il collaboratore non può riassegnare un cliente né vedere i pagamenti", async () => {
    const { error } = await coach.from("clients").update({ coach_id: null }).eq("id", clientAId);
    expect(error).not.toBeNull();
    await owner.from("payment_plans").insert({ client_id: clientAId, kind: "quarterly", amount: 600 }).throwOnError();
    const { data: plans } = await coach.from("payment_plans").select("*");
    expect(plans).toEqual([]);
    const { error: billErr } = await coach.rpc("client_billing", { cid: clientAId });
    expect(billErr).not.toBeNull();
  });

  it("il collaboratore non può creare programmi per clienti non suoi", async () => {
    const { error } = await coach.from("programs").insert({ client_id: clientBId, title: "No", weeks: 1 });
    expect(error).not.toBeNull();
  });

  it("il cliente vede solo sé stesso e solo i programmi pubblicati", async () => {
    const { data: cl } = await clientA.from("clients").select("id");
    expect(cl!.map((c) => c.id)).toEqual([clientAId]);
    const { data: progs } = await clientA.from("programs").select("id");
    expect(progs!.map((p) => p.id)).toEqual([publishedId]);
  });

  it("il cliente registra il logbook solo sui programmi pubblicati", async () => {
    const ok = await clientA.from("workout_logs")
      .insert({ client_id: clientAId, program_id: publishedId, day_id: "d1", week: 1 }).select().single();
    expect(ok.error).toBeNull();
    const ex = await clientA.from("exercise_logs").insert({
      workout_log_id: ok.data!.id, client_id: clientAId, program_id: publishedId, item_id: "i1",
      exercise_name: "Squat", week: 1, performed_on: "2026-10-06", sets: [{ kg: 60, reps: 8 }],
    });
    expect(ex.error).toBeNull();
    const ko = await clientA.from("workout_logs").insert({ client_id: clientAId, program_id: draftId, day_id: "d1", week: 1 });
    expect(ko.error).not.toBeNull();
    const other = await clientA.from("workout_logs").insert({ client_id: clientBId, program_id: publishedId, day_id: "d1", week: 1 });
    expect(other.error).not.toBeNull();
  });

  it("il cliente non vede note PT, check nascosti e posturale non condivisa", async () => {
    await coach.from("pt_sessions").insert({ client_id: clientAId, notes: "nota riservata" }).throwOnError();
    await coach.from("checks").insert({ client_id: clientAId, weight_kg: 60, visible_to_client: false }).throwOnError();
    await coach.from("checks").insert({ client_id: clientAId, weight_kg: 59.5, visible_to_client: true }).throwOnError();
    await coach.from("posture_assessments").insert({ client_id: clientAId, tight_muscles: "psoas" }).throwOnError();

    expect((await clientA.from("pt_sessions").select("*")).data).toEqual([]);
    expect((await clientA.from("checks").select("*")).data).toEqual([]);
    const checks = (await clientA.rpc("my_checks")).data! as Array<Record<string, unknown>>;
    expect(checks.map((c) => Number(c.weight_kg))).toEqual([59.5]);
    expect(Object.keys(checks[0])).not.toContain("notes_next_phase");
    // le pliche sì (per confrontarle nei progressi)
    expect(Object.keys(checks[0])).toContain("skinfolds");
    expect((await clientA.from("posture_assessments").select("*")).data).toEqual([]);
    const dates = await clientA.rpc("my_pt_session_dates");
    expect(dates.data).toHaveLength(1);
  });

  it("storico importato: fasi passate e check senza data; il cliente non vede i check senza data", async () => {
    // una fase passata può non avere la data, un programma pubblicato no
    const old = await coach.from("programs").insert({ client_id: clientAId, title: "01 Fase importata", weeks: 4, status: "archived", source: "import" }).select("id").single();
    expect(old.error).toBeNull();
    expect((await coach.from("programs").insert({ client_id: clientAId, title: "Senza data", weeks: 4, status: "published" })).error).not.toBeNull();
    // check dello storico: numero ma niente data, visibile solo allo staff per scelta dell'import
    await coach.from("checks").insert({ client_id: clientAId, check_date: null, sequence: 1, notes_next_phase: "Check 1 importato", visible_to_client: true }).throwOnError();
    const mine = (await clientA.rpc("my_checks")).data! as Array<Record<string, unknown>>;
    expect(mine.every((c) => c.check_date !== null)).toBe(true);
    expect((await coach.from("checks").select("sequence").eq("client_id", clientAId).not("sequence", "is", null)).data).toEqual([{ sequence: 1 }]);
    await admin.from("programs").delete().eq("id", old.data!.id);
  });

  it("il cliente non può modificare la propria scheda né il proprio ruolo", async () => {
    await clientA.from("clients").update({ first_name: "Hacker" }).eq("id", clientAId);
    const { data } = await admin.from("clients").select("first_name").eq("id", clientAId).single();
    expect(data!.first_name).toBe("Anna");
    const uid = (await clientA.auth.getUser()).data.user!.id;
    await clientA.from("profiles").update({ role: "owner" }).eq("id", uid);
    const { data: prof } = await admin.from("profiles").select("role").eq("id", uid).single();
    expect(prof!.role).toBe("client");
  });

  it("il cliente vede il proprio stato pagamenti ma non quello degli altri", async () => {
    const own = await clientA.rpc("client_billing", { cid: clientAId });
    expect(own.error).toBeNull();
    expect(own.data).toHaveLength(1);
    const other = await clientA.rpc("client_billing", { cid: clientBId });
    expect(other.error).not.toBeNull();
  });

  it("un utente non invitato non vede nulla", async () => {
    for (const t of ["clients", "programs", "exercises", "checks", "payments", "checkins"]) {
      const { data } = await stranger.from(t).select("*");
      expect(data, t).toEqual([]);
    }
  });

  it("un diario con un problema avvisa titolare e collaboratore", async () => {
    await clientA.from("checkins").insert({
      client_id: clientAId, week_start: "2026-10-05", training: 4, sleep: 2, stress: 3, adherence: 4, request: "",
    }).throwOnError();
    const { data: ci } = await clientA.from("checkins").select("flagged, flag_reasons").single();
    expect(ci!.flagged).toBe(true);
    expect(ci!.flag_reasons).toEqual(["Sonno"]);
    const coachNotes = (await coach.from("notifications").select("kind")).data!;
    const ownerNotes = (await owner.from("notifications").select("kind")).data!;
    expect(coachNotes.map((n) => n.kind)).toContain("checkin_flag");
    expect(ownerNotes.map((n) => n.kind)).toContain("checkin_flag");
    expect((await clientA.from("notifications").select("*")).data).toEqual([]);
  });

  it("lo staff risponde al diario ma non può cambiarne i voti", async () => {
    const { data: ci } = await coach.from("checkins").select("id").single();
    await coach.from("checkins").update({ coach_reply: "Ne parliamo giovedì", sleep: 5 }).eq("id", ci!.id).throwOnError();
    const { data } = await admin.from("checkins").select("sleep, coach_reply").eq("id", ci!.id).single();
    expect(data!.sleep).toBe(2);
    expect(data!.coach_reply).toBe("Ne parliamo giovedì");
  });

  it("un diario tranquillo non manda avvisi", async () => {
    const before = (await owner.from("notifications").select("id")).data!.length;
    await clientA.from("checkins").insert({
      client_id: clientAId, week_start: "2026-10-12", training: 4, sleep: 3, stress: 4, adherence: 4,
    }).throwOnError();
    const after = (await owner.from("notifications").select("id")).data!.length;
    expect(after).toBe(before);
  });

  it("chat: ognuno scrive solo nelle proprie conversazioni e vede solo le proprie", async () => {
    const clientUid = (await clientA.auth.getUser()).data.user!.id;
    const own = await clientA.from("messages").insert({ client_id: clientAId, sender_id: clientUid, body: "Ciao coach" }).select("id").single();
    expect(own.error).toBeNull();
    expect((await clientA.from("messages").insert({ client_id: clientBId, sender_id: clientUid, body: "x" })).error).not.toBeNull();
    expect((await clientA.from("messages").insert({ client_id: clientAId, sender_id: coachId, body: "finto" })).error).not.toBeNull();
    // il collaboratore la legge e risponde; vede il non letto
    const unread = (await coach.rpc("my_unread_chats")).data as Array<{ client_id: string; unread: number }>;
    expect(unread.find((u) => u.client_id === clientAId)?.unread).toBe(1);
    const reply = await coach.from("messages").insert({ client_id: clientAId, sender_id: coachId, body: "Ciao!" }).select("id").single();
    expect(reply.error).toBeNull();
    // estranei e altri clienti non vedono nulla
    expect((await stranger.from("messages").select("*")).data).toEqual([]);
    // il cliente non può toccare il messaggio del coach
    await clientA.from("messages").update({ deleted_at: new Date().toISOString() }).eq("id", reply.data!.id);
    const { data: still } = await admin.from("messages").select("body, deleted_at").eq("id", reply.data!.id).single();
    expect(still!.deleted_at).toBeNull();
    // si può solo eliminare il proprio messaggio, non modificarlo
    expect((await clientA.from("messages").update({ body: "modificato" }).eq("id", own.data!.id)).error).not.toBeNull();
    await clientA.from("messages").update({ deleted_at: new Date().toISOString() }).eq("id", own.data!.id).throwOnError();
    const { data: gone } = await admin.from("messages").select("body, deleted_at").eq("id", own.data!.id).single();
    expect(gone!.body).toBe("");
    expect(gone!.deleted_at).not.toBeNull();
  });
  it("trascrizioni dei vocali: le leggono il cliente e chi lo segue, le scrive solo il server", async () => {
    const clientUid = (await clientA.auth.getUser()).data.user!.id;
    const msg = await clientA.from("messages").insert({ client_id: clientAId, sender_id: clientUid, body: "", attachments: [{ path: `${clientAId}/2026-10/a.m4a`, kind: "audio", name: "Vocale", size: 10 }] }).select("id").single();
    await admin.from("message_transcripts").insert({ message_id: msg.data!.id, client_id: clientAId, status: "done", text: "ciao coach" }).throwOnError();
    expect((await clientA.from("message_transcripts").select("text").eq("message_id", msg.data!.id)).data).toEqual([{ text: "ciao coach" }]);
    expect((await coach.from("message_transcripts").select("text").eq("message_id", msg.data!.id)).data).toEqual([{ text: "ciao coach" }]);
    expect((await stranger.from("message_transcripts").select("*")).data ?? []).toEqual([]);
    // nessuno dal browser la scrive o la cambia
    await clientA.from("message_transcripts").update({ text: "cambiata" }).eq("message_id", msg.data!.id);
    await coach.from("message_transcripts").update({ text: "cambiata" }).eq("message_id", msg.data!.id);
    expect((await admin.from("message_transcripts").select("text").eq("message_id", msg.data!.id).single()).data!.text).toBe("ciao coach");
    expect((await clientA.from("message_transcripts").insert({ message_id: msg.data!.id, client_id: clientAId, text: "x" })).error).not.toBeNull();
  });
  it("privacy: il cliente dà e revoca solo i propri consensi, nient'altro", async () => {
    await clientA.rpc("accept_privacy", { version: "test" }).throwOnError();
    const { data: a } = await admin.from("clients").select("health_consent_at, privacy_version, consent_source, goals").eq("id", clientAId).single();
    expect(a!.health_consent_at).not.toBeNull();
    expect(a!.privacy_version).toBe("test");
    expect(a!.consent_source).toBe("app");
    // non può cambiare altri campi della scheda, nemmeno passando dai consensi
    expect((await clientA.from("clients").update({ goals: "x" }).eq("id", clientAId).select("id")).data ?? []).toEqual([]);
    // l'assistente AI fa parte del servizio: il cliente non può spegnerlo
    expect((await clientA.rpc("set_ai_opt_out" as never, { opt_out: true } as never)).error).not.toBeNull();
    await clientA.rpc("withdraw_health_consent").throwOnError();
    const { data: b } = await admin.from("clients").select("health_consent_at, goals").eq("id", clientAId).single();
    expect(b!.health_consent_at).toBeNull();
    expect(b!.goals).toBe(a!.goals);
    // il consenso del cliente B non cambia
    const { data: other } = await admin.from("clients").select("health_consent_at").eq("id", clientBId).single();
    expect(other!.health_consent_at).toBeNull();
    // chi non è cliente non può usare le funzioni dei consensi
    expect((await stranger.rpc("accept_privacy", { version: "test" })).error).not.toBeNull();
  });
  it("progetto annuale: lo scrive lo staff, il cliente lo vede solo se visibile e non lo cambia", async () => {
    const data = { start: "2026-10", goal: "", phases: Array(12).fill("volume"), notes: Array(12).fill(""), rows: [] };
    await coach.from("client_projects").upsert({ client_id: clientAId, data, visible: false }).throwOnError();
    expect((await clientA.from("client_projects").select("data")).data).toEqual([]);
    await coach.from("client_projects").update({ visible: true }).eq("client_id", clientAId).throwOnError();
    expect((await clientA.from("client_projects").select("client_id")).data).toHaveLength(1);
    // il cliente non può modificarlo, gli estranei non lo vedono, il collaboratore non tocca clienti non suoi
    await clientA.from("client_projects").update({ data: { ...data, goal: "x" } }).eq("client_id", clientAId);
    const { data: still } = await admin.from("client_projects").select("data").eq("client_id", clientAId).single();
    expect((still!.data as { goal: string }).goal).toBe("");
    expect((await stranger.from("client_projects").select("*")).data).toEqual([]);
    expect((await coach.from("client_projects").insert({ client_id: clientBId, data })).error).not.toBeNull();
  });

  it("registro del backup: lo legge solo il titolare, nessuno lo scrive dall'app", async () => {
    await admin.from("backup_runs").insert({ ok: true, tables: 10, db_bytes: 1000, files_bytes: 2000 }).throwOnError();
    expect((await owner.from("backup_runs").select("ok")).data).toHaveLength(1);
    expect((await coach.from("backup_runs").select("*")).data).toEqual([]);
    expect((await clientA.from("backup_runs").select("*")).data).toEqual([]);
    expect((await owner.from("backup_runs").insert({ ok: false })).error).not.toBeNull();
    expect((await coach.from("backup_runs").insert({ ok: false })).error).not.toBeNull();
  });

  it("bozze salvate da sole: ognuno vede e scrive solo le proprie", async () => {
    const coachUid = (await coach.auth.getUser()).data.user!.id;
    const clientUid = (await clientA.auth.getUser()).data.user!.id;
    await coach.from("drafts").upsert({ user_id: coachUid, key: "check:x:nuovo", data: { weight: "70" } }).throwOnError();
    await clientA.from("drafts").upsert({ user_id: clientUid, key: "chat:x", data: "ciao" }).throwOnError();
    expect((await coach.from("drafts").select("key")).data).toEqual([{ key: "check:x:nuovo" }]);
    expect((await clientA.from("drafts").select("key")).data).toEqual([{ key: "chat:x" }]);
    // a nome di un altro no
    expect((await clientA.from("drafts").insert({ user_id: coachUid, key: "falsa", data: {} })).error).not.toBeNull();
    await clientA.from("drafts").delete().eq("user_id", coachUid);
    expect((await admin.from("drafts").select("key").eq("user_id", coachUid)).data).toHaveLength(1);
    expect((await stranger.from("drafts").select("*")).data ?? []).toEqual([]);
    await admin.from("drafts").delete().in("user_id", [coachUid, clientUid]);
  });

  it("chat rimandata ('Non senti X'): solo lo staff che segue il cliente, il cliente non la vede", async () => {
    await coach.from("chat_snoozes").upsert({ client_id: clientAId, until: "2026-11-05" }).throwOnError();
    expect((await owner.from("chat_snoozes").select("until").eq("client_id", clientAId)).data).toEqual([{ until: "2026-11-05" }]);
    expect((await clientA.from("chat_snoozes").select("*")).data ?? []).toEqual([]);
    expect((await clientA.from("chat_snoozes").upsert({ client_id: clientAId, until: "2027-01-01" })).error).not.toBeNull();
    expect((await coach.from("chat_snoozes").insert({ client_id: clientBId, until: "2026-11-05" })).error).not.toBeNull();
    expect((await stranger.from("chat_snoozes").select("*")).data ?? []).toEqual([]);
  });

  it("allenamenti liberi: il cliente segna i suoi, lo staff che lo segue li vede", async () => {
    const { data: w } = await clientA.from("free_workouts").insert({ client_id: clientAId, kind: "spinning", minutes: 45, effort: 3 }).select("id").single().throwOnError();
    expect((await coach.from("free_workouts").select("kind, minutes").eq("client_id", clientAId)).data).toEqual([{ kind: "spinning", minutes: 45 }]);
    expect((await owner.from("free_workouts").select("id").eq("client_id", clientAId)).data).toHaveLength(1);
    expect((await stranger.from("free_workouts").select("*")).data ?? []).toEqual([]);
    // a nome di un altro no, tipi e date fuori dalle regole no
    expect((await clientA.from("free_workouts").insert({ client_id: clientBId, kind: "corsa" })).error).not.toBeNull();
    expect((await clientA.from("free_workouts").insert({ client_id: clientAId, kind: "skydiving" })).error).not.toBeNull();
    expect((await clientA.from("free_workouts").insert({ client_id: clientAId, kind: "corsa", performed_on: "2020-01-01" })).error).not.toBeNull();
    expect((await coach.from("free_workouts").insert({ client_id: clientBId, kind: "corsa" })).error).not.toBeNull();
    // lo toglie lui
    await clientA.from("free_workouts").delete().eq("id", w!.id).throwOnError();
    expect((await admin.from("free_workouts").select("id").eq("id", w!.id)).data).toEqual([]);
  });

  it("dolori nel logbook: il cliente li scrive, il diario con fastidi avvisa lo staff", async () => {
    await clientA.from("workout_logs").upsert({ client_id: clientAId, program_id: publishedId, day_id: "d1", week: 1, discomfort: "ginocchio" }, { onConflict: "program_id,week,day_id" }).throwOnError();
    const { data: wl } = await coach.from("workout_logs").select("discomfort").eq("program_id", publishedId).single();
    expect(wl!.discomfort).toBe("ginocchio");
    const { data: ci } = await clientA.from("checkins").insert({ client_id: clientAId, week_start: "2026-11-02", training: 4, sleep: 4, stress: 4, adherence: 4, issues: "mal di schiena" }).select("flagged, flag_reasons").single().throwOnError();
    expect(ci!.flagged).toBe(true);
    expect(ci!.flag_reasons).toContain("Fastidi");
  });
  it("bozze di risposta AI: solo lo staff che segue il cliente, mai il cliente", async () => {
    await admin.from("ai_reply_drafts").insert({ client_id: clientAId, source: "chat", body: "Ciao, sì va bene" }).throwOnError();
    expect((await coach.from("ai_reply_drafts").select("body").eq("client_id", clientAId)).data).toHaveLength(1);
    expect((await clientA.from("ai_reply_drafts").select("*")).data).toEqual([]);
    expect((await stranger.from("ai_reply_drafts").select("*")).data).toEqual([]);
    // il cliente non può nemmeno crearne
    expect((await clientA.from("ai_reply_drafts").insert({ client_id: clientAId, source: "chat", body: "x" })).error).not.toBeNull();
    // il collaboratore non vede né crea bozze per clienti non suoi
    expect((await coach.from("ai_reply_drafts").insert({ client_id: clientBId, source: "chat", body: "x" })).error).not.toBeNull();
    // lo staff la chiude con il testo inviato
    await coach.from("ai_reply_drafts").update({ status: "used", sent_text: "Ciao! Sì, va benissimo" }).eq("client_id", clientAId).throwOnError();
    const { data } = await admin.from("ai_reply_drafts").select("status, sent_text").eq("client_id", clientAId).single();
    expect(data).toEqual({ status: "used", sent_text: "Ciao! Sì, va benissimo" });
  });
  it("notifiche push: iscrizioni scritte solo dal server, ognuno legge solo le proprie, chiavi interne invisibili", async () => {
    const { data: me } = await clientA.auth.getUser();
    const { data: other } = await coach.auth.getUser();
    await admin.from("push_subscriptions").insert([
      { user_id: me.user!.id, endpoint: "https://push.example/a", p256dh: "k".repeat(30), auth: "a".repeat(16) },
      { user_id: other.user!.id, endpoint: "https://push.example/b", p256dh: "k".repeat(30), auth: "a".repeat(16) },
    ]).throwOnError();
    const mine = (await clientA.from("push_subscriptions").select("endpoint")).data;
    expect(mine).toEqual([{ endpoint: "https://push.example/a" }]);
    // dal browser non si scrive e non si cancella
    expect((await clientA.from("push_subscriptions").insert({ user_id: me.user!.id, endpoint: "https://push.example/c", p256dh: "k".repeat(30), auth: "a".repeat(16) })).error).not.toBeNull();
    await clientA.from("push_subscriptions").delete().eq("endpoint", "https://push.example/a");
    expect((await admin.from("push_subscriptions").select("id").eq("endpoint", "https://push.example/a")).data).toHaveLength(1);
    expect((await stranger.from("push_subscriptions").select("*")).data ?? []).toEqual([]);
    // le chiavi interne non le legge nessuno dal browser, nemmeno il titolare
    await admin.from("app_secrets").upsert({ name: "vapid", value: "{}" }).throwOnError();
    for (const c of [owner, coach, clientA, stranger]) {
      const r = await c.from("app_secrets").select("*");
      expect(r.data ?? []).toEqual([]);
    }
  });
  it("indicazioni per l'AI: solo lo staff che segue il cliente, mai il cliente", async () => {
    await coach.from("client_ai_profiles").upsert({ client_id: clientAId, session_minutes: 60, strength_level: "intermedio", notes: "Solo manubri" }).throwOnError();
    expect((await coach.from("client_ai_profiles").select("session_minutes").eq("client_id", clientAId)).data).toEqual([{ session_minutes: 60 }]);
    expect((await owner.from("client_ai_profiles").select("client_id").eq("client_id", clientAId)).data).toHaveLength(1);
    // il cliente non le vede e non le scrive
    expect((await clientA.from("client_ai_profiles").select("*")).data ?? []).toEqual([]);
    expect((await clientA.from("client_ai_profiles").insert({ client_id: clientAId, notes: "x" })).error).not.toBeNull();
    // il collaboratore non tocca clienti non suoi, gli estranei non vedono niente
    expect((await coach.from("client_ai_profiles").insert({ client_id: clientBId, notes: "x" })).error).not.toBeNull();
    expect((await stranger.from("client_ai_profiles").select("*")).data ?? []).toEqual([]);
    // valori fuori dai limiti rifiutati dal database
    expect((await coach.from("client_ai_profiles").update({ squat_share: 150 }).eq("client_id", clientAId)).error).not.toBeNull();
  });
  it("bozze dell'AI e lezioni: solo staff; le lezioni le cambia solo il titolare", async () => {
    await coach.from("program_ai_drafts").insert({ program_id: publishedId, client_id: clientAId, content: { days: [] }, instruction: "prova" }).throwOnError();
    expect((await coach.from("program_ai_drafts").select("id").eq("program_id", publishedId)).data).toHaveLength(1);
    expect((await clientA.from("program_ai_drafts").select("*")).data ?? []).toEqual([]);
    expect((await stranger.from("program_ai_drafts").select("*")).data ?? []).toEqual([]);
    expect((await clientA.from("program_ai_drafts").insert({ program_id: publishedId, client_id: clientAId, content: {} })).error).not.toBeNull();
    expect((await coach.from("program_ai_drafts").insert({ program_id: publishedId, client_id: clientBId, content: {} })).error).not.toBeNull();
    // lezioni: il collaboratore le legge ma non le cambia
    await coach.from("app_settings").update({ ai_lessons: "- hack" }).eq("id", 1);
    await owner.from("app_settings").update({ ai_lessons: "- lezione del titolare" }).eq("id", 1).throwOnError();
    const { data } = await admin.from("app_settings").select("ai_lessons").eq("id", 1).single();
    expect(data!.ai_lessons).toBe("- lezione del titolare");
    expect((await clientA.from("app_settings").select("ai_lessons")).data ?? []).toEqual([]);
  });
  it("bozze AI in coda: ognuno vede e scrive solo le sue, solo sui clienti che segue; il cliente niente", async () => {
    const coachUid = (await coach.auth.getUser()).data.user!.id;
    const ownerUid = (await owner.auth.getUser()).data.user!.id;
    const { data: job } = await coach.from("ai_program_jobs").insert({ program_id: publishedId, client_id: clientAId, created_by: coachUid, request: { instruction: "prova" } }).select("id, status").single().throwOnError();
    expect(job!.status).toBe("working");
    // una sola in preparazione per programma
    expect((await coach.from("ai_program_jobs").insert({ program_id: publishedId, client_id: clientAId, created_by: coachUid })).error?.code).toBe("23505");
    // a nome di un altro o su un cliente non suo: no
    expect((await coach.from("ai_program_jobs").insert({ program_id: publishedId, client_id: clientAId, created_by: ownerUid })).error).not.toBeNull();
    expect((await coach.from("ai_program_jobs").insert({ program_id: publishedId, client_id: clientBId, created_by: coachUid })).error).not.toBeNull();
    // il titolare non vede quelle del collaboratore, il cliente e gli estranei niente
    expect((await owner.from("ai_program_jobs").select("id")).data ?? []).toEqual([]);
    expect((await clientA.from("ai_program_jobs").select("id")).data ?? []).toEqual([]);
    expect((await stranger.from("ai_program_jobs").select("id")).data ?? []).toEqual([]);
    expect((await clientA.from("ai_program_jobs").insert({ program_id: publishedId, client_id: clientAId, created_by: (await clientA.auth.getUser()).data.user!.id })).error).not.toBeNull();
    await coach.from("ai_program_jobs").update({ status: "applied" }).eq("id", job!.id).throwOnError();
    expect((await coach.from("ai_program_jobs").select("status").eq("id", job!.id).single()).data!.status).toBe("applied");
  });

  it("lezioni sulle risposte: generali solo del titolare, sul cliente solo dello staff che lo segue", async () => {
    await coach.from("app_settings").update({ ai_reply_lessons: "- hack" }).eq("id", 1);
    await owner.from("app_settings").update({ ai_reply_lessons: "- festeggia e basta" }).eq("id", 1).throwOnError();
    expect((await admin.from("app_settings").select("ai_reply_lessons").eq("id", 1).single()).data!.ai_reply_lessons).toBe("- festeggia e basta");
    expect((await clientA.from("app_settings").select("ai_reply_lessons")).data ?? []).toEqual([]);
    await coach.from("client_ai_profiles").upsert({ client_id: clientAId, reply_lessons: "- la chiama per nome" }).throwOnError();
    expect((await clientA.from("client_ai_profiles").select("reply_lessons")).data ?? []).toEqual([]);
    expect((await stranger.from("client_ai_profiles").select("reply_lessons")).data ?? []).toEqual([]);
  });
  it("cliente gratis: lo decide solo il titolare ed esce da pagamenti e scadenze", async () => {
    // il collaboratore non può metterlo gratis
    const { error: coachErr } = await coach.from("clients").update({ free: true }).eq("id", clientAId);
    expect(coachErr).not.toBeNull();
    const before = await owner.rpc("billing_overview");
    expect((before.data ?? []).some((b: { client_id: string }) => b.client_id === clientAId)).toBe(true);
    await owner.from("clients").update({ free: true }).eq("id", clientAId).throwOnError();
    const after = await owner.rpc("billing_overview");
    expect((after.data ?? []).some((b: { client_id: string }) => b.client_id === clientAId)).toBe(false);
    expect((await clientA.rpc("client_billing", { cid: clientAId })).data ?? []).toEqual([]);
    // il cliente non può togliersi (o mettersi) da solo
    await clientA.from("clients").update({ free: false }).eq("id", clientAId);
    expect((await admin.from("clients").select("free").eq("id", clientAId).single()).data!.free).toBe(true);
    await owner.from("clients").update({ free: false }).eq("id", clientAId).throwOnError();
    expect((await clientA.rpc("client_billing", { cid: clientAId })).data).toHaveLength(1);
  });

  it("sessioni extra: la correzione del conteggio la fa solo il titolare", async () => {
    const { error } = await coach.from("clients").update({ extra_sessions_adjust: 3 }).eq("id", clientAId);
    expect(error).not.toBeNull();
    await clientA.from("clients").update({ extra_sessions_adjust: 3 }).eq("id", clientAId);
    expect((await admin.from("clients").select("extra_sessions_adjust").eq("id", clientAId).single()).data!.extra_sessions_adjust).toBe(0);
    await owner.from("clients").update({ extra_sessions_adjust: 2 }).eq("id", clientAId).throwOnError();
    expect((await admin.from("clients").select("extra_sessions_adjust").eq("id", clientAId).single()).data!.extra_sessions_adjust).toBe(2);
    await owner.from("clients").update({ extra_sessions_adjust: 0 }).eq("id", clientAId).throwOnError();
  });

  it("formula delle pliche: la sceglie lo staff che segue il cliente, valori ammessi soltanto", async () => {
    await coach.from("clients").update({ skinfold_formula: "f3_tsa" }).eq("id", clientAId).throwOnError();
    const { error } = await coach.from("clients").update({ skinfold_formula: "inventata" }).eq("id", clientAId);
    expect(error).not.toBeNull();
    await clientA.from("clients").update({ skinfold_formula: "f5" }).eq("id", clientAId);
    expect((await admin.from("clients").select("skinfold_formula").eq("id", clientAId).single()).data!.skinfold_formula).toBe("f3_tsa");
    await coach.from("clients").update({ skinfold_formula: null }).eq("id", clientAId).throwOnError();
  });
  it("pausa e fine percorso: in pausa vede tutto; a fine percorso gli resta solo la chat", async () => {
    // in pausa (lo decide anche il collaboratore che lo segue): il cliente vede tutto come prima
    await coach.from("clients").update({ status: "paused" }).eq("id", clientAId).throwOnError();
    expect((await clientA.from("programs").select("id")).data!.length).toBeGreaterThan(0);
    // percorso terminato
    await coach.from("clients").update({ status: "archived" }).eq("id", clientAId).throwOnError();
    expect((await clientA.from("programs").select("id")).data ?? []).toEqual([]);
    expect((await clientA.from("workout_logs").select("id")).data ?? []).toEqual([]);
    expect((await clientA.rpc("my_checks")).data ?? []).toEqual([]);
    expect((await clientA.rpc("client_billing", { cid: clientAId })).data ?? []).toEqual([]);
    const { error: logErr } = await clientA.from("workout_logs").insert({ client_id: clientAId, program_id: publishedId, week: 1, day_id: "d1", performed_on: "2026-10-06" });
    expect(logErr).not.toBeNull();
    // la chat resta: legge e scrive
    const uid = (await clientA.auth.getUser()).data.user!.id;
    await clientA.from("messages").insert({ client_id: clientAId, sender_id: uid, body: "Ciao, posso avere i miei massimali?" }).throwOnError();
    expect(((await clientA.from("messages").select("body")).data ?? []).some((m) => m.body.includes("massimali"))).toBe(true);
    // e può ancora gestire i propri consensi
    await clientA.rpc("accept_privacy", { version: "test" }).throwOnError();
    // il trainer vede ancora tutto
    expect((await coach.from("programs").select("id").eq("client_id", clientAId)).data!.length).toBeGreaterThan(0);
    await owner.from("clients").update({ status: "active" }).eq("id", clientAId).throwOnError();
    expect((await clientA.from("programs").select("id")).data!.length).toBeGreaterThan(0);
  });
  it("permesso per Instagram: lo dà e lo toglie il cliente, lo vede lo staff; check importati segnati", async () => {
    await clientA.rpc("accept_privacy", { version: "test", instagram: true }).throwOnError();
    expect((await coach.from("clients").select("instagram_consent_at").eq("id", clientAId).single()).data!.instagram_consent_at).not.toBeNull();
    await clientA.rpc("set_instagram_consent", { consent: false }).throwOnError();
    expect((await admin.from("clients").select("instagram_consent_at").eq("id", clientAId).single()).data!.instagram_consent_at).toBeNull();
    // un cliente non può cambiare il permesso di un altro né scriverlo direttamente insieme ad altri dati
    await clientA.from("clients").update({ instagram_consent_at: new Date().toISOString(), goals: "altro" }).eq("id", clientAId);
    expect((await admin.from("clients").select("goals").eq("id", clientAId).single()).data!.goals).not.toBe("altro");
    expect((await stranger.rpc("set_instagram_consent", { consent: true })).error).not.toBeNull();
    const { data: k } = await coach.from("checks").insert({ client_id: clientAId, check_date: "2026-10-01", sex: "F" }).select("imported").single().throwOnError();
    expect(k!.imported).toBe(false);
  });
  it("foto dei check: le carica lo staff che segue il cliente; il cliente vede solo quelle dei check visibili", async () => {
    const { data: vis } = await coach.from("checks").insert({ client_id: clientAId, check_date: "2026-10-02", sex: "F", visible_to_client: true }).select("id").single().throwOnError();
    const { data: hid } = await coach.from("checks").insert({ client_id: clientAId, check_date: "2026-10-03", sex: "F", visible_to_client: false }).select("id").single().throwOnError();
    const row = (checkId: string, n: string, clientId = clientAId) => ({ check_id: checkId, client_id: clientId, path: `${clientId}/${checkId}/${n}.jpg`, thumb_path: `${clientId}/${checkId}/${n}-t.jpg` });
    await coach.from("check_photos").insert([row(vis!.id, "a"), row(hid!.id, "b")]).throwOnError();
    // percorso dei file diverso dal check: rifiutato
    expect((await coach.from("check_photos").insert({ ...row(vis!.id, "c"), path: `${clientBId}/x/c.jpg` })).error).not.toBeNull();
    // check di un altro cliente spacciato per questo: rifiutato
    const { data: bCheck } = await owner.from("checks").insert({ client_id: clientBId, check_date: "2026-10-02", sex: "M" }).select("id").single().throwOnError();
    expect((await coach.from("check_photos").insert(row(bCheck!.id, "d"))).error).not.toBeNull();
    // il collaboratore non tocca i clienti non suoi
    expect((await coach.from("check_photos").insert(row(bCheck!.id, "e", clientBId))).error).not.toBeNull();
    // il cliente: niente tabella diretta, solo le foto dei check visibili
    expect((await clientA.from("check_photos").select("id")).data ?? []).toEqual([]);
    const mine = (await clientA.rpc("my_check_photos")).data ?? [];
    expect(mine.map((p: { check_id: string }) => p.check_id)).toEqual([vis!.id]);
    expect((await clientA.from("check_photos").insert(row(vis!.id, "f"))).error).not.toBeNull();
    expect((await stranger.rpc("my_check_photos")).data ?? []).toEqual([]);
    // eliminando il check spariscono anche le foto
    await coach.from("checks").delete().eq("id", hid!.id).throwOnError();
    expect((await admin.from("check_photos").select("id").eq("check_id", hid!.id)).data).toEqual([]);
  });
  it("contatore unico delle sessioni PT: scoperte scalate dal pacchetto, correzione solo del titolare", async () => {
    const { data: c } = await owner.from("clients").insert({ first_name: "Carla", last_name: "Contatore", sex: "F" }).select("id").single().throwOnError();
    const cid = c!.id;
    const counter = async () => ((await owner.rpc("pt_counters")).data ?? []).find((r: { client_id: string }) => r.client_id === cid) as { bought: number; used: number } | undefined;
    // senza piano: due sessioni fatte e non pagate
    await owner.from("pt_sessions").insert([{ client_id: cid, session_date: "2026-10-01" }, { client_id: cid, session_date: "2026-10-03" }]).throwOnError();
    let k = await counter();
    expect(k!.bought - k!.used).toBe(-2);
    // compra 10 lezioni: le 2 scoperte si scalano, ne restano 8
    await owner.from("payments").insert({ client_id: cid, paid_on: "2026-10-05", amount: 400, method: "cash", sessions: 10 }).throwOnError();
    k = await counter();
    expect(k!.bought - k!.used).toBe(8);
    // correzione: oggi gliene restano 5 (poi si conta da qui)
    await owner.from("clients").update({ pt_baseline_at: new Date().toISOString(), pt_baseline_left: 5 }).eq("id", cid).throwOnError();
    await owner.from("pt_sessions").insert({ client_id: cid, session_date: "2026-10-12" }).throwOnError();
    k = await counter();
    expect(k!.bought - k!.used).toBe(4);
    // il collaboratore e il cliente non vedono i contatori e non li correggono
    expect((await coach.rpc("pt_counters")).error).not.toBeNull();
    expect((await clientA.rpc("pt_counters")).error).not.toBeNull();
    expect((await coach.from("clients").update({ pt_baseline_left: 50 }).eq("id", clientAId)).error).not.toBeNull();
    // chi ha un pacchetto lo vede nello stato dei pagamenti con lo stesso conteggio
    await owner.from("payment_plans").insert({ client_id: cid, kind: "package", amount: 400, method: "cash", start_date: "2026-10-05", package_sessions: 10 }).throwOnError();
    const { data: b } = await owner.rpc("client_billing", { cid });
    expect(b![0].sessions_bought - b![0].sessions_used).toBe(4);
  });

  it("credito del coaching e tipi di piano: credito solo dal titolare, il cliente vede solo il proprio saldo PT", async () => {
    // il collaboratore non tocca il credito (neanche del suo cliente), il titolare sì
    expect((await coach.from("clients").update({ credit_adjust: 500 }).eq("id", clientAId)).error).not.toBeNull();
    expect((await coach.from("clients").update({ pt_credit_adjust: 500 }).eq("id", clientAId)).error).not.toBeNull();
    await owner.from("clients").update({ pt_credit_adjust: 70 }).eq("id", clientAId).throwOnError();
    await owner.from("clients").update({ credit_adjust: 50 }).eq("id", clientAId).throwOnError();
    // un pagamento con credito: lo vedono il titolare e il cliente, non il collaboratore
    await owner.from("payments").insert({ client_id: clientAId, paid_on: "2026-10-06", amount: 800, method: "cash", period_start: "2026-10-06", period_end: "2027-01-05", credit_change: 200 }).throwOnError();
    const mine = await clientA.from("payments").select("credit_change").eq("client_id", clientAId);
    expect(mine.data!.some((p) => Number(p.credit_change) === 200)).toBe(true);
    expect((await coach.from("payments").select("id").eq("client_id", clientAId)).data).toEqual([]);
    // tipi di piano: il collaboratore solo dei suoi clienti, chi non è staff niente
    await owner.from("payment_plans").insert({ client_id: clientBId, kind: "monthly", amount: 100 }).throwOnError();
    const kindsCoach = (await coach.rpc("client_plan_kinds")).data ?? [];
    expect(kindsCoach.every((r: { client_id: string }) => r.client_id === clientAId)).toBe(true);
    const kindsOwner = (await owner.rpc("client_plan_kinds")).data ?? [];
    expect(kindsOwner.some((r: { client_id: string }) => r.client_id === clientBId)).toBe(true);
    expect(((await clientA.rpc("client_plan_kinds")).data ?? []).length).toBe(0);
    // saldo PT: il cliente legge solo il proprio (o niente), un estraneo niente
    const own = await clientA.rpc("my_pt_balance");
    expect(own.error).toBeNull();
    expect(((await stranger.rpc("my_pt_balance")).data ?? []).length).toBe(0);
  });

  it("controllo generale: funzioni con i permessi di chi chiama, notifiche, campi dello staff, un solo piano attivo", async () => {
    // ultimo messaggio per chat: il cliente vede solo la sua conversazione, l'estraneo niente
    const meId = (await clientA.auth.getUser()).data.user!.id;
    await clientA.from("messages").insert({ client_id: clientAId, sender_id: meId, body: "ciao dal controllo" }).throwOnError();
    const mine = (await clientA.rpc("last_messages", {})).data ?? [];
    expect(mine.every((m: { client_id: string }) => m.client_id === clientAId)).toBe(true);
    expect(((await stranger.rpc("last_messages", {})).data ?? []).length).toBe(0);
    expect(((await coach.rpc("last_activity")).data ?? []).every((r: { client_id: string }) => r.client_id === clientAId)).toBe(true);
    // record: il cliente solo i suoi, un altro cliente o un estraneo niente
    expect((await clientA.rpc("exercise_bests", { cid: clientAId })).error).toBeNull();
    expect(((await stranger.rpc("exercise_bests", { cid: clientAId })).data ?? []).length).toBe(0);
    expect(((await clientA.rpc("programs_overview", { ids: [clientBId] })).data ?? []).length).toBe(0);
    // notifiche: si possono solo segnare come lette
    const { data: n } = await admin.from("notifications").insert({ recipient_id: meId, kind: "test", title: "Titolo vero", body: "" }).select("id").single().throwOnError();
    await clientA.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n!.id).throwOnError();
    expect((await clientA.from("notifications").update({ title: "Falso" }).eq("id", n!.id)).error).not.toBeNull();
    expect((await admin.from("notifications").select("title, read_at").eq("id", n!.id).single()).data!.title).toBe("Titolo vero");
    // logbook: il cliente non segna da solo "visto" il suo dolore
    await clientA.from("workout_logs").upsert({ client_id: clientAId, program_id: publishedId, day_id: "d9", week: 1, discomfort: "schiena" }, { onConflict: "program_id,week,day_id" }).throwOnError();
    await clientA.from("workout_logs").update({ discomfort_seen_at: new Date().toISOString(), note_flag: true, note_reason: "inventato" }).eq("program_id", publishedId).eq("day_id", "d9").throwOnError();
    const { data: wl } = await admin.from("workout_logs").select("discomfort_seen_at, note_flag, note_reason").eq("program_id", publishedId).eq("day_id", "d9").single();
    expect(wl).toEqual({ discomfort_seen_at: null, note_flag: null, note_reason: "" });
    // lo staff sì
    await coach.from("workout_logs").update({ discomfort_seen_at: new Date().toISOString() }).eq("program_id", publishedId).eq("day_id", "d9").throwOnError();
    expect((await admin.from("workout_logs").select("discomfort_seen_at").eq("program_id", publishedId).eq("day_id", "d9").single()).data!.discomfort_seen_at).not.toBeNull();
    // un solo piano attivo per cliente
    expect((await owner.from("payment_plans").insert({ client_id: clientBId, kind: "monthly", amount: 120 })).error).not.toBeNull();
  });

  it("robustezza: note riservate, spazio file, profili, bozze e trascrizioni", async () => {
    // note riservate: solo lo staff che segue il cliente
    await owner.from("client_private_notes").upsert({ client_id: clientAId, notes: "solo per noi" }).throwOnError();
    await owner.from("client_private_notes").upsert({ client_id: clientBId, notes: "nota su Bruno" }).throwOnError();
    expect((await clientA.from("client_private_notes").select("notes")).data ?? []).toEqual([]);
    expect(((await coach.from("client_private_notes").select("client_id")).data ?? []).map((r) => r.client_id)).toEqual([clientAId]);
    expect((await stranger.from("client_private_notes").select("notes")).data ?? []).toEqual([]);
    expect((await clientA.from("client_private_notes").upsert({ client_id: clientAId, notes: "scrivo io" })).error).not.toBeNull();

    // spazio file: nessuno dall'app elenca o scarica i file (solo il server, con link firmati)
    const photo = `${clientBId}/00000000-0000-0000-0000-000000000000/1.jpg`;
    await admin.storage.from("checks").upload(photo, new Blob(["foto"], { type: "image/jpeg" }), { upsert: true });
    await admin.storage.from("chat").upload(`${clientBId}/2026-10/a.jpg`, new Blob(["foto"], { type: "image/jpeg" }), { upsert: true });
    for (const c of [clientA, coach, stranger]) {
      for (const bucket of ["checks", "chat"]) {
        expect(((await c.storage.from(bucket).list(clientBId)).data ?? []).length).toBe(0);
      }
      expect((await c.storage.from("checks").download(photo)).data).toBeNull();
      expect((await c.storage.from("checks").upload(`${clientBId}/x/2.jpg`, new Blob(["x"]))).error).not.toBeNull();
    }

    // profili: nessuno cambia il proprio ruolo né quello degli altri
    const strangerId = (await stranger.auth.getUser()).data.user!.id;
    await stranger.from("profiles").update({ role: "owner" }).eq("id", strangerId);
    expect((await admin.from("profiles").select("role").eq("id", strangerId).single()).data!.role).toBe("none");
    const ownerId = (await owner.auth.getUser()).data.user!.id;
    await coach.from("profiles").update({ full_name: "Rubato", role: "none" }).eq("id", ownerId);
    expect((await admin.from("profiles").select("role").eq("id", ownerId).single()).data!.role).toBe("owner");

    // bozze: solo testo o oggetti, al massimo 300 a persona
    expect((await clientA.from("drafts").upsert({ user_id: (await clientA.auth.getUser()).data.user!.id, key: "strana", data: [1, 2] })).error).not.toBeNull();
    const meId = (await clientA.auth.getUser()).data.user!.id;
    const rows = Array.from({ length: 305 }, (_, i) => ({ user_id: meId, key: `prova-${i}`, data: { i }, updated_at: new Date(Date.now() - (305 - i) * 1000).toISOString() }));
    for (let i = 0; i < rows.length; i += 50) await clientA.from("drafts").insert(rows.slice(i, i + 50)).throwOnError();
    const { count } = await admin.from("drafts").select("*", { count: "exact", head: true }).eq("user_id", meId);
    expect(count).toBe(300);
    expect((await admin.from("drafts").select("key").eq("user_id", meId).eq("key", "prova-0").maybeSingle()).data).toBeNull();

    // sessioni PT per il collaboratore: solo dei clienti che segue, senza importi
    expect((await coach.rpc("pt_balance_for", { cid: clientAId })).error).toBeNull();
    expect(((await coach.rpc("pt_balance_for", { cid: clientBId })).data ?? []).length).toBe(0);
    expect(((await stranger.rpc("pt_balance_for", { cid: clientAId })).data ?? []).length).toBe(0);

    // trascrizioni: il conteggio lo usa solo il server, con un tetto al giorno
    expect((await clientA.rpc("use_transcription", { uid: meId, max_per_day: 1000 })).error).not.toBeNull();
    expect((await admin.rpc("use_transcription", { uid: meId, max_per_day: 2 })).data).toBe(true);
    expect((await admin.rpc("use_transcription", { uid: meId, max_per_day: 2 })).data).toBe(true);
    expect((await admin.rpc("use_transcription", { uid: meId, max_per_day: 2 })).data).toBe(false);
  });
  it("permessi veloci (V2): stesse regole di prima con le policy riscritte; le nuove funzioni helper rispondono per ruolo", async () => {
    // un secondo cliente seguito dal collaboratore: così "i suoi clienti" sono più di uno
    const { data: c2 } = await owner.from("clients")
      .insert({ first_name: "Carla", last_name: "Prova", sex: "F", email: mail("carla"), coach_id: coachId })
      .select().single().throwOnError();
    const clientCId = c2!.id as string;
    const ownerId = (await owner.auth.getUser()).data.user!.id;
    const clientAUid = (await clientA.auth.getUser()).data.user!.id;

    // le nuove funzioni: chi sono i "miei" clienti e qual è la mia scheda attiva
    expect((await owner.rpc("my_coached_clients")).data).toEqual([]);
    expect((await owner.rpc("my_active_client_id")).data).toBeNull();
    expect([...((await coach.rpc("my_coached_clients")).data ?? [])].sort()).toEqual([clientAId, clientCId].sort());
    expect((await coach.rpc("my_active_client_id")).data).toBeNull();
    expect((await clientA.rpc("my_coached_clients")).data).toEqual([]);
    expect((await clientA.rpc("my_active_client_id")).data).toBe(clientAId);
    expect((await stranger.rpc("my_coached_clients")).data).toEqual([]);
    expect((await stranger.rpc("my_active_client_id")).data).toBeNull();

    // dati su tre clienti: A e C del collaboratore, B solo del titolare
    for (const [cid, who] of [[clientAId, "A"], [clientBId, "B"], [clientCId, "C"]] as const) {
      await admin.from("messages").insert({ client_id: cid, sender_id: ownerId, body: `V2 messaggio ${who}` }).throwOnError();
      await admin.from("checks").insert({ client_id: cid, check_date: "2026-10-16", weight_kg: 70, tests_text: `V2 check ${who}` }).throwOnError();
      await admin.from("pt_sessions").insert({ client_id: cid, session_date: "2026-10-16", notes: `V2 pt ${who}`, created_by: ownerId }).throwOnError();
    }
    const seen = async (c: SupabaseClient, table: string, col: string, prefix: string) =>
      (((await c.from(table).select(col).like(col, `${prefix}%`)).data ?? []) as unknown as Record<string, unknown>[]).map((r) => String(r[col]).slice(-1)).sort();

    // il titolare vede tutto, il collaboratore solo A e C (tabella hash dei suoi clienti), il cliente solo sé, lo sconosciuto niente
    expect(await seen(owner, "messages", "body", "V2 messaggio")).toEqual(["A", "B", "C"]);
    expect(await seen(coach, "messages", "body", "V2 messaggio")).toEqual(["A", "C"]);
    expect(await seen(clientA, "messages", "body", "V2 messaggio")).toEqual(["A"]);
    expect(await seen(stranger, "messages", "body", "V2 messaggio")).toEqual([]);
    expect(await seen(owner, "checks", "tests_text", "V2 check")).toEqual(["A", "B", "C"]);
    expect(await seen(coach, "checks", "tests_text", "V2 check")).toEqual(["A", "C"]);
    expect(await seen(clientA, "checks", "tests_text", "V2 check")).toEqual([]); // i check il cliente li legge solo da my_checks()
    expect(await seen(coach, "pt_sessions", "notes", "V2 pt")).toEqual(["A", "C"]);
    expect(await seen(clientA, "pt_sessions", "notes", "V2 pt")).toEqual([]);

    // scritture: il collaboratore solo sui suoi, il cliente solo nella propria chat
    expect((await coach.from("pt_sessions").insert({ client_id: clientBId, session_date: "2026-10-16", notes: "no", created_by: coachId })).error).not.toBeNull();
    expect((await coach.from("pt_sessions").insert({ client_id: clientCId, session_date: "2026-10-16", notes: "sì", created_by: coachId })).error).toBeNull();
    expect((await clientA.from("messages").insert({ client_id: clientCId, sender_id: clientAUid, body: "intruso" })).error).not.toBeNull();
    expect((await clientA.from("messages").insert({ client_id: clientAId, sender_id: clientAUid, body: "V2 mio" })).error).toBeNull();
    // il collaboratore non si prende un cliente non suo né lo sposta
    await coach.from("clients").update({ coach_id: coachId }).eq("id", clientBId);
    expect((await admin.from("clients").select("coach_id").eq("id", clientBId).single()).data!.coach_id).toBeNull();

    // ex cliente: la chat resta (my_client_id), il resto no (my_active_client_id)
    await owner.from("clients").update({ status: "archived" }).eq("id", clientCId).throwOnError();
    const clientC = await userClient(mail("carla"));
    expect((await clientC.rpc("my_client_id")).data).toBe(clientCId);
    expect((await clientC.rpc("my_active_client_id")).data).toBeNull();
    expect(await seen(clientC, "messages", "body", "V2 messaggio")).toEqual(["C"]);
    expect((await clientC.from("workout_logs").select("id")).data ?? []).toEqual([]);
    expect((await clientC.from("payment_plans").select("id")).data ?? []).toEqual([]);
    expect((await clientC.from("free_workouts").insert({ client_id: clientCId, kind: "camminata", minutes: 30, effort: 1, performed_on: "2026-10-16" })).error).not.toBeNull();
    await owner.from("clients").update({ status: "active" }).eq("id", clientCId).throwOnError();
    expect((await clientC.rpc("my_active_client_id")).data).toBe(clientCId);
    expect((await clientC.from("payment_plans").select("id")).error).toBeNull();
  });

  it("fase nuova in anticipo: il cliente la sua (entro 3 giorni), lo staff solo i clienti che segue", async () => {
    const romeDay = (offset: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date(Date.now() + offset * 86_400_000));
    const content = { days: [{ id: "d1", title: "Giorno 1", blocks: [] }] };
    const make = async (clientId: string, start: string, status = "published") =>
      (await owner.from("programs").insert({ client_id: clientId, title: `Anticipo ${start}`, weeks: 4, content, status, start_date: start }).select("id").single().throwOnError()).data!.id as string;
    const startOf = async (id: string) => (await admin.from("programs").select("start_date").eq("id", id).single()).data!.start_date;
    const soon = await make(clientAId, romeDay(1));
    const far = await make(clientAId, romeDay(5));
    const draft = await make(clientAId, romeDay(1), "draft");
    const other = await make(clientBId, romeDay(2));

    // il cliente: la sua, pubblicata, entro 3 giorni
    expect((await clientA.rpc("start_program_early", { pid: far })).error).not.toBeNull();
    expect(await startOf(far)).toBe(romeDay(5));
    expect((await clientA.rpc("start_program_early", { pid: draft })).error).not.toBeNull();
    expect((await clientA.rpc("start_program_early", { pid: other })).error).not.toBeNull();
    expect(await startOf(other)).toBe(romeDay(2));
    expect((await stranger.rpc("start_program_early", { pid: soon })).error).not.toBeNull();
    const ok = await clientA.rpc("start_program_early", { pid: soon });
    expect(ok.error).toBeNull();
    expect(await startOf(soon)).toBe(romeDay(0));
    // già iniziata: non cambia niente
    expect((await clientA.rpc("start_program_early", { pid: soon })).data).toBe(romeDay(0));
    // il cliente continua a non poter cambiare i programmi da sé
    await clientA.from("programs").update({ start_date: romeDay(-30) }).eq("id", far);
    expect(await startOf(far)).toBe(romeDay(5));

    // lo staff: il collaboratore non tocca un cliente non suo, il titolare sì
    expect((await coach.rpc("start_program_early", { pid: other })).error).not.toBeNull();
    expect(await startOf(other)).toBe(romeDay(2));
    expect((await owner.rpc("start_program_early", { pid: other })).error).toBeNull();
    expect(await startOf(other)).toBe(romeDay(0));
    await admin.from("programs").delete().in("id", [soon, far, draft, other]).throwOnError();
  });
  it("ritocchi: versioni di prima solo per lo staff che segue il cliente, al massimo 30; limitazione temporanea", async () => {
    const content = { days: [{ id: "d1", title: "Giorno 1", blocks: [] }] };
    const otherProgram = (await owner.from("programs").insert({ client_id: clientBId, title: "Di Bruno", weeks: 1, content, status: "published", start_date: "2026-10-05" }).select("id").single().throwOnError()).data!.id as string;
    const rev = (programId: string, clientId: string, reason = "Ritocco con l'AI") => ({ program_id: programId, client_id: clientId, reason, title: "Prima", weeks: 1, content });
    await coach.from("program_revisions").insert(rev(publishedId, clientAId)).throwOnError();
    expect((await coach.from("program_revisions").select("reason").eq("program_id", publishedId)).data).toEqual([{ reason: "Ritocco con l'AI" }]);
    expect((await owner.from("program_revisions").select("id").eq("program_id", publishedId)).data).toHaveLength(1);
    // il cliente e gli estranei non le vedono e non le scrivono
    expect((await clientA.from("program_revisions").select("*")).data ?? []).toEqual([]);
    expect((await clientA.from("program_revisions").insert(rev(publishedId, clientAId))).error).not.toBeNull();
    expect((await stranger.from("program_revisions").select("*")).data ?? []).toEqual([]);
    // il collaboratore non tocca clienti non suoi, nemmeno spacciando il programma di un altro cliente
    expect((await coach.from("program_revisions").insert(rev(otherProgram, clientBId))).error).not.toBeNull();
    expect((await coach.from("program_revisions").insert(rev(otherProgram, clientAId))).error).not.toBeNull();
    expect((await owner.from("program_revisions").insert(rev(otherProgram, clientAId))).error).not.toBeNull();
    await owner.from("program_revisions").insert(rev(otherProgram, clientBId)).throwOnError();
    expect((await coach.from("program_revisions").select("id").eq("program_id", otherProgram)).data ?? []).toEqual([]);
    // non si modificano: si aggiungono o si cancellano
    await coach.from("program_revisions").update({ reason: "cambiato" }).eq("program_id", publishedId);
    expect((await admin.from("program_revisions").select("reason").eq("program_id", publishedId)).data).toEqual([{ reason: "Ritocco con l'AI" }]);
    // al massimo 30 per programma: restano le 29 più recenti e la prima di tutte (la versione di partenza)
    for (let i = 0; i < 31; i++) await admin.from("program_revisions").insert({ ...rev(publishedId, clientAId, `n${i}`), created_at: new Date(Date.now() + (i + 1) * 1000).toISOString() }).throwOnError();
    const kept = (await admin.from("program_revisions").select("reason").eq("program_id", publishedId)).data!.map((r) => r.reason);
    expect(kept).toHaveLength(30);
    expect(kept).toContain("n30");
    expect(kept).not.toContain("n0");
    expect(kept).not.toContain("n1");
    expect(kept).toContain("Ritocco con l'AI");
    // eliminando il programma se ne vanno anche le versioni
    await admin.from("programs").delete().eq("id", otherProgram).throwOnError();
    expect((await admin.from("program_revisions").select("id").eq("program_id", otherProgram)).data).toEqual([]);
    await admin.from("program_revisions").delete().eq("program_id", publishedId).throwOnError();

    // limitazione temporanea nelle indicazioni per l'AI: la scrive lo staff, il cliente no
    await coach.from("client_ai_profiles").upsert({ client_id: clientAId, limitation: "Niente prese con la mano sinistra", limitation_until: "2026-11-03" }).throwOnError();
    expect((await coach.from("client_ai_profiles").select("limitation, limitation_until").eq("client_id", clientAId)).data).toEqual([{ limitation: "Niente prese con la mano sinistra", limitation_until: "2026-11-03" }]);
    expect((await coach.from("client_ai_profiles").update({ limitation: "x".repeat(501) }).eq("client_id", clientAId)).error).not.toBeNull();
    await clientA.from("client_ai_profiles").update({ limitation: "" }).eq("client_id", clientAId);
    expect((await admin.from("client_ai_profiles").select("limitation").eq("client_id", clientAId).single()).data!.limitation).toBe("Niente prese con la mano sinistra");
  });
  it("peso giorno per giorno: il cliente il suo, lo staff dei clienti che segue; niente date future; a fine percorso il cliente non lo vede", async () => {
    const day = (offset: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date(Date.now() + offset * 86_400_000));
    // il cliente segna e corregge il suo
    await clientA.from("weight_logs").insert({ client_id: clientAId, log_date: day(-1), kg: 64.5 }).throwOnError();
    await clientA.from("weight_logs").upsert({ client_id: clientAId, log_date: day(-1), kg: 64.2 }, { onConflict: "client_id,log_date" }).throwOnError();
    expect((await clientA.from("weight_logs").select("kg").eq("client_id", clientAId)).data).toEqual([{ kg: 64.2 }]);
    // non quello di un altro cliente, non nel futuro, non valori assurdi
    expect((await clientA.from("weight_logs").insert({ client_id: clientBId, log_date: day(-1), kg: 70 })).error).not.toBeNull();
    expect((await clientA.from("weight_logs").insert({ client_id: clientAId, log_date: day(5), kg: 64 })).error).not.toBeNull();
    expect((await clientA.from("weight_logs").insert({ client_id: clientAId, log_date: day(-2), kg: 12 })).error).not.toBeNull();
    // lo staff che lo segue lo vede e lo può scrivere; il collaboratore non tocca clienti non suoi
    expect((await coach.from("weight_logs").select("kg").eq("client_id", clientAId)).data).toEqual([{ kg: 64.2 }]);
    await coach.from("weight_logs").insert({ client_id: clientAId, log_date: day(-3), kg: 64.8 }).throwOnError();
    expect((await coach.from("weight_logs").insert({ client_id: clientBId, log_date: day(-3), kg: 80 })).error).not.toBeNull();
    await owner.from("weight_logs").insert({ client_id: clientBId, log_date: day(-3), kg: 80 }).throwOnError();
    expect((await coach.from("weight_logs").select("id").eq("client_id", clientBId)).data ?? []).toEqual([]);
    expect((await clientA.from("weight_logs").select("id").eq("client_id", clientBId)).data ?? []).toEqual([]);
    expect((await stranger.from("weight_logs").select("*")).data ?? []).toEqual([]);
    // il cliente può togliere i suoi
    await clientA.from("weight_logs").delete().eq("client_id", clientAId).eq("log_date", day(-3)).throwOnError();
    expect((await admin.from("weight_logs").select("kg").eq("client_id", clientAId)).data).toEqual([{ kg: 64.2 }]);
    // a fine percorso il cliente non lo vede e non lo scrive più; lo staff sì
    await admin.from("clients").update({ status: "archived" }).eq("id", clientAId).throwOnError();
    expect((await clientA.from("weight_logs").select("id")).data ?? []).toEqual([]);
    expect((await clientA.from("weight_logs").insert({ client_id: clientAId, log_date: day(-4), kg: 64 })).error).not.toBeNull();
    expect((await coach.from("weight_logs").select("kg").eq("client_id", clientAId)).data).toEqual([{ kg: 64.2 }]);
    await admin.from("clients").update({ status: "active" }).eq("id", clientAId).throwOnError();
    await admin.from("weight_logs").delete().in("client_id", [clientAId, clientBId]).throwOnError();
  });
  it("storico delle modifiche: la versione precedente di una riga resta nel database, nessuno la legge dall'app", async () => {
    // una pesata del cliente, poi corretta e cancellata dal cliente stesso
    const day = (offset: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date(Date.now() + offset * 86_400_000));
    const { data: w } = await clientA.from("weight_logs").insert({ client_id: clientAId, log_date: day(-4), kg: 63.1 }).select("id").single().throwOnError();
    await clientA.from("weight_logs").update({ kg: 63.4 }).eq("id", w!.id).throwOnError();
    await clientA.from("weight_logs").delete().eq("id", w!.id).throwOnError();
    const { data: hist } = await admin.from("row_history").select("op, old_data").eq("table_name", "weight_logs").eq("row_id", w!.id).order("changed_at");
    expect(hist!.map((h) => [h.op, (h.old_data as { kg: number }).kg])).toEqual([["update", 63.1], ["delete", 63.4]]);
    // un check modificato dallo staff: la versione di prima (con gli appunti) resta
    const { data: ck } = await coach.from("checks").insert({ client_id: clientAId, check_date: day(-1), notes_next_phase: "Appunti importanti", strength_tests: [{ exercise: "Stacco", load: 100, reps: 5, rpe: 9, e1rm: 115 }] }).select("id").single().throwOnError();
    await coach.from("checks").update({ notes_next_phase: "", strength_tests: [] }).eq("id", ck!.id).throwOnError();
    const { data: before } = await admin.from("row_history").select("old_data").eq("table_name", "checks").eq("row_id", ck!.id).order("changed_at", { ascending: false }).limit(1).single();
    expect((before!.old_data as { notes_next_phase: string }).notes_next_phase).toBe("Appunti importanti");
    expect(((before!.old_data as { strength_tests: unknown[] }).strength_tests).length).toBe(1);
    // dall'app non si legge né si scrive (titolare compreso)
    expect((await owner.from("row_history").select("id").limit(1)).error).not.toBeNull();
    expect((await clientA.from("row_history").select("id").limit(1)).error).not.toBeNull();
    expect((await owner.from("row_history").delete().eq("table_name", "checks")).error).not.toBeNull();
    // la pulizia la fa solo il server
    expect((await owner.rpc("trim_row_history", { keep_days: 0 })).error).not.toBeNull();
    const { data: trimmed } = await admin.rpc("trim_row_history", { keep_days: 0 });
    expect(trimmed).toBeGreaterThanOrEqual(3);
    await admin.from("checks").delete().eq("id", ck!.id).throwOnError();
  });
  it("sicurezza dei dati (24/10): allegati solo della propria chat, created_by non si finge, staff di un cliente non si legge", async () => {
    // un messaggio con il percorso di un file di un'altra chat viene rifiutato
    expect((await clientA.from("messages").insert({ client_id: clientAId, sender_id: (await clientA.auth.getUser()).data.user!.id, body: "", attachments: [{ kind: "image", path: `${clientBId}/2026-10/x.jpg` }] })).error).not.toBeNull();
    expect((await clientA.from("messages").insert({ client_id: clientAId, sender_id: (await clientA.auth.getUser()).data.user!.id, body: "", attachments: [{ kind: "image", path: `${clientAId}/../x.jpg` }] })).error).not.toBeNull();
    // created_by è chi scrive, anche se il browser manda un altro id
    const day = (offset: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date(Date.now() + offset * 86_400_000));
    const { data: w } = await clientA.from("weight_logs").insert({ client_id: clientAId, log_date: day(-6), kg: 63, created_by: coachId }).select("created_by").single().throwOnError();
    expect(w!.created_by).toBe((await clientA.auth.getUser()).data.user!.id);
    await admin.from("weight_logs").delete().eq("client_id", clientAId).eq("log_date", day(-6));
    // lo staff di un cliente non si legge dall'app
    expect((await clientA.rpc("client_staff_recipients", { cid: clientBId })).error).not.toBeNull();
    expect((await stranger.rpc("client_staff_recipients", { cid: clientAId })).error).not.toBeNull();
  });
});
