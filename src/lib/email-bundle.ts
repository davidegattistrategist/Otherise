/** Testo delle email di avviso (funzione pura, usata da email.ts). */

const PUSH_TIP = "Consiglio: attiva le notifiche dell'app sul telefono. Saprai subito quando c'è qualcosa di nuovo e non riceverai più queste email.";

/**
 * Una sola email con tutte le novità: titolo e link se è una, elenco se sono di più.
 * `no-push`: chi non ha le notifiche (ogni email consiglia di attivarle);
 * `reminder`: chi le ha, ma dopo qualche giorno non ha ancora visto un messaggio o il programma.
 */
export function bundleEmail(items: Array<{ title: string; body: string; link: string | null }>, base: string, mode: "no-push" | "reminder" = "no-push"): { subject: string; text: string } {
  const tail = mode === "no-push" ? ["", PUSH_TIP] : [];
  if (items.length === 1) {
    const n = items[0];
    const intro = mode === "reminder" ? "Te lo ricordo perché non l'hai ancora visto nell'app:" : "";
    return { subject: n.title, text: [intro, n.body, `${base}${n.link || "/"}`, ...tail].filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== "")).join("\n") };
  }
  const lines = items.slice(0, 12).map((n) => `• ${n.title}${n.body ? ` — ${n.body.slice(0, 140)}` : ""}`);
  if (items.length > 12) lines.push(`…e altre ${items.length - 12}.`);
  return {
    subject: mode === "reminder" ? "Hai delle novità da vedere nell'app" : `Hai ${items.length} novità nell'app`,
    text: [mode === "reminder" ? "Non le hai ancora viste nell'app:" : "Ecco cosa ti aspetta nell'app:", ...lines, `${base}/`, ...tail].join("\n"),
  };
}
