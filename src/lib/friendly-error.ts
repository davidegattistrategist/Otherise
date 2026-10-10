/**
 * Trasforma gli errori tecnici (spesso in inglese) in un messaggio in italiano
 * che dice cosa fare. Se il messaggio è già nostro, in italiano, lo lascia.
 */
const RULES: Array<[RegExp, string]> = [
  [/failed to fetch|networkerror|load failed|network request failed|fetch failed|err_internet|econnreset|etimedout/i, "Connessione assente o instabile: controlla internet e riprova."],
  [/rate limit|too many requests|over_email_send_rate_limit|429/i, "Troppe email inviate in poco tempo: riprova tra un'ora. Per non avere questo limite collega Resend come spiega la guida di installazione (passo 4)."],
  [/already been registered|already registered|user already exists|email_exists/i, "Esiste già un account con questa email."],
  [/not authorized|email address not authorized|smtp/i, "Il servizio email di prova di Supabase non può scrivere a questo indirizzo: collega Resend come spiega la guida di installazione (passo 4) e riprova."],
  [/invalid.*email|email.*invalid|unable to validate email/i, "L'indirizzo email non sembra valido: controllalo e riprova."],
  [/overloaded|529|503|service unavailable/i, "Il servizio è sovraccarico in questo momento: riprova tra qualche minuto."],
  [/credit balance|billing|insufficient/i, "Il credito dell'assistente AI è finito: ricaricalo su console.anthropic.com."],
  [/api key|authentication_error|invalid x-api-key|401/i, "La chiave dell'assistente AI non è valida: controlla ANTHROPIC_API_KEY su Vercel."],
];

const looksItalian = (s: string) => /[àèéìòù]|\b(il|lo|la|non|per|riprova|cliente|controlla|nessun|questo|questa)\b/i.test(s);

export function friendlyError(e: unknown, fallback = "Qualcosa non ha funzionato. Riprova tra poco."): string {
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (!msg) return fallback;
  for (const [re, text] of RULES) if (re.test(msg)) return text;
  return looksItalian(msg) ? msg : fallback;
}
