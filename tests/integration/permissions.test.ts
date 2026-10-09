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
    expect((await clientA.from("posture_assessments").select("*")).data).toEqual([]);
    const dates = await clientA.rpc("my_pt_session_dates");
    expect(dates.data).toHaveLength(1);
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

  it("un check-up con un problema avvisa titolare e collaboratore", async () => {
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

  it("lo staff risponde al check-up ma non può cambiarne i voti", async () => {
    const { data: ci } = await coach.from("checkins").select("id").single();
    await coach.from("checkins").update({ coach_reply: "Ne parliamo giovedì", sleep: 5 }).eq("id", ci!.id).throwOnError();
    const { data } = await admin.from("checkins").select("sleep, coach_reply").eq("id", ci!.id).single();
    expect(data!.sleep).toBe(2);
    expect(data!.coach_reply).toBe("Ne parliamo giovedì");
  });

  it("un check-up tranquillo non manda avvisi", async () => {
    const before = (await owner.from("notifications").select("id")).data!.length;
    await clientA.from("checkins").insert({
      client_id: clientAId, week_start: "2026-10-12", training: 4, sleep: 3, stress: 4, adherence: 4,
    }).throwOnError();
    const after = (await owner.from("notifications").select("id")).data!.length;
    expect(after).toBe(before);
  });
});
