/**
 * Dati di PROVA (persone inventate) per vedere l'app piena e per i test.
 * Da usare solo su un database vuoto di prova, MAI su quello vero.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-demo.ts
 *
 * Crea: titolare, collaboratore, tre clienti (due con account), eserciziario,
 * programmi con logbook, check, posturale, pagamenti e diario.
 * Password di tutti gli account: Password-di-prova-123
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import { addDays, mondayOf, todayISO } from "../src/lib/dates";
import { averagesOf, computeBodyComposition, referenceFormula, type SkinfoldReadings } from "../src/lib/body/skinfolds";
import { estimateOneRepMax } from "../src/lib/strength/e1rm";
import { parseExerciseCsv } from "../src/lib/import/exercises";
import { newId, type ProgramContent } from "../src/lib/program/types";
import { PRIVACY_VERSION } from "../src/lib/privacy";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Servono SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
const db = createClient<Database>(url, key, { auth: { persistSession: false } });
const PASSWORD = "Password-di-prova-123";
const today = todayISO();

async function user(email: string, fullName: string) {
  const { data, error } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: fullName } });
  if (error) throw error;
  await db.from("profiles").update({ full_name: fullName }).eq("id", data.user.id);
  // simula un primo accesso (per lo stato "invito in attesa")
  return data.user.id;
}

// nome esercizio (minuscolo) → id nell'eserciziario, riempita dopo l'import
const exerciseIds = new Map<string, string>();
const item = (name: string, rx: string[], rest = "", notes = "") => ({ id: newId(), exerciseId: exerciseIds.get(name.toLowerCase()) ?? null, name, rest, notes, prescriptions: rx });

function programA(): ProgramContent {
  return {
    days: [
      {
        id: newId(), title: "Giorno 1 · Gambe e spinta", notes: "Riscaldamento: 5' bike + mobilità anche e caviglie.",
        blocks: [
          { id: newId(), kind: "text", title: "Attivazione", notes: "Dead bug 2x8 per lato · Glute bridge 2x12", rounds: null, durationMin: null, everySec: null, workSec: null, restSec: null, items: [] },
          { id: newId(), kind: "single", title: "", notes: "", rounds: null, durationMin: null, everySec: null, workSec: null, restSec: null, items: [item("Back squat", ["4x8 60kg", "4x9 60kg", "4x10 60kg", "4x11 60kg"], "2'", "Scendi controllato in 3 secondi")] },
          { id: newId(), kind: "superset", title: "", notes: "", rounds: 3, durationMin: null, everySec: null, workSec: null, restSec: null, items: [item("Panca piana manubri", ["3x10 16kg", "3x11 16kg", "3x12 16kg", "3x10 18kg"], "90\""), item("Rematore manubrio", ["3x10 20kg", "3x11 20kg", "3x12 20kg", "3x10 22kg"], "90\"")] },
          { id: newId(), kind: "circuit", title: "Finisher", notes: "Senza pause tra gli esercizi", rounds: 3, durationMin: null, everySec: null, workSec: null, restSec: null, items: [item("Affondi camminati", ["12", "12", "14", "14"]), item("Plank", ["30\"", "35\"", "40\"", "45\""]), item("Kettlebell swing", ["15 16kg", "15 16kg", "18 16kg", "20 16kg"])] },
        ],
      },
      {
        id: newId(), title: "Giorno 2 · Tirata e core", notes: "",
        blocks: [
          { id: newId(), kind: "single", title: "", notes: "", rounds: null, durationMin: null, everySec: null, workSec: null, restSec: null, items: [item("Stacco rumeno", ["4x8 50kg", "4x9 50kg", "4x10 50kg", "4x8 55kg"], "EMOM 2,5")] },
          { id: newId(), kind: "single", title: "", notes: "", rounds: null, durationMin: null, everySec: null, workSec: null, restSec: null, items: [item("Lat machine presa neutra", ["3x10", "3x10", "3x12", "3x12"], "90\"", "Petto alto, gomiti verso i fianchi")] },
          { id: newId(), kind: "single", title: "", notes: "", rounds: null, durationMin: null, everySec: null, workSec: null, restSec: null, items: [item("Panca piana bilanciere", ["4x6 @75%", "4x6 @77,5%", "4x5 @80%", "4x5 @82,5%"], "2'", "Carico calcolato dal tuo massimale")] },
          { id: newId(), kind: "amrap", title: "", notes: "Annota i giri completati", rounds: null, durationMin: 10, everySec: null, workSec: null, restSec: null, items: [item("Box step-up", ["10", "10", "10", "10"]), item("Push-up", ["8", "8", "10", "10"]), item("Hollow hold", ["20\"", "20\"", "25\"", "25\""])] },
        ],
      },
      {
        id: newId(), title: "Giorno 3 · Condizionamento", notes: "",
        blocks: [
          { id: newId(), kind: "emom", title: "", notes: "", rounds: null, durationMin: 12, everySec: 60, workSec: null, restSec: null, items: [item("Vogatore", ["12 cal", "12 cal", "13 cal", "14 cal"]), item("Goblet squat", ["10 16kg", "10 16kg", "12 16kg", "12 16kg"])] },
          { id: newId(), kind: "interval", title: "", notes: "", rounds: 8, durationMin: null, everySec: null, workSec: 30, restSec: 30, items: [item("Bike", ["sprint", "sprint", "sprint", "sprint"])] },
        ],
      },
    ],
  };
}

async function main() {
  const { count } = await db.from("profiles").select("*", { count: "exact", head: true });
  if (count) throw new Error("Il database non è vuoto: questo script va usato solo su un database di prova appena creato.");

  // Staff
  const owner = await user("titolare@prova.local", "Diego Prova");
  await db.from("staff_invites").insert({ email: "collaboratore@prova.local", full_name: "Marco Collaboratore" });
  const coach = await user("collaboratore@prova.local", "Marco Collaboratore");

  await db.from("app_settings").update({
    business_name: "Otherise",
    legal_name: "Diego Prova",
    legal_address: "Via dell'Esempio 1, 20100 Milano",
    legal_tax_id: "P. IVA 00000000000",
    privacy_email: "privacy@prova.local",
    coaching_method: readFileSync(new URL("../docs/METODO-BOZZA.md", import.meta.url), "utf8").replace(/^#.*\n+/, ""),
  }).eq("id", 1);

  // Eserciziario
  const { rows } = parseExerciseCsv(readFileSync(new URL("../dati/eserciziario.csv", import.meta.url), "utf8"));
  await db.from("exercises").insert(rows.map((r) => ({ name: r.name, video_url: r.video_url, description: r.description })));
  // gli esercizi dei programmi di prova che non sono nell'eserciziario vengono aggiunti (senza video)
  const used = [...new Set(programA().days.flatMap((d) => d.blocks.flatMap((b) => b.items.map((i) => i.name))))];
  const { data: lib } = await db.from("exercises").select("id, name");
  for (const e of lib ?? []) exerciseIds.set(e.name.toLowerCase(), e.id);
  const missing = used.filter((n) => !exerciseIds.has(n.toLowerCase()));
  if (missing.length) {
    const { data: added } = await db.from("exercises").insert(missing.map((name) => ({ name, description: "" }))).select("id, name");
    for (const e of added ?? []) exerciseIds.set(e.name.toLowerCase(), e.id);
  }

  // Clienti (inventati). Giulia ha dato il consenso nell'app, Luca su carta, Sara non ancora.
  const consentAt = new Date(Date.now() - 150 * 86400000).toISOString();
  const consent = (source: "app" | "paper") => ({ privacy_accepted_at: consentAt, privacy_version: PRIVACY_VERSION, health_consent_at: consentAt, consent_source: source });
  const { data: clients } = await db.from("clients").insert([
    { first_name: "Giulia", last_name: "Esempio", sex: "F", email: "giulia@prova.local", birth_date: "1993-05-14", goals: "Ricomposizione corporea, più forza nelle gambe, gestire il mal di schiena da scrivania.", start_date: addDays(today, -200), weekly_checkin: true, phone: "+39 333 0000001", ...consent("app") },
    { first_name: "Luca", last_name: "Prova", sex: "M", email: "luca@prova.local", birth_date: "1988-11-02", goals: "Tornare in forma dopo l'infortunio al ginocchio.", start_date: addDays(today, -60), coach_id: coach, weekly_checkin: true, ...consent("paper") },
    { first_name: "Sara", last_name: "Test", sex: "F", email: "sara@prova.local", birth_date: "1999-02-20", goals: "Preparazione per la mezza maratona.", start_date: addDays(today, -20) },
  ], { defaultToNull: false }).select("id, first_name").throwOnError();
  const giulia = clients!.find((c) => c.first_name === "Giulia")!.id;
  const luca = clients!.find((c) => c.first_name === "Luca")!.id;
  const sara = clients!.find((c) => c.first_name === "Sara")!.id;
  const giuliaUser = await user("giulia@prova.local", "Giulia Esempio");
  await user("luca@prova.local", "Luca Prova");

  // Programmi di Giulia: fase passata + fase in corso (iniziata 3 settimane fa)
  const start = addDays(mondayOf(today), -14);
  const pastContent = programA();
  const { data: past } = await db.from("programs").insert({ client_id: giulia, title: "Fase 1 · Adattamento", weeks: 4, start_date: addDays(start, -28), status: "archived", content: pastContent as never, created_by: owner, published_at: new Date().toISOString() }).select("id").single().throwOnError();
  const content = programA();
  const { data: current } = await db.from("programs").insert({ client_id: giulia, title: "Fase 2 · Volume", description: "Quattro settimane di volume crescente. Se un carico è troppo facile, aumentalo e scrivilo nel logbook.", weeks: 4, start_date: start, status: "published", content: content as never, previous_program_id: past!.id, created_by: owner, published_at: new Date().toISOString(), is_ai_example: true }).select("id").single().throwOnError();
  const lucaContent = programA();
  const { data: lucaProgram } = await db.from("programs").insert({ client_id: luca, title: "Rientro · Fase 1", weeks: 4, start_date: addDays(mondayOf(today), -21), status: "published", content: lucaContent as never, created_by: coach, published_at: new Date().toISOString() }).select("id").single().throwOnError();
  // Luca segnala un fastidio nel logbook: compare al trainer in "Oggi"
  await db.from("workout_logs").insert({ client_id: luca, program_id: lucaProgram!.id, day_id: lucaContent.days[0].id, week: 1, performed_on: addDays(today, -1), completed: true, notes: "", discomfort: "Fastidio al ginocchio destro negli affondi camminati, dalla seconda serie" });
  await db.from("programs").insert({ client_id: sara, title: "Base aerobica (bozza)", weeks: 6, status: "draft", content: programA() as never, created_by: owner });
  await db.from("programs").insert({ client_id: null, is_template: true, title: "Modello · Total body 3 giorni", weeks: 4, content: programA() as never, created_by: owner });

  // Logbook: settimane 1 e 2 complete, settimana 3 a metà
  async function logWeek(programId: string, c: ProgramContent, week: number, dayCount: number, base: string, kgBonus = 0) {
    for (let d = 0; d < dayCount; d++) {
      const day = c.days[d];
      const performed = addDays(base, d * 2);
      if (performed > today) continue;
      const { data: wl } = await db.from("workout_logs").insert({ client_id: giulia, program_id: programId, day_id: day.id, week, performed_on: performed, completed: true, notes: d === 1 && week === 2 ? "Stanca, dormito poco" : "" }).select("id").single().throwOnError();
      const ex = [];
      for (const b of day.blocks) {
        for (const it of b.items) {
          const m = /^(\d+)x(\d+)(?:\s+(\d+(?:\.\d+)?)kg)?/.exec(it.prescriptions[week - 1] ?? "");
          if (m) {
            const kg = m[3] ? Number(m[3]) + kgBonus : null;
            ex.push({ workout_log_id: wl!.id, client_id: giulia, program_id: programId, item_id: it.id, exercise_name: it.name, week, performed_on: performed, sets: Array.from({ length: Number(m[1]) }, () => ({ kg, reps: Number(m[2]), done: true })), result_text: "" });
          } else if (b.kind === "amrap" && it === b.items[0]) {
            ex.push({ workout_log_id: wl!.id, client_id: giulia, program_id: programId, item_id: it.id, exercise_name: it.name, week, performed_on: performed, sets: [], result_text: `${4 + week} giri + 6` });
          }
        }
      }
      if (ex.length) await db.from("exercise_logs").insert(ex).throwOnError();
    }
  }
  for (let w = 1; w <= 4; w++) await logWeek(past!.id, pastContent, w, 3, addDays(start, -28 + (w - 1) * 7), -5);
  await logWeek(current!.id, content, 1, 3, start);
  await logWeek(current!.id, content, 2, 3, addDays(start, 7));
  await logWeek(current!.id, content, 3, 1, addDays(start, 14));

  // Check di Giulia (pliche inventate). Il primo senza coscia (non si riusciva a
  // prendere): la formula di riferimento è a 3 pliche e l'app propone le 5.
  const checks: Array<{ date: string; weight: number; sf: Record<string, number> }> = [
    { date: addDays(today, -260), weight: 67.4, sf: { tricipite: 20, sottoscapolare: 16, soprailiaca: 18, addominale: 23.5 } },
    { date: addDays(today, -180), weight: 66.8, sf: { tricipite: 19, sottoscapolare: 15, soprailiaca: 17, addominale: 22, coscia: 27 } },
    { date: addDays(today, -95), weight: 65.9, sf: { tricipite: 17.5, sottoscapolare: 14, soprailiaca: 15, addominale: 20, coscia: 25 } },
    { date: addDays(today, -12), weight: 65.2, sf: { tricipite: 16, sottoscapolare: 13, soprailiaca: 13.5, addominale: 18, coscia: 23.5 } },
  ];
  const toReadings = (sf: Record<string, number>): SkinfoldReadings => Object.fromEntries(Object.entries(sf).map(([k, v]) => [k, [v, v + 0.5, null]]));
  const giuliaRef = referenceFormula("F", checks.map((c) => ({ averages: averagesOf(toReadings(c.sf)) })))!;
  for (const [n, c] of checks.entries()) {
    const i = n - 1;
    const skinfolds = toReadings(c.sf);
    const age = Number(c.date.slice(0, 4)) - 1993 - (c.date.slice(5) < "05-14" ? 1 : 0);
    const comp = computeBodyComposition({ sex: "F", age, weightKg: c.weight, skinfolds, formula: giuliaRef.id });
    const squat = 55 + i * 7.5;
    await db.from("checks").insert({
      client_id: giulia, check_date: c.date, weight_kg: c.weight, age_years: age, sex: "F", skinfolds: skinfolds as never,
      skinfold_sum_mm: comp.ok ? comp.sumMm : null, body_fat_pct: comp.ok ? comp.bodyFatPct : null, fat_mass_kg: comp.ok ? comp.fatMassKg : null, lean_mass_kg: comp.ok ? comp.leanMassKg : null, body_fat_formula: comp.ok ? comp.formula.id : null,
      // tutte le circonferenze: la fila dei bottoni è lunga come nella realtà (prova del telefono)
      circumferences: { spalle: 104 + i * 0.4, torace: 88 - i * 0.5, vita: 72 - i * 1.5, fianchi: 98 - i, coscia_sx: 55.5 - i * 0.5, coscia_dx: 56 - i * 0.5, braccio_sx: 26.8 + i * 0.3, braccio_dx: 27 + i * 0.3, polpaccio_sx: 36, polpaccio_dx: 36.2 } as never,
      strength_tests: [
        { exercise: "Back squat", load: squat, reps: 5, rpe: 8, e1rm: estimateOneRepMax(squat, 5, 8) },
        { exercise: "Panca piana bilanciere", load: 40 + i * 2.5, reps: 6, rpe: 8, e1rm: estimateOneRepMax(40 + i * 2.5, 6, 8) },
      ] as never,
      tests_text: n === 3 ? "Plank 1'40\". Sit and reach +4 cm." : "",
      notes_next_phase: n === 3 ? "Spingere sul volume gambe, inserire lavoro unilaterale. Schiena ok." : "",
      visible_to_client: true, created_by: owner,
    }).throwOnError();
  }
  await db.from("posture_assessments").insert({ client_id: giulia, assessed_on: addDays(today, -95), tight_muscles: "Flessori dell'anca, pettorale minore, polpacci.", what_works: "Buona mobilità toracica, core stabile nello squat.", posture_work: "Allungamento flessori 2x45\" per lato a fine seduta, wall slide 2x10, respirazione 90/90.", visible_to_client: true, created_by: owner });

  // Sessioni PT
  for (let i = 0; i < 8; i++) await db.from("pt_sessions").insert({ client_id: i < 3 ? giulia : luca, session_date: addDays(today, -i * 6 - 1), notes: i === 0 ? "Squat 4x10 a 60 kg pulito. Stacco: attenzione alla schiena nell'ultima ripetizione." : i === 3 ? "Ginocchio senza dolore, ok affondi." : "", created_by: i < 3 ? owner : coach });

  // Pagamenti
  const { data: pg } = await db.from("payment_plans").insert({ client_id: giulia, kind: "quarterly", amount: 480, method: "transfer", start_date: addDays(today, -200) }).select("id").single();
  await db.from("payments").insert([
    { client_id: giulia, plan_id: pg!.id, paid_on: addDays(today, -200), amount: 480, method: "transfer", period_start: addDays(today, -200), period_end: addDays(today, -110), created_by: owner },
    { client_id: giulia, plan_id: pg!.id, paid_on: addDays(today, -108), amount: 480, method: "transfer", period_start: addDays(today, -109), period_end: addDays(today, 4), created_by: owner },
  ]);
  const { data: pl } = await db.from("payment_plans").insert({ client_id: luca, kind: "package", amount: 400, method: "cash", start_date: addDays(today, -60), package_sessions: 10 }).select("id").single();
  await db.from("payments").insert({ client_id: luca, plan_id: pl!.id, paid_on: addDays(today, -60), amount: 400, method: "cash", sessions: 10, created_by: owner });
  const { data: ps } = await db.from("payment_plans").insert({ client_id: sara, kind: "monthly", amount: 180, method: "paypal", start_date: addDays(today, -40) }).select("id").single();
  await db.from("payments").insert({ client_id: sara, plan_id: ps!.id, paid_on: addDays(today, -40), amount: 180, method: "paypal", period_start: addDays(today, -40), period_end: addDays(today, -10), created_by: owner });
  // Altri clienti senza app (inventati), per avere un anno di incassi realistico
  const { data: extra } = await db.from("clients").insert([
    { first_name: "Marta", last_name: "Demo", sex: "F", email: "marta@prova.local", goals: "Tonificare e correre 10 km.", start_date: addDays(today, -330), phase_weeks: 6, ...consent("paper") },
    { first_name: "Paolo", last_name: "Esempio", sex: "M", goals: "Preparazione HYROX.", start_date: addDays(today, -300), ...consent("paper") },
  ], { defaultToNull: false }).select("id, first_name").throwOnError();
  const marta = extra!.find((c) => c.first_name === "Marta")!.id;
  const paolo = extra!.find((c) => c.first_name === "Paolo")!.id;
  const { data: pm } = await db.from("payment_plans").insert({ client_id: marta, kind: "monthly", amount: 160, method: "transfer", start_date: addDays(today, -330) }).select("id").single();
  const monthly = [];
  for (let k = 0; k < 11; k++) {
    const from = addDays(today, -330 + k * 30);
    monthly.push({ client_id: marta, plan_id: pm!.id, paid_on: from, amount: 160, method: "transfer" as const, period_start: from, period_end: addDays(from, 29), created_by: owner });
  }
  await db.from("payments").insert(monthly);
  const { data: pp } = await db.from("payment_plans").insert({ client_id: paolo, kind: "six_weeks", amount: 260, method: "card", start_date: addDays(today, -300) }).select("id").single();
  const blocks = [];
  for (let k = 0; k < 8; k++) {
    const from = addDays(today, -300 + k * 42);
    blocks.push({ client_id: paolo, plan_id: pp!.id, paid_on: from, amount: 260, method: "card" as const, period_start: from, period_end: addDays(from, 41), created_by: owner });
  }
  await db.from("payments").insert(blocks);
  // due ex clienti (archiviati) che a un certo punto non hanno rinnovato: servono allo scenario prudente
  const { data: past2 } = await db.from("clients").insert([
    { first_name: "Elena", last_name: "Passata", sex: "F", goals: "", start_date: addDays(today, -250), status: "archived", archived_at: new Date(Date.now() - 120 * 864e5).toISOString() },
    { first_name: "Andrea", last_name: "Finito", sex: "M", goals: "", start_date: addDays(today, -90), status: "archived", archived_at: new Date(Date.now() - 50 * 864e5).toISOString() },
  ], { defaultToNull: false }).select("id, first_name").throwOnError();
  const exPay = [];
  for (const [who, n, from0] of [["Elena", 4, -250], ["Andrea", 1, -90]] as const) {
    const id = past2!.find((c) => c.first_name === who)!.id;
    for (let k = 0; k < n; k++) {
      const from = addDays(today, from0 + k * 30);
      exPay.push({ client_id: id, paid_on: from, amount: 150, method: "cash" as const, period_start: from, period_end: addDays(from, 29), created_by: owner });
    }
  }
  await db.from("payments").insert(exPay).throwOnError();


  // Progetto annuale di Giulia (visibile): fasi e stimoli mese per mese
  const startMonth = today.slice(0, 7);
  const lv = (...v: number[]) => v;
  await db.from("client_projects").insert({
    client_id: giulia,
    visible: true,
    updated_by: owner,
    data: {
      start: startMonth,
      goal: "Più forza nelle gambe, schiena senza fastidi e una 10 km in primavera",
      phases: ["volume", "volume", "transition", "intensity", "intensity", "transition", "volume", "volume", "intensity", "free", "free", "transition"],
      notes: ["", "", "Natale: 2 sedute", "", "", "10 km", "", "", "", "Vacanze", "", ""],
      rows: [
        { id: "d0", label: "Posturale", kind: "training", values: lv(2, 2, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2) },
        { id: "d1", label: "Forza massima", kind: "training", values: lv(1, 1, 1, 3, 3, 2, 1, 1, 3, 0, 0, 1) },
        { id: "d2", label: "Massa magra", kind: "training", values: lv(3, 3, 2, 1, 1, 1, 3, 3, 1, 1, 1, 2) },
        { id: "d3", label: "Aerobico", kind: "training", values: lv(1, 1, 2, 2, 3, 3, 1, 1, 1, 2, 2, 1) },
        { id: "d4", label: "Vo2Max", kind: "training", values: lv(0, 0, 1, 2, 2, 3, 0, 0, 1, 1, 1, 0) },
        { id: "d5", label: "Alimentazione", kind: "nutrition", values: lv(2, 2, 2, 1, 1, 2, 2, 3, 3, 2, 2, 2) },
      ],
    },
  }).throwOnError();

  // Diario di Giulia: tre settimane tranquille, l'ultima con un problema
  const weeks = [-21, -14, -7].map((d) => mondayOf(addDays(today, d)));
  await db.from("checkins").insert({ client_id: giulia, week_start: weeks[0], training: 4, sleep: 4, stress: 3, adherence: 4 });
  await db.from("checkins").insert({ client_id: giulia, week_start: weeks[1], training: 4, sleep: 4, stress: 4, adherence: 4, coach_reply: "Brava, continua così!", reviewed_at: new Date().toISOString() });
  await db.from("checkins").insert({ client_id: giulia, week_start: weeks[2], training: 3, sleep: 2, stress: 2, adherence: 3, issues: "Settimana pesante al lavoro", request: "Posso spostare l'allenamento di giovedì a sabato?" });

  const { data: lastCheckin } = await db.from("checkins").select("id").eq("client_id", giulia).eq("week_start", weeks[2]).single();

  // Chat di Giulia: qualche scambio passato (fa da esempio dello stile del trainer per le bozze AI)
  const at = (days: number, h: number) => new Date(Date.now() - days * 864e5 + h * 36e5).toISOString();
  const chat = [
    { sender_id: giuliaUser, body: "Ciao! Oggi lo stacco rumeno mi è sembrato pesantissimo, è normale?", created_at: at(6, 0) },
    { sender_id: owner, body: "Ciao Giuly! Sì normale, è la settimana con più volume. Tieni 40 e pensa solo a spingere il sedere indietro, poi mi dici come va 💪", created_at: at(6, 1) },
    { sender_id: giuliaUser, body: "Oggi molto meglio, grazie!", created_at: at(3, 0) },
    { sender_id: owner, body: "Grande Giuly! Così si fa", created_at: at(3, 2) },
  ];
  await db.from("messages").insert(chat.map((m) => ({ ...m, client_id: giulia }))).throwOnError();
  // Con Marta il titolare ha un tono più formale: l'AI deve tenerne conto solo con lei
  await db.from("messages").insert([
    { client_id: marta, sender_id: owner, body: "Buongiorno Marta, ho caricato il programma della nuova fase. Quando riesce mi dica come vanno le prime sedute.", created_at: at(9, 0) },
    { client_id: marta, sender_id: owner, body: "Buongiorno Marta, perfetto. Per la corsa teniamo il passo concordato, ci aggiorniamo al prossimo check.", created_at: at(4, 0) },
  ]).throwOnError();
  await db.from("chat_reads").insert([{ user_id: owner, client_id: giulia, last_read_at: at(3, 2) }, { user_id: giuliaUser, client_id: giulia, last_read_at: at(3, 2) }]);
  // una bozza già corretta dal trainer (l'assistente impara da qui) e una pronta per il diario
  await db.from("ai_reply_drafts").insert([
    { client_id: giulia, source: "chat", body: "Ciao Giulia, è normale percepire più fatica in questa settimana perché il volume di lavoro è più alto. Ti consiglio di mantenere 40 kg e concentrarti sulla tecnica.", status: "used", sent_text: chat[1].body, sent_by: owner, created_at: at(6, 0.5), closed_at: at(6, 1) },
    { client_id: giulia, source: "checkin", checkin_id: lastCheckin!.id, body: "Ciao Giulia, certo che puoi spostarlo a sabato, nessun problema: l'importante è fare gli allenamenti in ordine. Visto che hai dormito poco, sabato tieni i carichi della settimana scorsa e non forzare. Ci sentiamo giovedì!" },
  ], { defaultToNull: false }).throwOnError();

  console.log("Dati di prova creati. Accessi (password: " + PASSWORD + "):");
  console.log("  titolare@prova.local · collaboratore@prova.local · giulia@prova.local · luca@prova.local");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
