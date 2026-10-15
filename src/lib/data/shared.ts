import "server-only";
/**
 * Letture usate da più parti della stessa pagina (layout + pagina + funzioni
 * dei dati): con `cache` si fanno una volta sola per richiesta.
 */
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCachedBusinessName } from "./cached";

/** Nome dell'attività: in memoria sul server (cambia solo dalle Impostazioni). */
export const getBusinessName = getCachedBusinessName;

export const getBillingOverview = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("billing_overview");
  return data ?? null;
});
