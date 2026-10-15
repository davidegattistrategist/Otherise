import "server-only";
/**
 * Modalità check: mentre fai un check l'app mostra solo quello che serve su
 * quel cliente (misure, confronti, appunti, programma, pagamenti). Lo stato è
 * una riga della tabella `drafts` della persona (chiave "modalita-check"),
 * così telefono e computer entrano ed escono insieme: /api/live la legge e
 * LiveProvider porta l'altro dispositivo dentro (o fuori) da solo.
 */
import type { ServerSupabase } from "./supabase/server";
import type { Json } from "./supabase/database.types";
import { CHECK_MODE_KEY, parseCheckMode, type CheckMode } from "./check-mode-key";
export { CHECK_MODE_KEY, parseCheckMode, type CheckMode };

export async function getCheckMode(supabase: ServerSupabase, userId: string): Promise<CheckMode | null> {
  const { data } = await supabase.from("drafts").select("data").eq("user_id", userId).eq("key", CHECK_MODE_KEY).maybeSingle();
  return parseCheckMode(data?.data);
}

/** Salva (o toglie) la modalità check; se il database non risponde lo dice, invece di far finta di niente. */
export async function setCheckMode(supabase: ServerSupabase, userId: string, mode: CheckMode | null): Promise<boolean> {
  if (!mode) {
    const { error } = await supabase.from("drafts").delete().eq("user_id", userId).eq("key", CHECK_MODE_KEY);
    return !error;
  }
  const { error } = await supabase.from("drafts").upsert({ user_id: userId, key: CHECK_MODE_KEY, data: mode as unknown as Json, updated_at: new Date().toISOString() });
  return !error;
}
