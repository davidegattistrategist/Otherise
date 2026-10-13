/**
 * Note finali del cliente nel logbook ("Com'è andata?"): quali meritano di
 * arrivare al trainer in Oggi. Parte pura (senza AI): le note vuote o di
 * poche parole senza segnali si scartano subito, così l'AI legge solo il resto.
 */

/** Segnali che contano sempre: dolore, domande, richieste, carichi, difficoltà. */
const SIGNALS = /(dolor|male\b|fastidi|infiamm|tendin|ginocch|schien|spall|caviglia|polso|anca|lombar|cervical|\?|non riesco|non ce l|troppo (pesant|facil|legger|dur)|cambiar|sostituir|aument|diminu|scendere|salire|stanc|sfinit|demotiv|non ho voglia|ansia|stress|dormito|malat|febbre|ciclo|infortun|crampi|vertigin|nause|giramenti|posso|potrei|si può|dubbio)/i;

export function triageWithoutAi(note: string): { read: boolean; reason: string } | null {
  const t = note.trim();
  if (!t) return { read: false, reason: "" };
  const words = t.split(/\s+/).filter(Boolean).length;
  const signal = SIGNALS.exec(t);
  // "che fatica", "alla grande", "tutto ok": niente da leggere, senza chiedere all'AI
  if (words <= 4 && !signal) return { read: false, reason: "" };
  return null;
}

/** Senza la chiave di Anthropic: basta un segnale per mandarla al trainer. */
export function triageFallback(note: string): { read: boolean; reason: string } {
  const quick = triageWithoutAi(note);
  if (quick) return quick;
  const signal = SIGNALS.exec(note);
  return signal ? { read: true, reason: "Contiene un segnale da guardare" } : { read: false, reason: "" };
}
