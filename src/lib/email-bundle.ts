/** Testo delle email di avviso (funzione pura, usata da email.ts). */

/** Una sola email con tutte le novità: titolo e link se è una, elenco se sono di più. */
export function bundleEmail(items: Array<{ title: string; body: string; link: string | null }>, base: string): { subject: string; text: string } {
  if (items.length === 1) {
    const n = items[0];
    return { subject: n.title, text: [n.body, `${base}${n.link || "/"}`].filter(Boolean).join("\n") };
  }
  const lines = items.slice(0, 12).map((n) => `• ${n.title}${n.body ? ` — ${n.body.slice(0, 140)}` : ""}`);
  if (items.length > 12) lines.push(`…e altre ${items.length - 12}.`);
  return {
    subject: `Hai ${items.length} novità nell'app`,
    text: ["Ecco cosa ti aspetta nell'app:", ...lines, "", "Attiva le notifiche sul telefono e non riceverai più queste email.", `${base}/`].join("\n"),
  };
}
