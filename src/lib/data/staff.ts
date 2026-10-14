import "server-only";
import { latestDate } from "@/lib/free-workout";
import { rpcOr } from "./rpc";
import { getBillingOverview } from "@/lib/data/shared";
import { bySurname, listName } from "../names";
import { checkDue } from "../check-due";
import type { ServerSupabase } from "../supabase/server";
import type { Me } from "../auth";
import { billingStatus, isCoaching, withUnpaidRows, type BillingRow, type BillingStatus, type PlanKind, type UnpaidRow } from "../billing";
import { getUnpaidRows } from "./billing";
import { addDays, diffDays, todayISO, type ISODate } from "../dates";
import { displayWeek, programEndDate, weekPosition } from "../program/schedule";
import { compliance, type Compliance } from "../compliance";

export type ClientRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  sex: "M" | "F" | null;
  status: string;
  coach_id: string | null;
  user_id: string | null;
  weekly_checkin: boolean;
  birth_date: string | null;
  free: boolean;
};

export type ClientOverview = ClientRow & {
  fullName: string;
  coachName: string | null;
  program: { id: string; title: string; week: number; weeks: number; endDate: ISODate; state: "running" | "not_started" | "finished" } | null;
  draftCount: number;
  /** C'è già la fase dopo: un programma pubblicato che parte dopo quello in corso */
  nextProgram: boolean;
  lastCheck: ISODate | null;
  /** Almeno un check registrato nell'app (non importato dallo storico) */
  checksInApp: boolean;
  lastLog: ISODate | null;
  billing: BillingStatus | null;
  /** Allenamenti registrati sugli attesi negli ultimi 14 giorni (null se non c'è un programma in corso da almeno una settimana) */
  compliance: Compliance | null;
  /** In coaching (piano a periodo, o senza piano ma con dei programmi): solo a loro serve un programma */
  coaching: boolean;
};

/** Nome negli elenchi dello staff: prima il cognome. */
export function fullName(c: { first_name: string; last_name: string }) {
  return listName(c);
}

