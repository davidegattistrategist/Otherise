import "server-only";
/**
 * Tutto quello che l'assistente AI deve sapere su un cliente per preparare
 * il programma: storico dei programmi, logbook reale, check, posturale,
 * check-up e note di sessione. Nome e cognome NON vengono mai inviati.
 */
import type { ServerSupabase } from "../supabase/server";
import { addDays, ageOn, todayISO } from "../dates";
import { blockSummary, BLOCK_KIND_LABELS, itemLabel, parseContent, type ProgramContent } from "../program/types";
import { summarizeSets, type SetLog } from "../program/prescription";
import { parseProject, projectForAI } from "../project";

/** Programma in testo leggibile e compatto (per esempi e storico). */
export function programToText(title: string, weeks: number, content: ProgramContent): string {
  const lines: string[] = [`Programma "${title}" (${weeks} settimane)`];
  for (const day of content.days) {
    lines.push(`- ${day.title}${day.notes ? ` (${day.notes})` : ""}`);
    day.blocks.forEach((b, bi) => {
      if (b.kind === "text") {
        lines.push(`  ${b.title || "Testo"}: ${b.notes}`);
        return;
      }
      if (b.kind !== "single") lines.push(`  Blocco ${BLOCK_KIND_LABELS[b.kind]}${b.title ? ` "${b.title}"` : ""}: ${blockSummary(b)}${b.notes ? ` — ${b.notes}` : ""}`);
      b.items.forEach((it, ii) => {
        const weeksTxt = it.prescriptions.map((p, w) => `S${w + 1}: ${p || "—"}`).join(" | ");
        lines.push(`    ${itemLabel(b, bi, ii)} ${it.name}${it.rest ? ` [rec ${it.rest}]` : ""} → ${weeksTxt}${it.notes ? ` (indicazioni: ${it.notes})` : ""}`);
      });
    });
  }
  return lines.join("\n");
}

export const AI_OPT_OUT_MESSAGE = "Questo cliente ha chiesto di non usare l'assistente AI con i suoi dati: per lui l'AI è disattivata.";

