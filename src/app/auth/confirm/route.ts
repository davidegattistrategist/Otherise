import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Arrivo dai link delle email (invito, nuova password).
 * - ?token_hash=…&type=invite|recovery  (modelli email consigliati, vedi la guida)
 * - ?code=…                              (accesso con codice)
 * - nessuno dei due: il link porta i dati dopo il "#", che il server non vede;
 *   li legge la pagina /auth/sessione nel browser.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("next") ?? (type === "invite" || type === "recovery" ? "/imposta-password" : "/");
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    return NextResponse.redirect(new URL("/login?errore=link", url.origin));
  }
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    return NextResponse.redirect(new URL("/login?errore=link", url.origin));
  }
  return NextResponse.redirect(new URL(`/auth/sessione?next=${encodeURIComponent(next)}`, url.origin));
}
