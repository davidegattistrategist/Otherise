import "server-only";
/**
 * Linea del tempo delle note di un cliente, per lo staff.
 * - "I tuoi appunti": sessioni PT, check (note per la prossima fase), posturale.
 * - "Note del cliente": quello che scrive lui nel logbook (nota finale, note
 *   sugli esercizi, dolori) e nel diario settimanale (con la tua risposta).
 */
import type { ServerSupabase } from "../supabase/server";
import { parseContent } from "../program/types";

export type TimelineKind = "pt" | "check" | "posture" | "workout" | "diary";

export type TimelineItem = {
  id: string;
  /** giorno (AAAA-MM-GG) */
  date: string;
  kind: TimelineKind;
  title: string;
  /** testo principale */
  text: string;
  /** righe in più (es. note sugli esercizi, la tua risposta al diario) */
  lines: Array<{ label: string; text: string; tone?: "accent" }>;
  /** etichetta breve in evidenza (es. il motivo per cui l'AI te l'ha segnalata) */
  badge?: string;
  href?: string;
  /** senza data vera (check importati) */
  undated?: boolean;
};

const byDate = (a: TimelineItem, b: TimelineItem) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id);
const num = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));
const fmt = (n: number | null, unit: string) => (n === null ? null : `${String(Math.round(n * 10) / 10).replace(".", ",")} ${unit}`);

export async function getStaffTimeline(supabase: ServerSupabase, clientId: string): Promise<{ items: TimelineItem[]; privateNotes: string }> {
  const base = `/staff/clienti/${clientId}`;
  const [{ data: sessions }, { data: checks }, { data: postures }, { data: priv }, { data: programs }] = await Promise.all([
    supabase.from("pt_sessions").select("id, session_date, notes, source, counts_toward_package").eq("client_id", clientId).order("session_date", { ascending: false }).limit(150),
    supabase.from("checks").select("id, check_date, created_at, weight_kg, body_fat_pct, notes_next_phase").eq("client_id", clientId).order("created_at", { ascending: false }).limit(100),
    supabase.from("posture_assessments").select("id, assessed_on, tight_muscles, what_works, posture_work, notes, visible_to_client").eq("client_id", clientId).order("assessed_on", { ascending: false }).limit(50),
    supabase.from("client_private_notes").select("notes").eq("client_id", clientId).maybeSingle(),
    supabase.from("programs").select("id, content").eq("client_id", clientId),
  ]);
  const dayTitle = new Map<string, string>();
  for (const p of programs ?? []) for (const d of parseContent(p.content).days) dayTitle.set(`${p.id}:${d.id}`, d.title);
  const items: TimelineItem[] = [];
  for (const s of sessions ?? []) {
    const [pid, week, day] = (s.source ?? "").split(":");
    const workout = s.source ? `${dayTitle.get(`${pid}:${day}`) ?? "Allenamento"} · settimana ${week}` : null;
    items.push({
      id: `pt-${s.id}`,
      date: s.session_date,
      kind: "pt",
      title: workout ? `Sessione PT · ${workout}` : "Sessione PT · lezione libera",
      text: s.notes,
      lines: [],
      href: workout ? `${base}/allenamento/${pid}/${week}/${day}` : `${base}/sessioni?modifica=${s.id}#nuova`,
    });
  }
  for (const c of checks ?? []) {
    const metrics = [fmt(num(c.weight_kg), "kg"), num(c.body_fat_pct) !== null ? `${String(Math.round(num(c.body_fat_pct)! * 10) / 10).replace(".", ",")}% massa grassa` : null].filter(Boolean).join(" · ");
    items.push({
      id: `check-${c.id}`,
      date: c.check_date ?? c.created_at.slice(0, 10),
      undated: !c.check_date,
      kind: "check",
      title: metrics ? `Check · ${metrics}` : "Check",
      text: c.notes_next_phase,
      lines: [],
      href: `${base}/check/${c.id}`,
    });
  }
  for (const p of postures ?? []) {
    const lines = [
      { label: "Rigidi / da allungare", text: p.tight_muscles },
      { label: "Funziona bene", text: p.what_works },
      { label: "Lavori posturali", text: p.posture_work },
    ].filter((l) => l.text.trim());
    items.push({ id: `posture-${p.id}`, date: p.assessed_on, kind: "posture", title: `Valutazione posturale${p.visible_to_client ? " · la vede il cliente" : ""}`, text: p.notes, lines, href: `${base}/posturale` });
  }
  return { items: items.sort(byDate), privateNotes: priv?.notes ?? "" };
}

