"use client";

import { useEffect } from "react";

/**
 * Toglie dall'indirizzo i parametri usati solo per mostrare un avviso una
 * volta ("?piano=salvato", "?fatto=1"…): così l'avviso non ricompare dopo
 * un'altra azione sulla stessa pagina o ricaricando.
 */
export function ClearParams({ names }: { names: string[] }) {
  const key = names.join(",");
  useEffect(() => {
    const url = new URL(window.location.href);
    let changed = false;
    for (const n of key.split(",")) {
      if (url.searchParams.has(n)) {
        url.searchParams.delete(n);
        changed = true;
      }
    }
    if (changed) window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [key]);
  return null;
}
