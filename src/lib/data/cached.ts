import "server-only";
/**
 * Dati che cambiano di rado e servono a quasi ogni pagina (eserciziario, nome
 * dell'attività): si leggono una volta e restano in memoria sul server finché
 * qualcuno non li modifica dall'app (`invalidateExercises` /
 * `invalidateSettings`) o al massimo per 10 minuti (per modifiche fatte fuori
 * dall'app, es. dal SQL Editor).
 * Sono dati che ogni utente dell'app può già leggere (eserciziario: tutti gli
 * utenti; nome dell'attività: anche i clienti), quindi la lettura con la
 * chiave di servizio non mostra niente in più. Chi le chiama ha già
 * controllato chi è collegato.
 */
import { cache } from "react";
import { revalidateTag, unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

const EXERCISES = "exercises";
const SETTINGS = "settings";
const TEN_MINUTES = 600;

export type LibraryExercise = { id: string; name: string; video_url: string | null; description: string; category: string; archived: boolean };

const readExercises = unstable_cache(
  async (): Promise<LibraryExercise[]> => {
    const { data, error } = await createAdminClient().from("exercises").select("id, name, video_url, description, category, archived").order("name");
    if (error) throw error; // un errore non si tiene in memoria
    return (data ?? []) as LibraryExercise[];
  },
  ["exercise-library"],
  { tags: [EXERCISES], revalidate: TEN_MINUTES },
);

/** Tutto l'eserciziario, in ordine di nome (anche gli archiviati: filtra chi lo usa). */
export const getExerciseLibrary = cache(() => readExercises());

const readBusinessName = unstable_cache(
  async (): Promise<string | null> => {
    const { data, error } = await createAdminClient().from("app_settings").select("business_name").eq("id", 1).maybeSingle();
    if (error) throw error;
    return data?.business_name ?? null;
  },
  ["business-name"],
  { tags: [SETTINGS], revalidate: TEN_MINUTES },
);

export const getCachedBusinessName = cache(() => readBusinessName());

/** Da chiamare dopo ogni modifica all'eserciziario fatta dall'app. */
export function invalidateExercises() {
  try {
    revalidateTag(EXERCISES, { expire: 0 });
  } catch {
    /* fuori da una richiesta (script): niente da aggiornare */
  }
}

/** Da chiamare dopo ogni modifica alle impostazioni fatta dall'app. */
export function invalidateSettings() {
  try {
    revalidateTag(SETTINGS, { expire: 0 });
  } catch {
    /* fuori da una richiesta (script) */
  }
}
