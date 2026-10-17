import "server-only";
/**
 * Chiamate a Claude (API di Anthropic) per l'assistente dei programmi.
 * Chiave: ANTHROPIC_API_KEY. Modello: ANTHROPIC_MODEL (predefinito sotto).
 * Ogni installazione usa la propria chiave, il proprio metodo e i propri esempi.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { BLOCK_KINDS, newId, programContentSchema, type ProgramContent } from "../program/types";
import { compactProgram, exerciseCodes } from "./prompt-format";

export const DEFAULT_MODEL = "claude-sonnet-5-5";

/**
 * Prezzi in dollari per milione di token: input, output e moltiplicatore per le
 * parti rilette dalla cache (le scritture in cache costano 1,25 volte l'input).
 * Aggiornare se cambiano: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
 */
const PRICES: Record<string, [number, number, number]> = {
  "claude-sonnet-5-5": [2, 10, 0.05],
  "claude-opus-5-5": [4, 20, 0.05],
  "claude-haiku-5-5": [0.1, 0.5, 0.1],
  "claude-fable-5-1": [10, 50, 0.025],
};

export function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function model() {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

/** Costo stimato in euro (al cambio 1 $ ≈ 0,92 €). */
export function estimateCostEur(m: string, input: number, output: number, cache: { written?: number; read?: number } = {}) {
  const [pi, po, readMult] = PRICES[m] ?? PRICES[DEFAULT_MODEL];
  const inputCost = input * pi + (cache.written ?? 0) * pi * 1.25 + (cache.read ?? 0) * pi * readMult;
  return ((inputCost + output * po) / 1_000_000) * 0.92;
}

const nullableInt = { anyOf: [{ type: "integer" }, { type: "null" }] };
const nullableNum = { anyOf: [{ type: "number" }, { type: "null" }] };
const nullableStr = { anyOf: [{ type: "string" }, { type: "null" }] };

/** Schema JSON del programma per le risposte strutturate (niente vincoli numerici: non supportati). */
const PROGRAM_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "title", "description", "weeks", "sessionMinutes", "timeFromTrainer", "days"],
  properties: {
    summary: { type: "string", description: "Riassunto in italiano, 2-5 frasi, di cosa hai cambiato e perché" },
    sessionMinutes: nullableInt,
    timeFromTrainer: { type: "boolean" },
    title: { type: "string" },
    description: { type: "string", description: "Note del programma visibili al cliente" },
    weeks: { type: "integer", description: "Numero di settimane, da 1 a 12" },
    days: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "notes", "blocks"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          notes: { type: "string" },
          blocks: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "kind", "title", "rounds", "durationMin", "everySec", "workSec", "restSec", "notes", "items"],
              properties: {
                id: { type: "string" },
                kind: { type: "string", enum: [...BLOCK_KINDS] },
                title: { type: "string" },
                rounds: nullableInt,
                durationMin: nullableNum,
                everySec: nullableInt,
                workSec: nullableInt,
                restSec: nullableInt,
                notes: { type: "string" },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["id", "exerciseId", "name", "rest", "notes", "prescriptions", "change"],
                    properties: {
                      id: { type: "string" },
                      exerciseId: nullableStr,
                      name: { type: "string" },
                      rest: { type: "string" },
                      notes: { type: "string" },
                      prescriptions: { type: "array", items: { type: "string" } },
                      change: { type: "string", description: "Perché hai cambiato questa riga, in una frase breve. Stringa vuota se è uguale a prima." },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

const aiProgramSchema = z.object({
  summary: z.string(),
  sessionMinutes: z.number().int().nullable().catch(null),
  timeFromTrainer: z.boolean().catch(false),
  title: z.string(),
  description: z.string(),
  weeks: z.number().int(),
  days: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      notes: z.string(),
      blocks: z.array(
        z.object({
          id: z.string(),
          kind: z.enum(BLOCK_KINDS),
          title: z.string(),
          rounds: z.number().int().nullable(),
          durationMin: z.number().nullable(),
          everySec: z.number().int().nullable(),
          workSec: z.number().int().nullable(),
          restSec: z.number().int().nullable(),
          notes: z.string(),
          items: z.array(
            z.object({
              id: z.string(),
              exerciseId: z.string().nullable(),
              name: z.string(),
              rest: z.string(),
              notes: z.string(),
              prescriptions: z.array(z.string()),
              change: z.string(),
            }),
          ),
        }),
      ),
    }),
  ),
});

