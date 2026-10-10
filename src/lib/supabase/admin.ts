import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseServiceKey, supabaseUrl } from "./env";

/**
 * Client con la chiave "service_role": IGNORA i permessi.
 * Usarlo solo sul server, solo dopo aver controllato chi sta chiedendo,
 * e solo per ciò che l'utente non può fare da sé (inviti, notifiche, cron).
 */
export function createAdminClient() {
  const key = supabaseServiceKey();
  if (!key) throw new Error("Manca SUPABASE_SERVICE_ROLE_KEY nelle variabili d'ambiente");
  return createClient<Database>(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