export async function getClientTimeline(supabase: ServerSupabase, clientId: string): Promise<TimelineItem[]> {
  const base = `/staff/clienti/${clientId}`;
  const [{ data: logs }, { data: exNotes }, { data: diaries }, { data: programs }] = await Promise.all([
    supabase.from("workout_logs").select("id, program_id, week, day_id, performed_on, notes, discomfort, note_flag, note_reason").eq("client_id", clientId).order("performed_on", { ascending: false }).limit(200),
    supabase.from("exercise_logs").select("workout_log_id, exercise_name, result_text").eq("client_id", clientId).neq("result_text", "").order("performed_on", { ascending: false }).limit(400),
    supabase.from("checkins").select("id, week_start, training, sleep, stress, adherence, issues, request, coach_reply, flagged").eq("client_id", clientId).order("week_start", { ascending: false }).limit(60),
    supabase.from("programs").select("id, content").eq("client_id", clientId),
  ]);
  const dayTitle = new Map<string, string>();
  for (const p of programs ?? []) for (const d of parseContent(p.content).days) dayTitle.set(`${p.id}:${d.id}`, d.title);
  const exBy = new Map<string, Array<{ name: string; text: string }>>();
  for (const e of exNotes ?? []) exBy.set(e.workout_log_id, [...(exBy.get(e.workout_log_id) ?? []), { name: e.exercise_name, text: e.result_text }]);
  const items: TimelineItem[] = [];
  for (const l of logs ?? []) {
    const ex = exBy.get(l.id) ?? [];
    if (!l.notes.trim() && !l.discomfort.trim() && !ex.length) continue;
    const lines: TimelineItem["lines"] = ex.map((e) => ({ label: e.name, text: e.text }));
    if (l.discomfort.trim()) lines.unshift({ label: "Dolore o fastidio", text: l.discomfort, tone: "accent" });
    items.push({
      id: `log-${l.id}`,
      date: l.performed_on,
      kind: "workout",
      title: `${dayTitle.get(`${l.program_id}:${l.day_id}`) ?? "Allenamento"} · settimana ${l.week}`,
      text: l.notes,
      lines,
      badge: l.note_flag ? l.note_reason || "Da leggere" : undefined,
      href: `${base}/allenamento/${l.program_id}/${l.week}/${l.day_id}`,
    });
  }
  for (const d of diaries ?? []) {
    const lines: TimelineItem["lines"] = [];
    if (d.issues.trim()) lines.push({ label: "Dolori, fastidi o imprevisti", text: d.issues, tone: "accent" });
    if (d.request.trim()) lines.push({ label: "Ti ha chiesto", text: d.request });
    if (d.coach_reply.trim()) lines.push({ label: "Hai risposto", text: d.coach_reply });
    items.push({
      id: `diary-${d.id}`,
      date: d.week_start,
      kind: "diary",
      title: "Diario della settimana",
      text: `Allenamenti ${d.training}/5 · sonno ${d.sleep}/5 · stress ${d.stress}/5 · percorso ${d.adherence}/5`,
      lines,
      badge: d.flagged ? "Da guardare" : undefined,
      href: `${base}/diario`,
    });
  }
  return items.sort(byDate);
}