const SYSTEM = `Sei l'assistente di programmazione di un personal trainer italiano. Prepari BOZZE di programmi di allenamento che il trainer poi rivede: non parli mai con il cliente.
Il cliente deve vivere il programma come scritto al 100% dal suo trainer: nei testi che vede (titolo, note del programma, dei giorni, dei blocchi e degli esercizi) scrivi come lo scriverebbe il trainer, senza mai nominare AI, assistente, bozza o "versione precedente", e senza raccontare cosa hai cambiato. Le spiegazioni delle modifiche vanno solo nel riassunto e nei campi "change", che legge solo il trainer.

Come ragioni:
- Prima di scrivere leggi TUTTO il contesto, non solo il metodo, in quest'ordine di importanza:
  1. la richiesta del trainer e le sue risposte alle tue domande;
  2. "Da applicare in questo programma": le note prese all'ultimo check per la fase successiva (test, esercizi da cambiare, modifiche decise) e i lavori posturali. Vanno applicate;
  3. il progetto annuale nei mesi del programma: se c'è un CAMBIO DI FASE (es. da volumizzazione a intensificazione) o cambiano gli stimoli (es. più aerobico, meno forza), il programma cambia di conseguenza;
  4. com'è fatto il programma di partenza e come erano impostati i programmi precedenti;
  5. le indicazioni del trainer sul cliente, la valutazione posturale, i test, il logbook, i diari e le note delle sessioni;
  6. il metodo, per tutto quello che i punti sopra non decidono.
- Nel riassunto scrivi in breve come hai usato le note dell'ultimo check, la fase del progetto (e se cambia) e la posturale; se una di queste fonti manca, dillo in mezza frase.
- Il metodo del trainer e le indicazioni sul cliente sono un modo di ragionare, non regole fisse. Quello che il trainer ha scritto davvero (programma di partenza, programmi precedenti, richiesta, risposte) vale più del metodo e delle indicazioni.
- Parti dal programma attuale: cambia solo ciò che serve per la richiesta del trainer e per i dati del cliente. Mantieni gli id di giorni, blocchi ed esercizi che restano; usa id nuovi brevi (8 lettere minuscole) solo per elementi nuovi.
- Mantieni la struttura del trainer (vedi "Com'è fatto il programma di partenza"): stessi rapporti tra i gruppi muscolari, stesso sbilanciamento tra accosciata e hinge, stesso lavoro di braccia se c'è. Cambia al massimo ±4 serie a settimana per gruppo muscolare, salvo che cambi il numero di giornate o che il trainer chieda altro. Non correggere e non segnalare squilibri rispetto al metodo: il trainer sa cosa sta facendo.
- Fondamentali (squat, panca, stacco e ciò che il trainer usa come tale): non toglierli, non sostituirli e non introdurre varianti (pin squat, panca dai pin, fermi…) se il trainer non lo chiede. Su di loro lavori con ripetizioni e carichi.
- Varietà: quando serve, cambia al massimo circa un esercizio per giornata, preferibilmente tra i complementari o sui muscoli piccoli; il resto progredisce su ripetizioni e carichi secondo la fase.
- Tempo: ogni giornata deve stare nel tempo per seduta. Stima: fondamentale con bilanciere da 4-5 serie circa 25 minuti (avvicinamento e caricamento compresi), complementare da 4 serie circa 10-12 minuti, accessori 6-8 minuti, 2-3 minuti per ogni cambio di esercizio, blocco iniziale di addome/posturale 10-15 minuti, stretching finale 5 minuti. Se il tempo non è indicato, usa 75 minuti e scrivilo nel riassunto.
- Carichi: usa quelli che il cliente ha fatto davvero (logbook) e i test. Per i fondamentali con un test o un massimale stimato, decidi l'obiettivo dell'ultima settimana (per esempio 4x5 o 5x5 all'80% del massimale stimato, sempre qualche ripetizione sotto il massimo possibile) e costruisci la progressione a ritroso. Se non c'è nessun dato, non inventare: lascia il carico libero ("4x8/10") e scrivilo nel campo change.
- Usa gli esercizi dell'eserciziario quando esistono (exerciseId = il loro codice, es. "E12"); per esercizi nuovi metti exerciseId null.
- Ogni esercizio ha esattamente una prescrizione per settimana (array lungo quanto "weeks"). Per gli stretching e i lavori posturali va bene la stessa prescrizione tutte le settimane.
- Note posturali e infortuni noti: tienine conto nella scelta degli esercizi.
- Dolori o fastidi recenti (logbook, diario, note): NON cambiare il programma di tua iniziativa per questo motivo. Decide il trainer: segnalali nel riassunto. Se la richiesta del trainer dice cosa fare, segui quella.
- Non proporre mai di tua iniziativa settimane di scarico, programmi estivi o "da viaggio", fasi di reset, test o simulazioni di gara: li inserisci solo se il trainer lo chiede.
- Se c'è un progetto annuale, segui la fase prevista per il mese: intensificazione = aumentano soprattutto i carichi su ripetizioni più basse; volumizzazione = aumentano soprattutto serie e ripetizioni a carichi simili; transizione = fase breve di passaggio. Rispetta anche quanto spingere sugli stimoli (forza, aerobico, Vo2Max…).
- La durata della fase è quella del programma (dipende dal piano del cliente): non cambiarla se il trainer non lo chiede.
- Complementari: di solito un intervallo di ripetizioni ("4x8/10") con il carico scelto dal cliente, che sale quando completa il massimo delle ripetizioni in tutte le serie.
- Non usare RPE o RIR nelle prescrizioni, salvo richiesta del trainer (al massimo nelle indicazioni).
- Non indicare giorni della settimana: gli allenamenti si fanno in sequenza.
- Campo sessionMinutes: i minuti per seduta su cui hai costruito il programma. timeFromTrainer = true solo se il tempo l'ha scritto il trainer nella richiesta o nelle risposte (per esempio "ora ha solo 45 minuti").
- Scrivi tutto in italiano.`;

