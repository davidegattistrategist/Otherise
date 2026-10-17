/**
 * Pagina iniziale ricordata in un cookie ("/staff" o "/cliente"): aprendo
 * l'app dalla Home del telefono ("/") il proxy manda subito lì, senza passare
 * dalla pagina "/" che legge il profilo e poi rimanda (un giro in meno a ogni
 * apertura). È solo un suggerimento: ogni pagina controlla comunque chi sei.
 * Lo scrive /api/live (chiamato da ogni pagina), lo toglie l'uscita.
 */
export const HOME_COOKIE = "otherise-home";
export const HOME_PATHS = ["/staff", "/cliente"] as const;

export function homeFromCookie(value: string | undefined): string | null {
  return value && (HOME_PATHS as readonly string[]).includes(value) ? value : null;
}

export const HOME_COOKIE_OPTIONS = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const, httpOnly: true, secure: true };
