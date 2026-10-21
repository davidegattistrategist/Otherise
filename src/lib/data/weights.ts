import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { normalizeWeights, type WeightEntry } from "@/lib/body/weights";

/** Il peso giorno per giorno di un cliente (i permessi li decide il database). */
export async function getWeights(supabase: SupabaseClient<Database>, clientId: string): Promise<WeightEntry[]> {
  const { data } = await supabase.from("weight_logs").select("log_date, kg").eq("client_id", clientId).order("log_date", { ascending: false }).limit(1000);
  return normalizeWeights(data ?? []);
}
