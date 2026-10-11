import "server-only";
import type { ServerSupabase } from "../supabase/server";
import { EMPTY_PROFILE, type AiProfile } from "../ai-profile";

/** Indicazioni per l'AI del cliente (vuote se non ancora compilate). */
export async function getAiProfile(supabase: ServerSupabase, clientId: string): Promise<AiProfile> {
  const { data } = await supabase
    .from("client_ai_profiles")
    .select("session_minutes, strength_level, running_level, vertical_push, squat_share, intensity_techniques, notes, auto_note, updated_at")
    .eq("client_id", clientId)
    .maybeSingle();
  return data ? { ...EMPTY_PROFILE, ...data } : { ...EMPTY_PROFILE };
}

/** Aggiorna (o crea) le indicazioni. */
export async function saveAiProfile(supabase: ServerSupabase, clientId: string, patch: Partial<AiProfile>) {
  const { updated_at: _skip, ...rest } = patch;
  void _skip;
  return supabase.from("client_ai_profiles").upsert({ client_id: clientId, ...rest, updated_at: new Date().toISOString() }, { onConflict: "client_id" });
}
