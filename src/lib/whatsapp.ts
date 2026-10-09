/**
 * Link a WhatsApp con il messaggio già scritto: si apre la chat con il
 * cliente, si controlla il testo e si preme invio. Niente invii automatici.
 */

/** Numero in formato internazionale senza "+" (es. 393331234567); i numeri italiani senza prefisso prendono il 39. */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (/^3\d{8,9}$/.test(d)) d = `39${d}`;
  return d.length >= 8 && d.length <= 15 ? d : null;
}

export function waLink(phone: string | null | undefined, text: string): string {
  const n = normalizePhone(phone);
  return `https://wa.me/${n ?? ""}?text=${encodeURIComponent(text)}`;
}

/** Sostituisce {nome}, {scadenza}, {importo}… nel modello di messaggio. */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

export const DEFAULT_PAYMENT_MESSAGE =
  "Ciao {nome}! Ti ricordo che {situazione}. Quando vuoi puoi rinnovare ({importo}). Grazie!";