function client() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export type AiImage = { mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string };

export type AiUsage = { model: string; input: number; output: number; costEur: number };

/** Un pezzo del messaggio: con cache = true il prefisso fin lì viene riletto a prezzo ridotto. */
export type Part = { text: string; cache?: boolean } | { images: AiImage[] };

export async function runJson(system: string, user: string | Part[], schema: Record<string, unknown>, images: AiImage[] = [], maxTokens = 32000, cacheSystem = false) {
  const m = model();
  const parts: Part[] = typeof user === "string" ? [{ images }, { text: user }] : user;
  const content: Anthropic.ContentBlockParam[] = [];
  for (const p of parts) {
    if ("images" in p) {
      for (const img of p.images) content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } });
    } else if (p.text) {
      content.push({ type: "text", text: p.text, ...(p.cache ? { cache_control: { type: "ephemeral" as const } } : {}) });
    }
  }
  const stream = client().messages.stream({
    model: m,
    max_tokens: maxTokens,
    system: cacheSystem ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] : system,
    messages: [{ role: "user", content }],
    output_config: { format: { type: "json_schema", schema } },
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("L'assistente non ha potuto completare questa richiesta.");
  if (msg.stop_reason === "max_tokens") throw new Error("Il programma è troppo lungo per una sola richiesta: prova a chiedere modifiche su un giorno alla volta.");
  const text = msg.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlock).text).join("");
  const written = msg.usage.cache_creation_input_tokens ?? 0;
  const read = msg.usage.cache_read_input_tokens ?? 0;
  const usage: AiUsage = { model: m, input: msg.usage.input_tokens + written + read, output: msg.usage.output_tokens, costEur: 0 };
  usage.costEur = estimateCostEur(m, msg.usage.input_tokens, usage.output, { written, read });
  return { json: JSON.parse(text) as unknown, usage };
}

export type ReviseInput = {
  instruction: string;
  method: string;
  /** lezioni imparate dalle correzioni del trainer (una per riga) */
  lessons?: string;
  /** ultime correzioni del trainer alle bozze dell'AI (testo compatto) */
  corrections?: string[];
  examples: string[];
  exercises: Array<{ id: string; name: string }>;
  clientContext: string;
  current: { title: string; description: string; weeks: number; content: ProgramContent };
  sessionMinutes?: number | null;
  answers?: Array<{ question: string; answer: string }>;
  images?: AiImage[];
};

