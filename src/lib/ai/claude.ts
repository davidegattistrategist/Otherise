import "server-only";
/**
 * Chiamate a Claude (API di Anthropic) per l'assistente dei programmi.
 * Chiave: ANTHROPIC_API_KEY. Modello: ANTHROPIC_MODEL (predefinito sotto).
 * Ogni installazione usa la propria chiave, il proprio metodo e i propri esempi.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { BLOCK_KINDS, newId, programContentSchema, type ProgramContent } from "../program/types";

export const DEFAULT_MODEL = "claude-sonnet-5-5";

/** Prezzi in dollari per milione di token (input, output). Aggiornare se cambiano. */
const PRICES: Record<string, [number, number]> = {
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5-5": [4, 20],
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-fable-5-1": [10, 50],
};

export function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function model() {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

/** Costo stimato in euro (al cambio 1 $ ≈ 0,92 €). */
export function estimateCostEur(m: string, input: number, output: number) {
  const [pi, po] = PRICES[m] ?? PRICES[DEFAULT_MODEL];
  return ((input * pi + output * po) / 1_000_000) * 0.92;
}

const nullableInt = { anyOf: [{ type: "integer" }, { type: "null" }] };
const nullableNum = { anyOf: [{ type: "number" }, { type: "null" }] };
const nullableStr = { anyOf: [{ type: "string" }, { type: "null" }] };

/** Schema JSON del programma per le risposte strutturate (niente vincoli numerici: non supportati). */
const PROGRAM_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "title", "description", "weeks", "days"],
  properties: {
    summary: { type: "string", description: "Riassunto in italiano, 2-5 frasi, di cosa hai cambiato e perché" },
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

Regole:
- Segui il metodo del trainer e lo stile dei suoi esempi: stesso modo di scrivere le prescrizioni ("4x8 65kg", "4x8/10", "3x20\\"", "5x800m"), stessa progressione tra le settimane, stesso tipo di indicazioni.
- Parti dal programma attuale: cambia solo ciò che serve per la richiesta del trainer e per i dati del cliente. Mantieni gli id di giorni, blocchi ed esercizi che restano; usa id nuovi brevi (8 lettere minuscole) solo per elementi nuovi.
- Usa i carichi e le ripetizioni che il cliente ha fatto davvero (logbook) per decidere i carichi. Se un dato manca, non inventarlo: lascia il carico libero ("4x8/10") e scrivilo nel campo change.
- Usa gli esercizi dell'eserciziario quando esistono (con il loro exerciseId); per esercizi nuovi metti exerciseId null.
- Ogni esercizio ha esattamente una prescrizione per settimana (array lungo quanto "weeks"). Per gli stretching e i lavori posturali va bene la stessa prescrizione tutte le settimane.
- Tieni conto di fastidi, infortuni e note posturali: in caso di dubbio scegli l'opzione più prudente e segnalalo nel campo change.
- Scrivi tutto in italiano.`;

function client() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export type AiImage = { mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string };

export type AiUsage = { model: string; input: number; output: number; costEur: number };

async function runJson(system: string, userText: string, schema: Record<string, unknown>, images: AiImage[] = [], maxTokens = 32000) {
  const m = model();
  const content: Anthropic.ContentBlockParam[] = [
    ...images.map((img) => ({ type: "image" as const, source: { type: "base64" as const, media_type: img.mediaType, data: img.data } })),
    { type: "text", text: userText },
  ];
  const stream = client().messages.stream({
    model: m,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content }],
    output_config: { format: { type: "json_schema", schema } },
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("L'assistente non ha potuto completare questa richiesta.");
  if (msg.stop_reason === "max_tokens") throw new Error("Il programma è troppo lungo per una sola richiesta: prova a chiedere modifiche su un giorno alla volta.");
  const text = msg.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlock).text).join("");
  const usage: AiUsage = {
    model: m,
    input: msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0),
    output: msg.usage.output_tokens,
    costEur: 0,
  };
  usage.costEur = estimateCostEur(m, usage.input, usage.output);
  return { json: JSON.parse(text) as unknown, usage };
}

export type ReviseInput = {
  instruction: string;
  method: string;
  examples: string[];
  exercises: Array<{ id: string; name: string }>;
  clientContext: string;
  current: { title: string; description: string; weeks: number; content: ProgramContent };
  images?: AiImage[];
};

export async function reviseProgram(input: ReviseInput) {
  const exerciseList = input.exercises.map((e) => `${e.id} | ${e.name}`).join("\n");
  const userText = [
    `# Metodo del trainer\n${input.method || "(Il trainer non ha ancora scritto il suo metodo: ricavalo dagli esempi e dai programmi precedenti.)"}`,
    input.examples.length ? `# Esempi di programmi scritti dal trainer\n${input.examples.join("\n\n")}` : "",
    `# Eserciziario (id | nome)\n${exerciseList}`,
    `# Dati del cliente\n${input.clientContext}`,
    `# Programma attuale (JSON) da cui partire\n${JSON.stringify({ title: input.current.title, description: input.current.description, weeks: input.current.weeks, days: input.current.content.days })}`,
    input.images?.length ? "# Allegati\nIn allegato ci sono immagini con i risultati dei test o appunti del trainer." : "",
    `# Richiesta del trainer\n${input.instruction}`,
    "Restituisci il programma completo aggiornato.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const { json, usage } = await runJson(SYSTEM, userText, PROGRAM_JSON_SCHEMA as unknown as Record<string, unknown>, input.images);
  const parsed = aiProgramSchema.parse(json);
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
          const exId = it.exerciseId && validIds.has(it.exerciseId) ? it.exerciseId : idByName.get(it.name.trim().toLowerCase()) ?? null;
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
  return { summary: parsed.summary, title: parsed.title, description: parsed.description, weeks, content, notes, usage };
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
