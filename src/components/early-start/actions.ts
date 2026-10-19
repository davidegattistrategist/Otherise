"use server";

import { getMe } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EARLY_START_DAYS } from "@/lib/program/schedule";

export type EarlyStartResult = { ok: true } | { ok: false; error: string };

/**
 * Inizia oggi una fase pubblicata che parte tra pochi giorni: la data di
 * inizio diventa oggi, così da subito è la fase in corso per tutti (cliente,
 * staff, controlli del mattino). Permessi e limiti li controlla il database
 * (funzione start_program_early).
 */
export async function startProgramEarly(programId: string): Promise<EarlyStartResult> {
  const me = await getMe();
  if (!me) return { ok: false, error: "Accedi di nuovo e riprova." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_program_early", { pid: programId });
  if (!error) return { ok: true };
  if (error.code === "22023") return { ok: false, error: `Si può iniziare prima solo negli ultimi ${EARLY_START_DAYS} giorni.` };
  if (error.code === "42501" || error.code === "P0002") return { ok: false, error: "Non trovo questa fase: ricarica la pagina." };
  if (error.code === "PGRST202" || error.code === "42883") return { ok: false, error: "Manca un aggiornamento dell'app: avvisa il tuo coach." };
  return { ok: false, error: "Non sono riuscito a iniziarla: riprova tra poco." };
}