/**
 * Il messaggio in tre parti, dalla più stabile alla più variabile, così le
 * parti già lette vengono rilette dalla cache a una frazione del prezzo:
 * 1) metodo, lezioni, esempi, eserciziario (uguali per tutti i clienti);
 * 2) dati del cliente e programma di partenza (uguali tra domande e bozza);
 * 3) richiesta e risposte.
 */
function promptParts(input: ReviseInput, task: string): { parts: Part[]; idByCode: Map<string, string> } {
  const { codeById, idByCode } = exerciseCodes(input.exercises);
  const stable = [
    `# Metodo del trainer\n${input.method || "(Il trainer non ha ancora scritto il suo metodo: ricavalo dagli esempi e dai programmi precedenti.)"}`,
    input.lessons?.trim() ? `# Cosa hai imparato dalle correzioni del trainer (vale più del metodo)\n${input.lessons.trim()}` : "",
    input.corrections?.length ? `# Ultime correzioni del trainer alle tue bozze (impara il suo modo di correggere)\n${input.corrections.join("\n\n")}` : "",
    input.examples.length ? `# Esempi di programmi scritti dal trainer\n${input.examples.join("\n\n")}` : "",
    `# Eserciziario (codice | nome): usa il codice come exerciseId\n${input.exercises.map((e) => `${codeById.get(e.id)} | ${e.name}`).join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const clientPart = [
    `# Dati del cliente\n${input.clientContext}`,
    `# Programma attuale (JSON compatto: i campi vuoti sono omessi) da cui partire\n${compactProgram(input.current, codeById)}`,
    input.sessionMinutes ? `# Tempo a disposizione per seduta\n${input.sessionMinutes} minuti` : "# Tempo a disposizione per seduta\nNon indicato.",
  ].join("\n\n");
  const request = [
    input.images?.length ? "# Allegati\nIn allegato ci sono immagini con i risultati dei test o appunti del trainer." : "",
    `# Richiesta del trainer\n${input.instruction}`,
    input.answers?.length ? `# Risposte del trainer alle tue domande\n${input.answers.map((a) => `- ${a.question} → ${a.answer}`).join("\n")}` : "",
    task,
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    parts: [{ text: stable, cache: true }, { text: clientPart, cache: true }, { images: input.images ?? [] }, { text: request }],
    idByCode,
  };
}

/** Domanda fissa sul tempo, se il cliente non ha un tempo per seduta di riferimento (la fa l'app, senza AI). */
export const TIME_QUESTION = "Quanto tempo ha a disposizione per ogni seduta?";
export const TIME_OPTIONS = ["45 minuti", "60 minuti", "75 minuti", "90 minuti"];

/** Domande oppure programma: un solo schema, così domande e bozza condividono la cache. */
const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions", "program"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "options"],
        properties: { question: { type: "string" }, options: { type: "array", items: { type: "string" } } },
      },
    },
    program: { anyOf: [{ type: "null" }, PROGRAM_JSON_SCHEMA] },
  },
} as const;

const ASK_OR_WRITE = `# Cosa fare adesso
Decidi se ti serve chiedere qualcosa al trainer prima di scrivere.
- Meno domande fai, meglio è: nella maggior parte dei casi nessuna. Fanne (al massimo 5, di solito 1-2) SOLO se hai un dubbio forte che cambia davvero il programma: per esempio il passo di corsa di partenza per chi corre ad andature precise, un carico di partenza su un fondamentale senza test né logbook, il focus della fase se progetto e richiesta si contraddicono, cosa fare con un fastidio segnalato.
- Non chiedere il tempo per seduta, cose già scritte nei dati, nel metodo o nella richiesta, né conferme su cose che il metodo decide già.
- Domande brevi, facili da rispondere, con 2-4 risposte pronte in options quando possibile; in italiano, dando del tu.
- Se fai domande: restituisci le domande e program = null.
- Se non ti servono: questions = [] e in program il programma completo aggiornato.`;

const WRITE_NOW = `# Cosa fare adesso
Restituisci questions = [] e in program il programma completo aggiornato.`;

export type DraftProgram = {
  summary: string;
  title: string;
  description: string;
  weeks: number;
  content: ProgramContent;
  notes: Record<string, string>;
  sessionMinutes: number | null;
  timeFromTrainer: boolean;
};

export type DraftResult =
  | { kind: "questions"; questions: Array<{ question: string; options: string[] }>; usage: AiUsage }
  | ({ kind: "program"; usage: AiUsage } & DraftProgram);

