import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "./env";
import { HOME_COOKIE, homeFromCookie } from "@/lib/home-cookie";

const PUBLIC_PATHS = ["/login", "/password-dimenticata", "/auth", "/api/cron", "/privacy", "/apertura"];

/** Rinnova la sessione a ogni richiesta e manda al login chi non è collegato. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Non mettere codice tra createServerClient e getClaims: serve a rinnovare la sessione.
  // getClaims controlla la firma del token sul server stesso (chiavi pubbliche di
  // Supabase, tenute in memoria): niente chiamata ad Auth a ogni pagina.
  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));
  if (!data?.claims?.sub && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  // apertura dell'app ("/"): dritti alla pagina iniziale ricordata, senza il giro dalla pagina "/"
  const home = path === "/" && data?.claims?.sub ? homeFromCookie(request.cookies.get(HOME_COOKIE)?.value) : null;
  if (home) {
    const url = request.nextUrl.clone();
    url.pathname = home;
    url.search = "";
    const redirect = NextResponse.redirect(url);
    // la sessione eventualmente rinnovata qui sopra va anche nella risposta di rinvio
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}
