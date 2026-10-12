import "server-only";
/**
 * Contesto snello per le bozze di risposta ai clienti: solo quello che serve
 * per rispondere bene in chat (molto meno del contesto per i programmi).
 * - gli ultimi allenamenti, esercizio per esercizio: programma vs fatto;
 * - il prossimo allenamento (per le domande su cosa fare);
 * - indicazioni del trainer, fase del progetto, ultimo check e check-up.
 * Nome, cognome, email e telefono non ci sono mai.
 */
import type { ServerSupabase } from "../supabase/server";
import { addDays, ageOn, todayISO } from "../dates";
import { parseContent } from "../program/types";
import { nextWorkout } from "../program/schedule";
import type { SetLog } from "../program/prescription";
import { parseProject, projectForAI } from "../project";
import { profileText } from "../ai-profile";
import { getAiProfile } from "../data/ai-profile";
import { workoutVsPlan } from "../reply-context";

export async function buildReplyContext(supabase: ServerSupabase, clientId: string) {
  const today = todayISO();
  const [client, workouts, program, checks, checkins, project, profile] = await Promise.all([
    supabase.from("clients").select("sex, birth_date, goals").eq("id", clientId).single(),
    supabase.from("workout_logs").select("id, program_id, day_id, week, performed_on, completed, notes, discomfort").eq("client_id", clientId).gte("performed_on", addDays(today, -14)).order("performed_on", { ascending: false }).order("updated_at", { ascending: false }).limit(2),
    supabase.from("programs").select("id, title, weeks, content").eq("client_id", clientId).eq("status", "published").order("start_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("checks").select("check_date, sequence, created_at, weight_kg, body_fat_pct").eq("client_id", clientId).not("check_date", "is", null).order("check_date", { ascending: false }).limit(1),
    supabase.from("checkins").select("week_start, training, sleep, stress, adherence, issues").eq("client_id", clientId).order("week_start", { ascending: false }).limit(1),
    supabase.from("client_projects").select("data").eq("client_id", clientId).maybeSingle(),
    getAiProfile(supabase, clientId),
  ]);

  const parts: string[] = [];
  const c = client.data;
  if (c) {
    const age = ageOn(c.birth_date, today);
    parts.push(`## Cliente\n${c.sex === "F" ? "Donna" : c.sex === "M" ? "Uomo" : "Cliente"}${age ? `, ${age} anni` : ""}. Obiettivi: ${c.goals || "non indicati"}.`);
  }
  const indications = profileText(profile);
  if (indications) parts.push(`## Indicazioni del trainer per questo cliente\n${indications}`);
  const plan = parseProject(project.data?.data);
  if (plan) parts.push(`## Progetto del cliente (fase attuale)\n${projectForAI(plan, today, today).slice(0, 1200)}`);

  // gli ultimi allenamenti: programma vs fatto
  const logs = workouts.data ?? [];
  if (logs.length) {
    const programIds = [...new Set(logs.map((w) => w.program_id))];
    const [{ data: progs }, { data: items }] = await Promise.all([
      supabase.from("programs").select("id, title, content").in("id", programIds),
      supabase.from("exercise_logs").select("workout_log_id, item_id, sets, result_text").in("workout_log_id", logs.map((w) => w.id)),
    ]);
    const progById = new Map((progs ?? []).map((p) => [p.id, p]));
    const blocks: string[] = [];
    for (const w of logs) {
      const p = progById.get(w.program_id);
      const day = p ? parseContent(p.content).days.find((d) => d.id === w.day_id) : null;
      if (!day) continue;
      const mine = (items ?? []).filter((x) => x.workout_log_id === w.id).map((x) => ({ item_id: x.item_id, sets: x.sets as unknown as SetLog[], result_text: x.result_text }));
      blocks.push(
        [
          `### ${day.title} (settimana ${w.week}), del ${w.performed_on}${w.completed ? "" : " — ancora in corso o non chiuso"}`,
          workoutVsPlan(day, w.week, mine),
          w.notes.trim() ? `Note del cliente sull'allenamento: ${w.notes.trim()}` : "",
          w.discomfort.trim() ? `Dolore o fastidio segnalato: ${w.discomfort.trim()}` : "",
        ].filter(Boolean).join("\n"),
      );
    }
    if (blocks.length) parts.push(`## Ultimi allenamenti: programma vs fatto\n${blocks.join("\n\n")}`);
  }

  // il prossimo allenamento in sequenza
  if (program.data) {
    const content = parseContent(program.data.content);
    const { data: done } = await supabase.from("workout_logs").select("week, day_id, completed").eq("program_id", program.data.id);
    const next = nextWorkout(content, program.data.weeks, done ?? []);
    if (next) {
      const rows = next.day.blocks
        .flatMap((b) => (b.kind === "text" ? [] : b.items))
        .filter((it) => it.name.trim())
        .map((it) => `${it.name} ${it.prescriptions[next.week - 1] || "—"}`);
      parts.push(`## Prossimo allenamento (${program.data.title}, settimana ${next.week} di ${program.data.weeks})\n${next.day.title}: ${rows.join("; ")}`);
    }
  }

  const k = checks.data?.[0];
  const ci = checkins.data?.[0];
  const recent = [
    k ? `- Ultimo check: ${k.check_date}, peso ${k.weight_kg ?? "—"} kg, massa grassa ${k.body_fat_pct ?? "—"}%` : "",
    ci ? `- Ultimo check-up (settimana del ${ci.week_start}, voti 1-5): allenamenti ${ci.training}, sonno ${ci.sleep}, stress ${ci.stress}, percorso ${ci.adherence}${ci.issues ? `; problemi: ${ci.issues}` : ""}` : "",
  ].filter(Boolean);
  if (recent.length) parts.push(`## Ultimi dati\n${recent.join("\n")}`);

  return parts.join("\n\n");
}
