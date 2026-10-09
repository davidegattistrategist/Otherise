import "server-only";
import type { ServerSupabase } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import type { AiUsage } from "./claude";

function monthStart() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

/** Messaggio d'errore se il tetto di spesa AI del mese è raggiunto, altrimenti null. */
export async function budgetExceeded(supabase: ServerSupabase): Promise<string | null> {
  const [{ data: settings }, { data: spent }] = await Promise.all([
    supabase.from("app_settings").select("ai_monthly_budget_eur").maybeSingle(),
    supabase.from("ai_requests").select("cost_eur").gte("created_at", monthStart()),
  ]);
  const budget = Number(settings?.ai_monthly_budget_eur ?? 20);
  const used = (spent ?? []).reduce((a, r) => a + Number(r.cost_eur), 0);
  return used >= budget ? `Raggiunto il tetto di spesa AI del mese (${budget.toFixed(0)} €). Si può alzare in Impostazioni.` : null;
}

export async function logAiRequest(userId: string, clientId: string | null, kind: string, usage: AiUsage) {
  await createAdminClient().from("ai_requests").insert({
    created_by: userId, client_id: clientId, kind, model: usage.model,
    input_tokens: usage.input, output_tokens: usage.output, cost_eur: Number(usage.costEur.toFixed(4)),
  });
}