/**
 * Bozza del programma. Con allowQuestions l'AI può prima fare domande (e allora
 * non scrive niente); senza, scrive subito. Le due chiamate condividono la cache.
 */
export async function draftProgram(input: ReviseInput, allowQuestions: boolean): Promise<DraftResult> {
  const { parts, idByCode } = promptParts(input, allowQuestions ? ASK_OR_WRITE : WRITE_NOW);
  const { json, usage } = await runJson(SYSTEM, parts, DRAFT_SCHEMA as unknown as Record<string, unknown>, [], 32000, true);
  const parsed = z
    .object({ questions: z.array(z.object({ question: z.string(), options: z.array(z.string()) })).catch([]), program: z.unknown() })
    .parse(json);
  const questions = parsed.questions
    .filter((q) => q.question.trim() && !/tempo|minuti/i.test(q.question))
    .slice(0, 5)
    .map((q) => ({ question: q.question.trim().slice(0, 300), options: q.options.map((o) => o.trim()).filter(Boolean).slice(0, 4) }));
  if (!parsed.program) {
    if (allowQuestions && questions.length) return { kind: "questions", questions, usage };
    throw new Error("L'assistente non ha preparato il programma: riprova.");
  }
  return { kind: "program", ...normalizeProgram(parsed.program, input, idByCode), usage };
}

function normalizeProgram(raw: unknown, input: ReviseInput, idByCode: Map<string, string>) {
  const parsed = aiProgramSchema.parse(raw);
  const validIds = new Set(input.exercises.map((e) => e.id));
  const idByName = new Map(input.exercises.map((e) => [e.name.toLowerCase(), e.id]));
  const weeks = Math.min(12, Math.max(1, parsed.weeks));
  const seen = new Set<string>();
  const uniq = (id: string) => {
    let v = /^[a-z0-9]{4,16}$/.test(id) && !seen.has(id) ? id : newId();
    while (seen.has(v)) v = newId();
    seen.add(v);
    return v;
  };
  const notes: Record<string, string> = {};
  const content: ProgramContent = programContentSchema.parse({
    days: parsed.days.map((d) => ({
      id: uniq(d.id),
      title: d.title,
      notes: d.notes,
      blocks: d.blocks.map((b) => ({
        id: uniq(b.id),
        kind: b.kind,
        title: b.title,
        rounds: b.rounds && b.rounds > 0 ? b.rounds : null,
        durationMin: b.durationMin && b.durationMin > 0 ? b.durationMin : null,
        everySec: b.everySec && b.everySec > 0 ? b.everySec : null,
        workSec: b.workSec && b.workSec > 0 ? b.workSec : null,
        restSec: b.restSec !== null && b.restSec >= 0 ? b.restSec : null,
        notes: b.notes,
        items: b.items.map((it) => {
          const id = uniq(it.id);
          if (it.change.trim()) notes[id] = it.change.trim();
          const code = it.exerciseId?.trim().toUpperCase() ?? "";
          const exId = idByCode.get(code) ?? (it.exerciseId && validIds.has(it.exerciseId) ? it.exerciseId : idByName.get(it.name.trim().toLowerCase()) ?? null);
          return {
            id,
            exerciseId: exId,
            name: it.name,
            rest: it.rest,
            notes: it.notes,
            prescriptions: Array.from({ length: weeks }, (_, i) => it.prescriptions[i] ?? ""),
          };
        }),
      })),
    })),
  });
  const minutes = parsed.sessionMinutes && parsed.sessionMinutes >= 15 && parsed.sessionMinutes <= 240 ? parsed.sessionMinutes : null;
  return { summary: parsed.summary, title: parsed.title, description: parsed.description, weeks, content, notes, sessionMinutes: minutes, timeFromTrainer: parsed.timeFromTrainer };
}

const PROGRESS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["prescriptions", "reason"],
  properties: {
    prescriptions: { type: "array", items: { type: "string" } },
    reason: { type: "string" },
  },
} as const;

