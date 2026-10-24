import "server-only";
/**
 * Bozze dei moduli con pulsante (FormDraft): il modulo manda la chiave della
 * sua bozza nel campo nascosto `__draft_key`; l'azione, quando è andata a buon
 * fine, la segna cancellata qui. Così la bozza resta se l'azione fallisce
 * (rete, errore, "esiste già") e sparisce solo a salvataggio riuscito, anche
 * quando l'azione porta a un'altra pagina.
 */
import { draftTombstone } from "./draft-merge";
import type { ServerSupabase } from "./supabase/server";

export const DRAFT_KEY_FIELD = "__draft_key";

export async function clearFormDraft(supabase: ServerSupabase, userId: string, fd: FormData) {
  const key = String(fd.get(DRAFT_KEY_FIELD) ?? "");
  if (!key || key.length > 200 || !key.includes("#")) return;
  await supabase.from("drafts").upsert({ user_id: userId, key, data: draftTombstone(Date.now()), updated_at: new Date().toISOString() });
}
