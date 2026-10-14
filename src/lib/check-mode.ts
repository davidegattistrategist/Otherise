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

export const CHECK_MODE_KEY = "modalita-check";

export type CheckMode = {
  clientId: string;
  /** check già salvato che si sta correggendo (null = check nuovo) */
  checkId: string | null;
  /** check nuovo: l'id che avrà una volta salvato (le foto si caricano prima, in quella cartella) */
  newId?: string;
  clientName: string;
  startedAt: string;
  /** "Chiudi per ora": la modalità resta, ma nessun dispositivo ci entra da solo */
  paused: boolean;
};

export async function getCheckMode(supabase: ServerSupabase, userId: string): Promise<CheckMode | null> {
  const { data } = await supabase.from("drafts").select("data").eq("user_id", userId).eq("key", CHECK_MODE_KEY).maybeSingle();
  const d = data?.data as CheckMode | null | undefined;
  return d && typeof d.clientId === "string" ? d : null;
}

export async function setCheckMode(supabase: ServerSupabase, userId: string, mode: CheckMode | null) {
  if (!mode) {
    await supabase.from("drafts").delete().eq("user_id", userId).eq("key", CHECK_MODE_KEY);
    return;
  }
  await supabase.from("drafts").upsert({ user_id: userId, key: CHECK_MODE_KEY, data: mode as unknown as Json, updated_at: new Date().toISOString() });
}
