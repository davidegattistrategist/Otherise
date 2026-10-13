import "server-only";
/**
 * Un'AI piccola ed economica (Haiku) legge la nota finale del cliente e decide
 * se il trainer deve leggerla. Riceve solo il testo della nota e il nome
 * dell'allenamento: niente nome, email o telefono del cliente.
 * Costo: frazioni di centesimo a nota (poche centinaia di token).
 */
import Anthropic from "@anthropic-ai/sdk";
import { aiEnabled, estimateCostEur, type AiUsage } from "./claude";
import { triageFallback, triageWithoutAi } from "../note-triage";

export const TRIAGE_MODEL = process.env.ANTHROPIC_TRIAGE_MODEL || "claude-haiku-5-5";

const SYSTEM = `Sei l'assistente di un personal trainer. Leggi la nota che un cliente ha scritto alla fine dell'allenamento e decidi se il trainer deve leggerla.
Deve leggerla (read = true) se contiene qualcosa su cui il trainer può o deve agire: dolore, fastidio o infortunio; una domanda o una richiesta; un esercizio o carico troppo facile o troppo difficile; difficoltà tecniche; stanchezza, sonno, stress o motivazione in calo che cambiano l'allenamento; problemi di tempo o di attrezzatura; un risultato importante (record, primo risultato atteso).
Non deve leggerla (read = false) se è solo un commento generico ("che fatica", "alla grande", "tutto ok", "bello", "distrutto ma contento"), emoji o saluti.
Nel dubbio, se c'è qualcosa di concreto, read = true.
reason: in italiano, al massimo 8 parole, cosa c'è di importante (es. "Dolore al ginocchio sullo squat"). Vuoto se read = false.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["read", "reason"],
  properties: { read: { type: "boolean" }, reason: { type: "string" } },
};

export async function triageNote(note: string, workout: string): Promise<{ read: boolean; reason: string; usage: AiUsage | null }> {
  const quick = triageWithoutAi(note);
  if (quick) return { ...quick, usage: null };
  if (!aiEnabled()) return { ...triageFallback(note), usage: null };
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.stream({
      model: TRIAGE_MODEL,
      max_tokens: 120,
      system: SYSTEM,
      messages: [{ role: "user", content: `Allenamento: ${workout}\nNota del cliente:\n"""${note.slice(0, 2000)}"""` }],
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
    }).finalMessage();
    const text = msg.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlock).text).join("");
    const out = JSON.parse(text) as { read: boolean; reason: string };
    const usage: AiUsage = { model: TRIAGE_MODEL, input: msg.usage.input_tokens, output: msg.usage.output_tokens, costEur: estimateCostEur(TRIAGE_MODEL, msg.usage.input_tokens, msg.usage.output_tokens) };
    return { read: Boolean(out.read), reason: String(out.reason ?? "").slice(0, 120), usage };
  } catch {
    // se l'AI non risponde si usa il filtro semplice: meglio un avviso in più che uno perso
    return { ...triageFallback(note), usage: null };
  }
}
