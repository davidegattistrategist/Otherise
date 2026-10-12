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
import { balanceText, programBalance } from "../program/balance";
import { profileText } from "../ai-profile";
import { checkLabel, sortChecks } from "../check-order";
import { getAiProfile } from "../data/ai-profile";

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


/**
 * @param reference il programma da cui parte la bozza: se ha esercizi, l'AI riceve
 *   anche "com'è fatto" (serie per gruppo, accosciata/hinge, minuti stimati).
 */
export async function buildClientContext(
  supabase: ServerSupabase,
  clientId: string,
  excludeProgramId?: string,
  reference?: ProgramContent,
  /** date del programma che si sta preparando: il progetto si legge su quei mesi */
  period?: { start: string | null; weeks: number },
) {
  const today = todayISO();
  const since = addDays(today, -16 * 7);
  const [client, programs, logs, checks, posture, checkins, pt, project, aiProfile] = await Promise.all([
    supabase.from("clients").select("sex, birth_date, goals, start_date, phase_weeks").eq("id", clientId).single(),
    supabase.from("programs").select("id, title, weeks, start_date, status, content").eq("client_id", clientId).neq("status", "draft").order("start_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(3),
    supabase.from("exercise_logs").select("exercise_name, performed_on, week, sets, result_text").eq("client_id", clientId).gte("performed_on", since).order("performed_on"),
    supabase.from("checks").select("check_date, sequence, created_at, order_hint, weight_kg, body_fat_pct, lean_mass_kg, fat_mass_kg, circumferences, strength_tests, tests_text, notes_next_phase").eq("client_id", clientId).limit(300),
    supabase.from("posture_assessments").select("assessed_on, tight_muscles, what_works, posture_work, notes").eq("client_id", clientId).order("assessed_on", { ascending: false }).limit(2),
    supabase.from("checkins").select("week_start, training, sleep, stress, adherence, issues, request").eq("client_id", clientId).order("week_start", { ascending: false }).limit(4),
    supabase.from("pt_sessions").select("session_date, notes").eq("client_id", clientId).order("session_date", { ascending: false }).limit(6),
    supabase.from("client_projects").select("data").eq("client_id", clientId).maybeSingle(),
    getAiProfile(supabase, clientId),
  ]);

  const parts: string[] = [];
  const c = client.data;
  if (c) {
    const age = ageOn(c.birth_date, today);
    parts.push(`## Cliente\nSesso: ${c.sex === "F" ? "donna" : c.sex === "M" ? "uomo" : "non indicato"}${age ? `, ${age} anni` : ""}. In percorso dal ${c.start_date}.\nObiettivi: ${c.goals || "non indicati"}\nDurata delle fasi del suo piano: ${c.phase_weeks ? `${c.phase_weeks} settimane` : "non ancora decisa (di solito 4 settimane)"}.`);
  }
  const indications = profileText(aiProfile);
  if (indications) parts.push(`## Indicazioni del trainer per questo cliente\n${indications}`);

  // prima di tutto: cosa il trainer ha già deciso di fare in questa fase
  // dal più recente: lo storico importato (anche senza data) e poi i check dell'app
  const recentChecks = sortChecks(checks.data ?? []).reverse().slice(0, 4);
  const lastNotes = recentChecks.find((k) => k.notes_next_phase?.trim());
  const lastPosture = (posture.data ?? [])[0];
  const todo = [
    lastNotes ? `- Note prese all'ultimo check (${lastNotes.check_date ?? checkLabel(lastNotes)}) per la fase successiva, cioè QUESTA: ${lastNotes.notes_next_phase!.trim()}` : "",
    lastPosture?.posture_work?.trim() ? `- Lavori posturali dall'ultima valutazione (${lastPosture.assessed_on}), inseriscili come indicato (se non è indicato dove, nel blocco iniziale): ${lastPosture.posture_work.trim()}` : "",
  ].filter(Boolean);
  if (todo.length) parts.push(`## Da applicare in questo programma (deciso dal trainer)\n${todo.join("\n")}`);

  const plan = parseProject(project.data?.data);
  if (plan) {
    const start = period?.start ?? today;
    const end = period?.start ? addDays(start, period.weeks * 7 - 1) : undefined;
    parts.push(`## Progetto annuale scritto dal trainer (segui la fase e gli stimoli dei mesi del programma)\n${projectForAI(plan, start, end)}`);
  }

  const past = (programs.data ?? []).filter((p) => p.id !== excludeProgramId);
  // com'è fatto il programma di partenza (o, se è vuoto, l'ultimo pubblicato)
  const hasItems = (c?: ProgramContent | null) => Boolean(c?.days.some((d) => d.blocks.some((b) => b.items.some((it) => it.name.trim()))));
  const base = hasItems(reference) ? reference! : past[0] ? parseContent(past[0].content) : null;
  if (base && hasItems(base)) {
    parts.push(`## Com'è fatto il programma di partenza (mantieni questi rapporti)\n${balanceText(programBalance(base))}`);
  }
  if (past.length) {
    parts.push(
      "## Programmi precedenti (dal più recente)\n" +
        past.map((p) => `${p.start_date ? `Inizio ${p.start_date}` : "Fase passata (data non registrata)"}\n${programToText(p.title, p.weeks, parseContent(p.content))}`).join("\n\n"),
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

  if (recentChecks.length) {
    parts.push(
      "## Check (dal più recente)\n" +
        recentChecks
          .map((k) => {
            const tests = (k.strength_tests as Array<{ exercise?: string; load?: number; reps?: number; rpe?: number; e1rm?: number }> | null) ?? [];
            const testTxt = tests.filter((t) => t.exercise).map((t) => `${t.exercise} ${t.load ?? "?"}kg×${t.reps ?? "?"}${t.rpe ? ` @RPE${t.rpe}` : ""}${t.e1rm ? ` (e1RM ${t.e1rm})` : ""}`).join(", ");
            return [
              `- ${k.check_date ?? checkLabel(k)}: peso ${k.weight_kg ?? "—"} kg, massa grassa ${k.body_fat_pct ?? "—"}%, massa magra ${k.lean_mass_kg ?? "—"} kg`,
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
    supabase.from("programs").select("title, weeks, content").eq("is_ai_example", true).order("updated_at", { ascending: false }).limit(3),
    supabase.from("exercises").select("id, name").eq("archived", false).order("name"),
  ]);
  return {
    method: settings?.coaching_method?.trim() || "",
    examples: (examples ?? []).map((e) => programToText(e.title, e.weeks, parseContent(e.content))),
    exercises: exercises ?? [],
  };
}