/** Tutti i clienti visibili allo staff collegato, con programma in corso, ultimo check, ultima sessione e pagamenti. */
export async function getClientsOverview(supabase: ServerSupabase, me: Me, opts: { includeArchived?: boolean } = {}): Promise<ClientOverview[]> {
  const today = todayISO();
  let q = supabase
    .from("clients")
    .select("id, first_name, last_name, email, sex, status, coach_id, user_id, weekly_checkin, birth_date, free")
    .order("last_name")
    .order("first_name");
  if (!opts.includeArchived) q = q.neq("status", "archived");
  const { data: rows } = await q;
  if (!rows?.length) return [];
  const clients = [...rows].sort(bySurname);
  const ids = clients.map((c) => c.id);

  type ProgramRow = { id: string; client_id: string; title: string; weeks: number; start_date: string | null; status: string; days_count: number };
  // dal database: solo quanti giorni ha ogni programma (non tutto il contenuto),
  // l'ultimo check e l'ultima attività di ogni cliente (non migliaia di righe)
  const [programList, checkList, logs, coaches, billing, settings, planKinds, anyProgram, unpaidBy, activity] = await Promise.all([
    rpcOr<ProgramRow[]>(supabase.rpc("programs_overview", { ids }), async () => {
      const { data } = await supabase.from("programs").select("id, client_id, title, weeks, start_date, status, content").in("client_id", ids).in("status", ["published", "draft"]).order("start_date", { ascending: false });
      return (data ?? []).map(({ content, ...p }) => ({ ...p, client_id: p.client_id!, days_count: ((content as { days?: unknown[] } | null)?.days ?? []).length }));
    }),
    rpcOr<Array<{ client_id: string; last_check: string | null; in_app: boolean | null }>>(supabase.rpc("last_checks"), async () => {
      const { data } = await supabase.from("checks").select("client_id, check_date, imported").in("client_id", ids).not("check_date", "is", null).order("check_date", { ascending: false });
      const by = new Map<string, { client_id: string; last_check: string | null; in_app: boolean }>();
      for (const k of data ?? []) {
        const cur = by.get(k.client_id) ?? { client_id: k.client_id, last_check: k.check_date, in_app: false };
        if (!k.imported) cur.in_app = true;
        by.set(k.client_id, cur);
      }
      return [...by.values()];
    }),
    // per la costanza bastano le ultime settimane
    supabase.from("workout_logs").select("client_id, performed_on, completed").in("client_id", ids).gte("performed_on", addDays(today, -30)).order("performed_on", { ascending: false }).limit(1000),
    supabase.from("profiles").select("id, full_name").in("role", ["owner", "coach"]),
    me.role === "owner" ? getBillingOverview().then((data) => ({ data })) : Promise.resolve({ data: null }),
    supabase.from("app_settings").select("reminder_days").maybeSingle(),
    supabase.rpc("client_plan_kinds"),
    supabase.from("programs").select("client_id").in("client_id", ids),
    me.role === "owner" ? getUnpaidRows(supabase) : Promise.resolve(new Map<string, UnpaidRow[]>()),
    rpcOr<Array<{ client_id: string; last_workout: string | null; last_free: string | null }>>(supabase.rpc("last_activity"), async () => {
      const [{ data: w }, { data: f }] = await Promise.all([
        supabase.from("workout_logs").select("client_id, performed_on").in("client_id", ids).order("performed_on", { ascending: false }).limit(1000),
        supabase.from("free_workouts").select("client_id, performed_on").in("client_id", ids).order("performed_on", { ascending: false }).limit(1000),
      ]);
      return [...(w ?? []).map((l) => ({ client_id: l.client_id, last_workout: l.performed_on, last_free: null })), ...(f ?? []).map((l) => ({ client_id: l.client_id, last_workout: null, last_free: l.performed_on }))];
    }),
  ]);
  const programs = { data: programList };
  const planKindBy = new Map((planKinds.data ?? []).map((p) => [p.client_id, p.kind as PlanKind]));
  const withPrograms = new Set((anyProgram.data ?? []).map((p) => p.client_id));
  const reminderDays = settings.data?.reminder_days ?? 7;
  const coachName = new Map((coaches.data ?? []).map((p) => [p.id, p.full_name]));
  const lastCheck = new Map(checkList.map((k) => [k.client_id, { check_date: k.last_check }]));
  // con chi i check si fanno nell'app (lo storico importato non conta)
  const appChecks = new Set(checkList.filter((k) => k.in_app).map((k) => k.client_id));
  // ultima attività: allenamento del programma o allenamento libero (spinning, corsa…)
  const lastLog = new Map<string, { performed_on: string | null }>();
  for (const a of activity) lastLog.set(a.client_id, { performed_on: latestDate(a.last_workout, a.last_free, lastLog.get(a.client_id)?.performed_on) });
  const billingBy = new Map((billing.data ?? []).map((b) => [b.client_id, b]));

  return clients.map((c) => {
    const progs = (programs.data ?? []).filter((p) => p.client_id === c.id);
    const published = progs.filter((p) => p.status === "published" && p.start_date);
    // il programma "in corso": quello iniziato più di recente, altrimenti il prossimo
    const started = published.filter((p) => p.start_date! <= today);
    const current = started[0] ?? published[published.length - 1] ?? null;
    let program: ClientOverview["program"] = null;
    if (current?.start_date) {
      const pos = weekPosition(current.start_date, current.weeks, today);
      program = {
        id: current.id,
        title: current.title,
        weeks: current.weeks,
        week: displayWeek(current.start_date, current.weeks, today),
        endDate: programEndDate(current.start_date, current.weeks),
        state: pos.state,
      };
    }
    const b = billingBy.get(c.id);
    let comp: Compliance | null = null;
    if (current?.start_date && program?.state === "running") {
      const days = current.days_count;
      comp = compliance({
        today,
        windowDays: 14,
        sessionsPerWeek: days,
        programStart: current.start_date,
        programEnd: programEndDate(current.start_date, current.weeks),
        completedDates: (logs.data ?? []).filter((l) => l.client_id === c.id && l.completed).map((l) => l.performed_on),
        lastLog: lastLog.get(c.id)?.performed_on ?? null,
      });
    }
    return {
      ...(c as ClientRow),
      fullName: fullName(c),
      coachName: c.coach_id ? coachName.get(c.coach_id) ?? null : null,
      program,
      draftCount: progs.filter((p) => p.status === "draft").length,
      nextProgram: Boolean(current?.start_date && current.start_date <= today && published.some((p) => p.start_date! > today)),
      lastCheck: lastCheck.get(c.id)?.check_date ?? null,
      checksInApp: appChecks.has(c.id),
      lastLog: lastLog.get(c.id)?.performed_on ?? null,
      compliance: comp,
      coaching: isCoaching(planKindBy.get(c.id) ?? null, withPrograms.has(c.id)),
      billing: me.role === "owner" && c.status !== "paused" ? withUnpaidRows(billingStatus(b ? ({ ...b, kind: b.kind as PlanKind } as BillingRow) : null, today, reminderDays), unpaidBy.get(c.id) ?? [], today) : null,
    };
  });
}

