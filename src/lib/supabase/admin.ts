import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Client con la chiave "service_role": IGNORA i permessi.
 * Usarlo solo sul server, solo dopo aver controllato chi sta chiedendo,
 * e solo per ciò che l'utente non può fare da sé (inviti, notifiche, cron).
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Manca SUPABASE_SERVICE_ROLE_KEY nelle variabili d'ambiente");
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
