/**
 * Bozze di risposta dell'assistente AI: funzioni pure (senza database),
 * usate dal generatore in src/lib/ai/reply.ts e dai test.
 */

export type DraftMessage = {
  id: string;
  fromClient: boolean;
  body: string;
  /** foto e video */
  attachments: number;
  createdAt: string;
  /** trascrizione del vocale (stringa vuota se non c'è ancora); null se non è un vocale */
  voice?: string | null;
};

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

/** Testo di un messaggio per il prompt: "[foto]" per gli allegati, "[vocale] …" con la trascrizione. */
export function messageText(m: { body: string; attachments: number; voice?: string | null }): string {
  const body = m.body.trim();
  const att = m.attachments ? `[${m.attachments === 1 ? "1 foto o video" : `${m.attachments} foto o video`}]` : "";
  const voice = m.voice === undefined || m.voice === null ? "" : m.voice.trim() ? `[vocale] ${m.voice.trim()}` : "[vocale non trascritto]";
  return [att, voice, body].filter(Boolean).join(" ");
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

/** Dalla bozza al testo inviato c'è qualcosa da imparare? (scartata, o corretta davvero) */
export function worthLearning(draft: string, sent: string): boolean {
  return Boolean(sent.trim()) && similarity(draft, sent) < 0.97;
}

/**
 * Esempi veri di come scrive il trainer, per insegnare lo stile all'AI.
 * `text` è già pseudonimizzato. Per le correzioni `draft` è la bozza e `status`
 * dice se l'ha usata (correggendola o no) o sostituita.
 */
export type StyleExample = {
  id: string;
  clientId: string;
  kind: "message" | "checkin" | "correction";
  text: string;
  draft?: string;
  status?: "used" | "replaced";
  at: string;
};

const quote = (s: string) => `"${s.replace(/\s+\n/g, "\n").trim()}"`;

function exampleLine(e: StyleExample): string {
  if (e.kind === "correction" && e.draft) {
    if (e.status === "used" && similarity(e.draft, e.text) > 0.97) return `- Bozza approvata così com'era: ${quote(e.text)}`;
    return `- Bozza: ${quote(e.draft)}\n  ${e.status === "used" ? "L'hai corretta così" : "L'hai scartata e hai scritto"}: ${quote(e.text)}`;
  }
  return `- ${e.kind === "checkin" ? "(risposta al check-up) " : ""}${quote(e.text)}`;
}

/**
 * Divide gli esempi in due livelli: come il trainer scrive a tutti (abitudini
 * costanti, presi da più clienti diversi e raggruppati per cliente, così l'AI
 * vede cosa si ripete) e come scrive solo a questo cliente (confidenza, saluti,
 * soprannomi). Il secondo livello vince sul primo.
 */
export function styleSections(
  examples: StyleExample[],
  clientId: string,
  opts: { perClient?: number; maxClients?: number; maxThis?: number } = {},
): string {
  const p = styleParts(examples, clientId, opts);
  return `${p.general}\n\n${p.client}`;
}

/**
 * Gli stessi due livelli separati: `general` cambia poco da un cliente
 * all'altro (si può tenere in cache), `client` è solo di questo cliente.
 */
export function styleParts(
  examples: StyleExample[],
  clientId: string,
  opts: { perClient?: number; maxClients?: number; maxThis?: number } = {},
): { general: string; client: string } {
  const perClient = opts.perClient ?? 3;
  const maxClients = opts.maxClients ?? 5;
  const maxThis = opts.maxThis ?? 12;
  const recent = [...examples].filter((e) => e.text.trim().length > 3).sort((a, b) => (a.at < b.at ? 1 : -1));
  // un messaggio nato da una bozza compare già come correzione
  const fromDrafts = new Set(recent.filter((e) => e.kind === "correction").map((e) => e.text.trim()));
  const useful = recent.filter((e) => e.kind === "correction" || !fromDrafts.has(e.text.trim()));

  const mine = useful.filter((e) => e.clientId === clientId).slice(0, maxThis);
  const byClient = new Map<string, StyleExample[]>();
  for (const e of useful) {
    if (e.clientId === clientId) continue;
    const list = byClient.get(e.clientId) ?? [];
    if (list.length < perClient) list.push(e);
    byClient.set(e.clientId, list);
  }
  const others = [...byClient.values()].slice(0, maxClients);

  const general = [
    "## Il tuo modo di scrivere\nDue livelli: le abitudini che hai con tutti i clienti e il tono che usi solo con questo cliente.",
    others.length
      ? "### Con tutti i clienti (abitudini costanti)\n" +
        "Messaggi tuoi ad altri clienti, raggruppati per cliente. Prendi solo quello che torna con più clienti: lunghezza, saluti, punteggiatura, espressioni tipiche, emoji. Soprannomi, battute e confidenze che usi con un cliente valgono solo per lui: non portarli a questo cliente.\n" +
        others.map((list, i) => `Cliente ${String.fromCharCode(65 + i)}:\n${list.map(exampleLine).join("\n")}`).join("\n")
      : "### Con tutti i clienti (abitudini costanti)\nNon ci sono ancora esempi con altri clienti: scrivi semplice, caldo e diretto, frasi corte, come in una chat tra persone che si conoscono.",
  ].join("\n\n");
  const client = mine.length
    ? "### Solo con questo cliente\n" +
      "Come scrivi proprio a lui: quanta confidenza, come lo saluti e come lo chiami (per nome o con un soprannome), tu o lei, emoji, battute. Dove questo tono e le abitudini generali non coincidono, vince questo.\n" +
      mine.map(exampleLine).join("\n")
    : "### Solo con questo cliente\nNon gli hai ancora scritto: usa le abitudini generali, con un tono cordiale ma senza confidenze o soprannomi.";
  return { general, client };
}