export async function buildClientContext(supabase: ServerSupabase, clientId: string, excludeProgramId?: string) {
  const today = todayISO();
  const since = addDays(today, -16 * 7);
  const [client, programs, logs, checks, posture, checkins, pt, project] = await Promise.all([
    supabase.from("clients").select("sex, birth_date, goals, start_date, phase_weeks").eq("id", clientId).single(),
    supabase.from("programs").select("id, title, weeks, start_date, status, content").eq("client_id", clientId).neq("status", "draft").order("start_date", { ascending: false }).limit(3),
    supabase.from("exercise_logs").select("exercise_name, performed_on, week, sets, result_text").eq("client_id", clientId).gte("performed_on", since).order("performed_on"),
    supabase.from("checks").select("check_date, weight_kg, body_fat_pct, lean_mass_kg, fat_mass_kg, circumferences, strength_tests, tests_text, notes_next_phase").eq("client_id", clientId).order("check_date", { ascending: false }).limit(3),
    supabase.from("posture_assessments").select("assessed_on, tight_muscles, what_works, posture_work, notes").eq("client_id", clientId).order("assessed_on", { ascending: false }).limit(2),
    supabase.from("checkins").select("week_start, training, sleep, stress, adherence, issues, request").eq("client_id", clientId).order("week_start", { ascending: false }).limit(4),
    supabase.from("pt_sessions").select("session_date, notes").eq("client_id", clientId).order("session_date", { ascending: false }).limit(6),
    supabase.from("client_projects").select("data").eq("client_id", clientId).maybeSingle(),
  ]);

  const parts: string[] = [];
  const c = client.data;
  if (c) {
    const age = ageOn(c.birth_date, today);
    parts.push(`## Cliente\nSesso: ${c.sex === "F" ? "donna" : "uomo"}${age ? `, ${age} anni` : ""}. In percorso dal ${c.start_date}.\nObiettivi: ${c.goals || "non indicati"}\nDurata delle fasi del suo piano: ${c.phase_weeks} settimane.`);
  }
  const plan = parseProject(project.data?.data);
  if (plan) {
    parts.push(`## Progetto annuale scritto dal trainer (segui la fase e gli stimoli del mese)\n${projectForAI(plan, today)}`);
  }

  const past = (programs.data ?? []).filter((p) => p.id !== excludeProgramId);
  if (past.length) {
    parts.push(
      "## Programmi precedenti (dal più recente)\n" +
        past.map((p) => `Inizio ${p.start_date}\n${programToText(p.title, p.weeks, parseContent(p.content))}`).join("\n\n"),
    );
  }

  if (logs.data?.length) {
    const byExercise = new Map<string, string[]>();
    for (const l of logs.data) {
      const v = summarizeSets(l.sets as unknown as SetLog[]) ?? l.result_text;
      if (!v) continue;
      const arr = byExercise.get(l.exercise_name) ?? [];
      arr.push(`${l.performed_on}: ${v}${l.result_text && summarizeSets(l.sets as unknown as SetLog[]) ? ` (${l.result_text})` : ""}`);
      byExercise.set(l.exercise_name, arr);
    }
    parts.push(
      "## Logbook reale del cliente (ultime 16 settimane)\n" +
        [...byExercise.entries()].map(([name, v]) => `- ${name}: ${v.slice(-8).join("; ")}`).join("\n"),
    );
  } else {
    parts.push("## Logbook\nIl cliente non ha registrato sessioni di recente.");
  }

  if (checks.data?.length) {
    parts.push(
      "## Check (dal più recente)\n" +
        checks.data
          .map((k) => {
            const tests = (k.strength_tests as Array<{ exercise?: string; load?: number; reps?: number; rpe?: number; e1rm?: number }> | null) ?? [];
            const testTxt = tests.filter((t) => t.exercise).map((t) => `${t.exercise} ${t.load ?? "?"}kg×${t.reps ?? "?"}${t.rpe ? ` @RPE${t.rpe}` : ""}${t.e1rm ? ` (e1RM ${t.e1rm})` : ""}`).join(", ");
            return [
              `- ${k.check_date}: peso ${k.weight_kg ?? "—"} kg, massa grassa ${k.body_fat_pct ?? "—"}%, massa magra ${k.lean_mass_kg ?? "—"} kg`,
              testTxt ? `  Test di forza: ${testTxt}` : "",
              k.tests_text ? `  Altri test: ${k.tests_text}` : "",
              k.notes_next_phase ? `  Note per la fase successiva: ${k.notes_next_phase}` : "",
            ].filter(Boolean).join("\n");
          })
          .join("\n"),
    );
  }

  if (posture.data?.length) {
    parts.push(
      "## Valutazione posturale\n" +
        posture.data
          .map((p) => `- ${p.assessed_on}: rigidi/da allungare: ${p.tight_muscles || "—"}; funziona bene: ${p.what_works || "—"}; lavori posturali: ${p.posture_work || "—"}${p.notes ? `; note: ${p.notes}` : ""}`)
          .join("\n"),
    );
  }

  if (checkins.data?.length) {
    parts.push(
      "## Check-up settimanali (voti 1–5)\n" +
        checkins.data
          .map((k) => `- settimana del ${k.week_start}: allenamenti ${k.training}, sonno ${k.sleep}, stress ${k.stress}, percorso ${k.adherence}${k.issues ? `; problemi: ${k.issues}` : ""}${k.request ? `; richiesta: ${k.request}` : ""}`)
          .join("\n"),
    );
  }

  const ptNotes = (pt.data ?? []).filter((s) => s.notes.trim());
  if (ptNotes.length) {
    parts.push("## Note delle ultime sessioni con l'allenatore\n" + ptNotes.map((s) => `- ${s.session_date}: ${s.notes}`).join("\n"));
  }

  return parts.join("\n\n");
}

export async function buildMethodContext(supabase: ServerSupabase) {
  const [{ data: settings }, { data: examples }, { data: exercises }] = await Promise.all([
    supabase.from("app_settings").select("coaching_method").maybeSingle(),
    supabase.from("programs").select("title, weeks, content, clients(ai_opt_out)").eq("is_ai_example", true).order("updated_at", { ascending: false }).limit(6),
    supabase.from("exercises").select("id, name").eq("archived", false).order("name"),
  ]);
  return {
    method: settings?.coaching_method?.trim() || "",
    // i programmi dei clienti che hanno chiesto di non usare l'AI non fanno da esempio
    examples: (examples ?? [])
      .filter((e) => !(e.clients as unknown as { ai_opt_out: boolean } | null)?.ai_opt_out)
      .slice(0, 3)
      .map((e) => programToText(e.title, e.weeks, parseContent(e.content))),
    exercises: exercises ?? [],
  };
}
