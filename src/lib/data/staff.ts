import "server-only";
import { bySurname, listName } from "../names";
import { checkDue } from "../check-due";
import type { ServerSupabase } from "../supabase/server";
import type { Me } from "../auth";
import { billingStatus, type BillingRow, type BillingStatus, type PlanKind } from "../billing";
import { diffDays, todayISO, type ISODate } from "../dates";
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
  lastCheck: ISODate | null;
  /** Almeno un check registrato nell'app (non importato dallo storico) */
  checksInApp: boolean;
  lastLog: ISODate | null;
  billing: BillingStatus | null;
  /** Allenamenti registrati sugli attesi negli ultimi 14 giorni (null se non c'è un programma in corso da almeno una settimana) */
  compliance: Compliance | null;
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

  const [programs, checks, logs, coaches, billing, settings] = await Promise.all([
    supabase.from("programs").select("id, client_id, title, weeks, start_date, status, content").in("client_id", ids).in("status", ["published", "draft"]).order("start_date", { ascending: false }),
    supabase.from("checks").select("client_id, check_date, imported").in("client_id", ids).not("check_date", "is", null).order("check_date", { ascending: false }),
    supabase.from("workout_logs").select("client_id, performed_on, completed").in("client_id", ids).order("performed_on", { ascending: false }).limit(2000),
    supabase.from("profiles").select("id, full_name").in("role", ["owner", "coach"]),
    me.role === "owner" ? supabase.rpc("billing_overview") : Promise.resolve({ data: null }),
    supabase.from("app_settings").select("reminder_days").maybeSingle(),
  ]);
  const reminderDays = settings.data?.reminder_days ?? 7;
  const coachName = new Map((coaches.data ?? []).map((p) => [p.id, p.full_name]));
  const firstBy = <T extends { client_id: string | null }>(rows: T[] | null | undefined) => {
    const m = new Map<string, T>();
    for (const r of rows ?? []) if (r.client_id && !m.has(r.client_id)) m.set(r.client_id, r);
    return m;
  };
  const lastCheck = firstBy(checks.data);
  // con chi i check si fanno nell'app (lo storico importato non conta)
  const appChecks = new Set((checks.data ?? []).filter((k) => !k.imported).map((k) => k.client_id));
  const lastLog = firstBy(logs.data);
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
      const days = ((current.content as { days?: unknown[] } | null)?.days ?? []).length;
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
      lastCheck: lastCheck.get(c.id)?.check_date ?? null,
      checksInApp: appChecks.has(c.id),
      lastLog: lastLog.get(c.id)?.performed_on ?? null,
      compliance: comp,
      billing: me.role === "owner" && c.status !== "paused" ? billingStatus(b ? ({ ...b, kind: b.kind as PlanKind } as BillingRow) : null, today, reminderDays) : null,
    };
  });
}

export type TodayItem = { clientId: string; clientName: string; text: string; href: string; tone: "accent" | "ink" };

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
        training.push({ clientId: c.id, clientName: c.fullName, text: since === null ? "Non ha ancora registrato allenamenti" : since === 1 ? "Nessun allenamento registrato da ieri" : `Nessun allenamento registrato da ${since} giorni`, href: `/staff/clienti/${c.id}`, tone: "accent" });
      } else if (comp.pct !== null && comp.pct < 50) {
        training.push({ clientId: c.id, clientName: c.fullName, text: `Costanza ${comp.pct}% nelle ultime 2 settimane`, href: `/staff/clienti/${c.id}`, tone: "ink" });
      }
    }
    if (c.billing && (c.billing.state === "due_soon" || c.billing.state === "overdue")) {
      payments.push({ clientId: c.id, clientName: c.fullName, text: c.billing.label, href: `/staff/clienti/${c.id}/pagamenti`, tone: c.billing.state === "overdue" ? "accent" : "ink" });
    }
    if (!c.program) {
      programs.push({ clientId: c.id, clientName: c.fullName, text: c.draftCount ? "Bozza di programma da pubblicare" : "Nessun programma pubblicato", href: `/staff/clienti/${c.id}/programma`, tone: "accent" });
    } else {
      const left = diffDays(today, c.program.endDate);
      if (c.program.state === "finished") programs.push({ clientId: c.id, clientName: c.fullName, text: -left === 1 ? "Programma finito ieri" : `Programma finito da ${-left} giorni`, href: `/staff/clienti/${c.id}/programma`, tone: "accent" });
      else if (left <= 7) programs.push({ clientId: c.id, clientName: c.fullName, text: left === 0 ? "Il programma finisce oggi" : left === 1 ? "Il programma finisce domani" : `Il programma finisce tra ${left} giorni`, href: `/staff/clienti/${c.id}/programma`, tone: "ink" });
    }
    const due = checkDue(c, today);
    if (due) checks.push({ clientId: c.id, clientName: c.fullName, text: due.text, href: `/staff/clienti/${c.id}/check/nuovo`, tone: due.late ? "accent" : "ink" });
  }
  return { payments, programs, checks, training };
}