export async function progressRow(input: {
  method: string;
  examples: string[];
  item: { name: string; prescriptions: string[]; notes: string };
  weeks: number;
  history: string;
}) {
  const userText = [
    `# Metodo del trainer\n${input.method || "(non scritto: ricavalo dagli esempi)"}`,
    input.examples.length ? `# Esempi del trainer\n${input.examples.join("\n\n")}` : "",
    `# Storico del cliente su questo esercizio\n${input.history || "nessun dato"}`,
    `# Esercizio\n${input.item.name}${input.item.notes ? ` (indicazioni: ${input.item.notes})` : ""}\nPrescrizioni attuali per settimana: ${JSON.stringify(input.item.prescriptions)}`,
    `Completa la progressione per tutte le ${input.weeks} settimane partendo dalla prima prescrizione non vuota, nello stile del trainer. Restituisci esattamente ${input.weeks} prescrizioni e in "reason" spiega in una frase la logica.`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const { json, usage } = await runJson(SYSTEM, userText, PROGRESS_SCHEMA as unknown as Record<string, unknown>, [], 4000);
  const parsed = z.object({ prescriptions: z.array(z.string()), reason: z.string() }).parse(json);
  return {
    prescriptions: Array.from({ length: input.weeks }, (_, i) => parsed.prescriptions[i] ?? input.item.prescriptions[i] ?? ""),
    reason: parsed.reason,
    usage,
  };
}

const ALTERNATIVES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["alternatives"],
  properties: {
    alternatives: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "reason"],
        properties: { name: { type: "string" }, reason: { type: "string" } },
      },
    },
  },
} as const;

export async function suggestAlternatives(input: { exerciseName: string; exercises: Array<{ name: string }>; clientContext: string }) {
  const userText = [
    `# Eserciziario\n${input.exercises.map((e) => e.name).join("\n")}`,
    `# Dati del cliente\n${input.clientContext}`,
    `Proponi 3 alternative all'esercizio "${input.exerciseName}" scelte dall'eserciziario (nome identico), adatte a questo cliente. Per ognuna una frase sul perché.`,
  ].join("\n\n");
  const { json, usage } = await runJson(SYSTEM, userText, ALTERNATIVES_SCHEMA as unknown as Record<string, unknown>, [], 3000);
  const parsed = z.object({ alternatives: z.array(z.object({ name: z.string(), reason: z.string() })) }).parse(json);
  return { alternatives: parsed.alternatives.slice(0, 3), usage };
}

const CHECKIN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["working", "slipping", "focus", "reply"],
  properties: {
    working: { type: "array", items: { type: "string" }, description: "Cosa sta funzionando (2-4 punti brevi, con il dato che lo dimostra)" },
    slipping: { type: "array", items: { type: "string" }, description: "Cosa sta peggiorando o va tenuto d'occhio (0-4 punti brevi, con il dato)" },
    focus: { type: "array", items: { type: "string" }, description: "Su cosa concentrarsi nelle prossime settimane (1-3 azioni concrete per il trainer)" },
    reply: { type: "string", description: "Bozza di risposta al cliente, 2-4 frasi, dando del tu, tono caldo e concreto" },
  },
} as const;

const CHECKIN_SYSTEM = `Sei l'assistente di un personal trainer italiano. Leggi i dati del cliente (diari settimanali, logbook, check corporei, note di sessione) e prepari per il trainer un riassunto onesto e breve. Regole:
- Ogni punto cita il dato da cui viene (es. "sonno 2/5 nelle ultime due settimane", "squat da 60 a 65 kg").
- Non inventare nulla: se un dato manca, non parlarne.
- Niente diagnosi mediche: se emergono dolori, suggerisci di parlarne in sessione.
- La risposta al cliente è una bozza che il trainer rivede: breve, calda, concreta, in italiano, dando del tu, senza emoji.`;

export async function checkinBrief(input: { clientContext: string; method: string }) {
  const userText = [
    input.method ? `# Metodo del trainer (per il tono)\n${input.method.slice(0, 4000)}` : "",
    `# Dati del cliente\n${input.clientContext}`,
    "Prepara il riassunto delle ultime 2-4 settimane e la bozza di risposta all'ultimo diario.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const { json, usage } = await runJson(CHECKIN_SYSTEM, userText, CHECKIN_SCHEMA as unknown as Record<string, unknown>, [], 3000);
  const parsed = z.object({ working: z.array(z.string()), slipping: z.array(z.string()), focus: z.array(z.string()), reply: z.string() }).parse(json);
  return { ...parsed, usage };
}

const REPLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["needsReply", "draft"],
  properties: {
    needsReply: { type: "boolean", description: "false se il cliente non chiede niente e non serve rispondere (es. \"ok grazie\")" },
    draft: { type: "string", description: "Il messaggio da mandare al cliente, pronto da inviare. Stringa vuota se needsReply è false." },
  },
} as const;

