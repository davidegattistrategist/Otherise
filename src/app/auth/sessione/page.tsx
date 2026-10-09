"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { AuthShell } from "@/components/auth-shell";

/** Legge la sessione dai link che portano i dati dopo il "#" (modelli email standard di Supabase). */
export default function SessionFromHash() {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");
    const type = hash.get("type");
    const nextParam = new URLSearchParams(window.location.search).get("next");
    const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : type === "invite" || type === "recovery" ? "/imposta-password" : "/";
    if (!access_token || !refresh_token) {
      setFailed(true);
      return;
    }
    createClient()
      .auth.setSession({ access_token, refresh_token })
      .then(({ error }) => {
        if (error) setFailed(true);
        else window.location.replace(type === "invite" || type === "recovery" ? "/imposta-password" : next);
      });
  }, []);
  return (
    <AuthShell title={failed ? "Link non valido" : "Un attimo…"} subtitle={failed ? "Il link è scaduto o è già stato usato. Chiedi a chi ti segue di mandarne uno nuovo, oppure usa “Password dimenticata”." : "Stiamo aprendo il tuo accesso."}>
      {failed ? <a className="font-semibold underline" href="/login">Vai all&apos;accesso</a> : null}
    </AuthShell>
  );
}
