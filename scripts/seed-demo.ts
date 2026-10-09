/**
 * Dati di PROVA (persone inventate) per vedere l'app piena e per i test.
 * Da usare solo su un database vuoto di prova, MAI su quello vero.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-demo.ts
 *
 * Crea: titolare, collaboratore, tre clienti (due con account), eserciziario,
 * programmi con logbook, check, posturale, pagamenti e check-up.
 * Password di tutti gli account: Password-di-prova-123
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import { addDays, mondayOf, todayISO } from "../src/lib/dates";
import { computeBodyComposition, type SkinfoldReadings } from "../src/lib/body/skinfolds";
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

const item = (name: string, rx: string[], rest = "", notes = "") => ({ id: newId(), exerciseId: null, name, rest, notes, prescriptions: rx });

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
          { id: newId(), kind: "single", title: "", notes: "", rounds: null, durationMin: null, everySec: null, workSec: null, restSec: null, items: [item("Stacco rumeno", ["4x8 50kg", "4x9 50kg", "4x10 50kg", "4x8 55kg"], "2'")] },
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
  await user("giulia@prova.local", "Giulia Esempio");
  await user("luca@prova.local", "Luca Prova");

  // Programmi di Giulia: fase passata + fase in corso (iniziata 3 settimane fa)
  const start = addDays(mondayOf(today), -14);
  const pastContent = programA();
  const { data: past } = await db.from("programs").insert({ client_id: giulia, title: "Fase 1 · Adattamento", weeks: 4, start_date: addDays(start, -28), status: "archived", content: pastContent as never, created_by: owner, published_at: new Date().toISOString() }).select("id").single().throwOnError();
  const content = programA();
  const { data: current } = await db.from("programs").insert({ client_id: giulia, title: "Fase 2 · Volume", description: "Quattro settimane di volume crescente. Se un carico è troppo facile, aumentalo e scrivilo nel logbook.", weeks: 4, start_date: start, status: "published", content: content as never, previous_program_id: past!.id, created_by: owner, published_at: new Date().toISOString(), is_ai_example: true }).select("id").single().throwOnError();
  await db.from("programs").insert({ client_id: luca, title: "Rientro · Fase 1", weeks: 4, start_date: addDays(mondayOf(today), -21), status: "published", content: programA() as never, created_by: coach, published_at: new Date().toISOString() });
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

  // Check di Giulia (pliche inventate)
  const checks: Array<{ date: string; weight: number; sf: Record<string, number> }> = [
    { date: addDays(today, -180), weight: 66.8, sf: { tricipite: 19, sottoscapolare: 15, soprailiaca: 17, addominale: 22, coscia: 27 } },
    { date: addDays(today, -95), weight: 65.9, sf: { tricipite: 17.5, sottoscapolare: 14, soprailiaca: 15, addominale: 20, coscia: 25 } },
    { date: addDays(today, -12), weight: 65.2, sf: { tricipite: 16, sottoscapolare: 13, soprailiaca: 13.5, addominale: 18, coscia: 23.5 } },
  ];
  for (const [i, c] of checks.entries()) {
    const skinfolds: SkinfoldReadings = Object.fromEntries(Object.entries(c.sf).map(([k, v]) => [k, [v, v + 0.5, null]]));
    const age = Number(c.date.slice(0, 4)) - 1993 - (c.date.slice(5) < "05-14" ? 1 : 0);
    const comp = computeBodyComposition({ sex: "F", age, weightKg: c.weight, skinfolds });
    const squat = 55 + i * 7.5;
    await db.from("checks").insert({
      client_id: giulia, check_date: c.date, weight_kg: c.weight, age_years: age, sex: "F", skinfolds: skinfolds as never,
      skinfold_sum_mm: comp.ok ? comp.sumMm : null, body_fat_pct: comp.ok ? comp.bodyFatPct : null, fat_mass_kg: comp.ok ? comp.fatMassKg : null, lean_mass_kg: comp.ok ? comp.leanMassKg : null,
      circumferences: { vita: 72 - i * 1.5, fianchi: 98 - i, coscia_dx: 56 - i * 0.5, braccio_dx: 27 + i * 0.3 } as never,
      strength_tests: [
        { exercise: "Back squat", load: squat, reps: 5, rpe: 8, e1rm: estimateOneRepMax(squat, 5, 8) },
        { exercise: "Panca piana bilanciere", load: 40 + i * 2.5, reps: 6, rpe: 8, e1rm: estimateOneRepMax(40 + i * 2.5, 6, 8) },
      ] as never,
      tests_text: i === 2 ? "Plank 1'40\". Sit and reach +4 cm." : "",
      notes_next_phase: i === 2 ? "Spingere sul volume gambe, inserire lavoro unilaterale. Schiena ok." : "",
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

  // Check-up di Giulia: tre settimane tranquille, l'ultima con un problema
  const weeks = [-21, -14, -7].map((d) => mondayOf(addDays(today, d)));
  await db.from("checkins").insert({ client_id: giulia, week_start: weeks[0], training: 4, sleep: 4, stress: 3, adherence: 4 });
  await db.from("checkins").insert({ client_id: giulia, week_start: weeks[1], training: 4, sleep: 4, stress: 4, adherence: 4, coach_reply: "Brava, continua così!", reviewed_at: new Date().toISOString() });
  await db.from("checkins").insert({ client_id: giulia, week_start: weeks[2], training: 3, sleep: 2, stress: 2, adherence: 3, issues: "Settimana pesante al lavoro", request: "Posso spostare l'allenamento di giovedì a sabato?" });

  console.log("Dati di prova creati. Accessi (password: " + PASSWORD + "):");
  console.log("  titolare@prova.local · collaboratore@prova.local · giulia@prova.local · luca@prova.local");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