const REPLY_SYSTEM = `Sei un personal trainer italiano e stai rispondendo a un tuo cliente. Scrivi la BOZZA del messaggio che il trainer manderà: deve sembrare scritta da lui, di suo pugno, dal telefono. Nessuno deve capire che l'ha preparata un'intelligenza artificiale.

Come scrivere:
- Copia il modo di scrivere del trainer dagli esempi reali, su due livelli:
  1. le abitudini costanti, cioè quello che si ripete con clienti diversi (lunghezza, saluti, punteggiatura, maiuscole, espressioni tipiche, emoji solo se le usa);
  2. il tono che usa solo con QUESTO cliente: quanta confidenza, come lo saluta, se lo chiama per nome o con un soprannome, tu o lei, battute. Quando i due livelli non coincidono vince il secondo.
- Non portare a questo cliente soprannomi, battute o confidenze che il trainer usa con un altro. Se con questo cliente non ci sono esempi, resta cordiale ma senza confidenze.
- Le correzioni (bozza → testo che ha davvero inviato) sono il segnale più importante: rifai come ha corretto lui, non come era la bozza.
- Breve come una chat: di solito 1-4 frasi.
- Se il cliente ha fatto più domande: UN SOLO messaggio che risponde a tutte, per punti brevi (un punto per domanda, con un numero o un trattino come farebbe il trainer), con al massimo una riga di apertura.
- Dai del tu. Per chiamarlo per nome scrivi {nome}.
- Niente frasi da assistente: niente "Ottima domanda", "Certamente!", "Spero di esserti stato utile", "Non esitare a contattarmi", "Ecco", niente grassetti, titoli o elenchi formattati.
- Lezioni dalle correzioni del trainer: valgono più di queste regole generali; quelle su questo cliente valgono più di quelle generali.
- Allenamenti: guarda sempre la sezione "programma vs fatto". Confronta quello che ha fatto con quello che chiedeva il programma, serie per serie: non dire che ha chiuso tutte le serie o tenuto il carico se non è vero. Se ci sono DIFFERENZE (una serie con meno ripetizioni, un carico diverso, serie saltate) tienine conto con tatto, senza farne un dramma.
- Quando nel programma carico e ripetizioni sono scritti, li decide il programma: non suggerire di cambiarli (né una ripetizione in più né più carico) e non dare indicazioni in contrasto. Al massimo incoraggia a seguire quello che c'è scritto la prossima volta. Solo dove il programma dà un range di ripetizioni (es. 3x10/12) o lascia libero il carico puoi suggerire come progredire dentro quel range.
- Se il cliente è contento o entusiasta (un esercizio sentito bene, un record, un buon allenamento) festeggia con lui e basta: niente consigli tecnici e non ripetere le indicazioni dell'esercizio, a meno che non chieda qualcosa o segnali un problema.
- Rispondi solo con quello che risulta dai dati (programma, logbook, progetto). Se la risposta dipende da una decisione del trainer o da un dato che non hai (cambiare il programma, i carichi, saltare o spostare allenamenti, prezzi e pagamenti), non inventare: rispondi in modo naturale prendendo tempo ("ci guardo stasera e ti dico", "ne parliamo alla prossima sessione").
- Dolore o fastidio: niente diagnosi e niente esercizi nuovi. Mostra che ti importa, chiedi dove e con quale esercizio, e proponi di sentirvi o di guardarlo insieme.
- needsReply è false solo quando i messaggi non chiedono niente e non serve una risposta (un grazie, un ok, un saluto).
- In italiano.`;

/** Bozza di risposta. Le parti con `cache` restano in memoria per qualche minuto (messaggi a raffica). */
export async function writeReplyDraft(user: string | Part[]) {
  const { json, usage } = await runJson(REPLY_SYSTEM, user, REPLY_SCHEMA as unknown as Record<string, unknown>, [], 1500, true);
  const parsed = z.object({ needsReply: z.boolean(), draft: z.string() }).parse(json);
  return { needsReply: parsed.needsReply && Boolean(parsed.draft.trim()), draft: parsed.draft.trim().slice(0, 3900), usage };
}
