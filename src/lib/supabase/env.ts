/**
 * Indirizzo e chiavi di Supabase dalle variabili d'ambiente, ripuliti da spazi
 * e a capo finiti dentro per sbaglio copiando e incollando su Vercel (un a capo
 * in una chiave fa fallire ogni richiesta).
 * I nomi NEXT_PUBLIC_ vanno scritti per intero: Next li sostituisce nel codice
 * del browser al momento della build.
 */
const clean = (v: string | undefined) => (v ?? "").replace(/\s+/g, "");

export const supabaseUrl = () => clean(process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
export const supabaseAnonKey = () => clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
/** Solo lato server. */
export const supabaseServiceKey = () => clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
