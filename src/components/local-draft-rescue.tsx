"use client";

/**
 * Rete di sicurezza per i check: ogni dispositivo tiene una copia locale di
 * quello che scrivi nel modulo del check (anche in modalità check). Se una di
 * queste copie ha appunti, altri test o test di forza, la copia nella tabella
 * delle bozze con la chiave "recupero-locale:<chiave>", così non si perde
 * nemmeno se il dispositivo non era riuscito a mandarla. Non cambia nessun
 * check: serve solo a poter recuperare. Una volta al giorno per dispositivo.
 */
import { useEffect } from "react";

const LOCAL = "otherise:draft:";
const DONE = "otherise:rescue-day";

type Stored = { data?: { notes_next_phase?: unknown; tests_text?: unknown; tests?: unknown }; at?: number };

const hasWords = (v: unknown) => typeof v === "string" && v.trim().length > 0;
const hasTests = (v: unknown) => Array.isArray(v) && v.some((t) => t && typeof t === "object" && hasWords((t as { exercise?: unknown }).exercise));

export function LocalDraftRescue() {
  useEffect(() => {
    let today = "";
    try {
      today = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem(DONE) === today) return;
    } catch {
      return;
    }
    const found: Array<{ key: string; value: Stored }> = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(LOCAL + "check")) continue;
        const value = JSON.parse(localStorage.getItem(k) || "null") as Stored | null;
        const d = value?.data;
        if (!d || !(hasWords(d.notes_next_phase) || hasWords(d.tests_text) || hasTests(d.tests))) continue;
        found.push({ key: k.slice(LOCAL.length), value });
      }
    } catch {
      return;
    }
    void (async () => {
      let ok = true;
      for (const f of found.slice(0, 40)) {
        const r = await fetch("/api/bozze", {
          method: "POST",
          body: JSON.stringify({ key: `recupero-locale:${f.key}`.slice(0, 200), t: Date.now(), data: { ...f.value.data, __local_at: f.value.at ?? null, __device: navigator.userAgent.slice(0, 120) } }),
        }).catch(() => null);
        if (!r || !r.ok) ok = false;
      }
      try {
        if (ok) localStorage.setItem(DONE, today);
      } catch {
        /* niente */
      }
    })();
  }, []);
  return null;
}
