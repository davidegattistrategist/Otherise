import "server-only";
/**
 * Letture usate da più parti della stessa pagina (layout + pagina + funzioni
 * dei dati): con `cache` si fanno una volta sola per richiesta.
 */
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getBusinessName = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("business_name");
  return data ?? null;
});

export const getBillingOverview = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("billing_overview");
  return data ?? null;
});
