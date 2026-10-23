"use client";

/**
 * Quando torni sull'app (o sulla scheda del browser) dopo un po', la pagina
 * si aggiorna da sola: per esempio il cliente che ha i Progressi aperti vede
 * il check appena salvato dal coach senza dover uscire e rientrare.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function RefreshOnReturn({ afterMs = 5000 }: { afterMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    let hiddenAt = 0;
    const onChange = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt >= afterMs) {
        hiddenAt = 0;
        router.refresh();
      }
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [router, afterMs]);
  return null;
}
