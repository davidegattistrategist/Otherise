import "server-only";
import type { ServerSupabase } from "../supabase/server";
import { addDays, todayISO } from "../dates";
import { buildForecast, renewalRateFrom, type ForecastPlan } from "../forecast";
import type { PlanKind } from "../billing";

/** Previsione degli incassi per i clienti attivi (solo titolare). */
export async function getForecast(supabase: ServerSupabase, months: number) {
  const today = todayISO();
  const [{ data: clients }, { data: billing }, { data: plans }, { data: sessions }, { data: payments }] = await Promise.all([
    supabase.from("clients").select("id, first_name, last_name, status").eq("status", "active"),
    supabase.rpc("billing_overview"),
    supabase.from("payment_plans").select("client_id, kind, amount, package_sessions").eq("active", true),
    supabase.from("pt_sessions").select("client_id, session_date").eq("counts_toward_package", true).gte("session_date", addDays(today, -84)),
    supabase.from("payments").select("client_id, paid_on, period_end").gte("paid_on", addDays(today, -420)),
  ]);
  const billBy = new Map((billing ?? []).map((b) => [b.client_id, b]));
  const planBy = new Map((plans ?? []).map((p) => [p.client_id, p]));
  const input: ForecastPlan[] = [];
  for (const c of clients ?? []) {
    const plan = planBy.get(c.id);
    if (!plan) continue;
    const b = billBy.get(c.id);
    input.push({
      clientId: c.id,
      name: `${c.first_name} ${c.last_name}`.trim(),
      kind: plan.kind as PlanKind,
      amount: Number(plan.amount),
      paidUntil: b?.paid_until ?? null,
      packageSessions: plan.package_sessions,
      sessionsLeft: b ? b.sessions_bought - b.sessions_used : null,
      recentSessions: (sessions ?? []).filter((s) => s.client_id === c.id).map((s) => s.session_date),
    });
  }
  const renewal = renewalRateFrom(payments ?? [], today);
  return { ...buildForecast(input, today, months, renewal.rate), renewal, clients: input.length };
}