/** Una riga di Oggi; `action` = il pulsante per farlo subito ("check" = avvia la modalità check). */
export type TodayItem = { clientId: string; clientName: string; text: string; href: string; tone: "accent" | "ink"; action?: { label: string; href: string } | "check" };

/** Le cose da fare oggi per lo staff, in ordine di urgenza. */
export function buildTodayList(clients: ClientOverview[], today: ISODate = todayISO()) {
  const payments: TodayItem[] = [];
  const programs: TodayItem[] = [];
  const checks: TodayItem[] = [];
  const training: TodayItem[] = [];
  for (const c of clients) {
    if (c.status !== "active") continue;
    const comp = c.compliance;
    if (comp) {
      const since = comp.daysSinceLast;
      if (c.user_id && (since === null || since >= 7) && (comp.expected ?? 0) > 0) {
        training.push({ clientId: c.id, clientName: c.fullName, text: since === null ? "Non ha ancora registrato allenamenti" : since === 1 ? "Nessun allenamento registrato da ieri" : `Nessun allenamento registrato da ${since} giorni`, href: `/staff/clienti/${c.id}`, tone: "accent", action: { label: "Scrivi", href: `/staff/messaggi/${c.id}?promemoria=saluto` } });
      } else if (comp.pct !== null && comp.pct < 50) {
        training.push({ clientId: c.id, clientName: c.fullName, text: `Costanza ${comp.pct}% nelle ultime 2 settimane`, href: `/staff/clienti/${c.id}`, tone: "ink" });
      }
    }
    if (c.billing && (c.billing.state === "due_soon" || c.billing.state === "overdue")) {
      payments.push({ clientId: c.id, clientName: c.fullName, text: c.billing.label, href: `/staff/clienti/${c.id}/pagamenti`, tone: c.billing.state === "overdue" ? "accent" : "ink" });
    }
    // Programmi: solo chi ha una bozza, un programma finito o che finisce entro 7 giorni (e non ha già la fase dopo)
    const programHref = `/staff/clienti/${c.id}/programma`;
    if (c.draftCount) {
      programs.push({ clientId: c.id, clientName: c.fullName, text: "Bozza di programma da pubblicare", href: programHref, tone: "accent", action: { label: "Apri la bozza", href: programHref } });
    } else if (c.coaching && c.program && !c.nextProgram && c.program.state !== "not_started") {
      const left = diffDays(today, c.program.endDate);
      if (c.program.state === "finished") programs.push({ clientId: c.id, clientName: c.fullName, text: -left === 1 ? "Programma finito ieri" : `Programma finito da ${-left} giorni`, href: programHref, tone: "accent", action: { label: "Prepara la fase", href: programHref } });
      else if (left <= 7) programs.push({ clientId: c.id, clientName: c.fullName, text: left === 0 ? "Il programma finisce oggi" : left === 1 ? "Il programma finisce domani" : `Il programma finisce tra ${left} giorni`, href: programHref, tone: "ink", action: { label: "Prepara la fase", href: programHref } });
    }
    const due = checkDue(c, today);
    if (due) checks.push({ clientId: c.id, clientName: c.fullName, text: due.text, href: `/staff/clienti/${c.id}/check`, tone: due.late ? "accent" : "ink", action: "check" });
  }
  return { payments, programs, checks, training };
}
