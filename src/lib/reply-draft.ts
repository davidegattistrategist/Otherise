/**
 * Bozze di risposta dell'assistente AI: funzioni pure (senza database),
 * usate dal generatore in src/lib/ai/reply.ts e dai test.
 */

export type DraftMessage = { id: string; fromClient: boolean; body: string; attachments: number; createdAt: string };

/** Il testo sembra una domanda o una richiesta a cui rispondere? */
export function looksLikeQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (t.includes("?")) return true;
  return /\b(posso|devo|dovrei|potrei|come|quando|quanto|quanti|quante|quale|quali|perch[eé]|cosa|dove|si pu[oò]|va bene se|consigli|consiglio|dubbio|domanda|aiuto|spiegami|dimmi|sai se|ti chiedo|volevo chiederti|male|dolore|fastidio|infortun|indolenzit)/.test(t);
}

/** Messaggi del cliente arrivati dopo l'ultima risposta dello staff (in ordine). */
export function pendingClientMessages(messages: DraftMessage[]): DraftMessage[] {
  const sorted = [...messages].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  let lastStaff = -1;
  sorted.forEach((m, i) => {
    if (!m.fromClient) lastStaff = i;
  });
  return sorted.slice(lastStaff + 1).filter((m) => m.fromClient);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Toglie dati che identificano le persone prima di mandare il testo all'AI:
 * i nomi indicati diventano {nome}, email e numeri di telefono spariscono.
 */
export function pseudonymize(text: string, names: Array<string | null | undefined>): string {
  let out = text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/(\+\d{1,3}[\s.-]?)?\b[03]\d{2}[\s.-]?\d{3}[\s.-]?\d{3,4}\b/g, "[telefono]");
  const list = [...new Set(names.map((n) => (n ?? "").trim()).filter((n) => n.length >= 2))].sort((a, b) => b.length - a.length);
  for (const n of list) {
    out = out.replace(new RegExp(`(^|[^\\p{L}])${escapeRe(n)}(?![\\p{L}])`, "giu"), "$1{nome}");
  }
  return out.replace(/\{nome\}\s+\{nome\}/g, "{nome}");
}

/** Rimette il nome del cliente al posto di {nome}. */
export function fillName(text: string, firstName: string): string {
  return text.replace(/\{nome\}/g, firstName.trim() || "").replace(/[ \t]{2,}/g, " ").trim();
}

/** Testo di un messaggio per il prompt: "[foto]" se c'è solo un allegato. */
export function messageText(m: { body: string; attachments: number }): string {
  const body = m.body.trim();
  const att = m.attachments ? `[${m.attachments === 1 ? "1 foto o video" : `${m.attachments} foto o video`}]` : "";
  return [att, body].filter(Boolean).join(" ");
}

/** Quanto la risposta inviata somiglia alla bozza (0-1), per capire se è stata usata. */
export function similarity(a: string, b: string): number {
  const words = (s: string) => new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2));
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return a.trim() === b.trim() ? 1 : 0;
  let common = 0;
  for (const w of A) if (B.has(w)) common++;
  return common / Math.max(A.size, B.size);
}
