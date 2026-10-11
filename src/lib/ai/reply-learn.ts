import "server-only";
/**
 * Le bozze di risposta imparano dalle correzioni del trainer, come i programmi.
 * Quando il trainer manda un messaggio diverso dalla bozza (corretto o scritto
 * da zero), un'altra chiamata all'AI ne ricava delle lezioni brevi su due livelli:
 * - come scrive a tutti i clienti (app_settings.ai_reply_lessons);
 * - come scrive a QUESTO cliente (client_ai_profiles.reply_lessons).
 * Le lezioni entrano in ogni bozza successiva. Il trainer le vede e le corregge.
 */
import { z } from "zod";
import { createAdminClient } from "../supabase/admin";
import { aiEnabled, runJson } from "./claude";
import { budgetExceeded } from "./budget";
import { pseudonymize, worthLearning } from "../reply-draft";

export { worthLearning };
import type { ServerSupabase } from "../supabase/server";

export const MAX_REPLY_LESSONS = 20;
export const MAX_CLIENT_REPLY_LESSONS = 10;

const SYSTEM = `Sei l'assistente di un personal trainer italiano e prepari le bozze dei messaggi che lui manda ai clienti in chat. Tieni aggiornate due brevi liste di LEZIONI ricavate dalle sue correzioni, così la prossima bozza gli somiglia di più e richiede meno modifiche.
Ricevi: le lezioni attuali (generali e su questo cliente), il messaggio del cliente, la tua bozza e il messaggio che il trainer ha davvero mandato. Restituisci le due liste aggiornate.
- "general": come scrive e cosa fa con TUTTI i clienti. Es. "Quando il cliente è contento festeggia e basta, niente consigli tecnici", "Non suggerire cambi di carico se il programma li ha già scritti", "Frasi corte, niente punti esclamativi multipli".
- "client": cosa vale solo con QUESTO cliente (tono, confidenza, come lo chiama, cose da evitare con lui). Es. "La chiama Giuly", "Con lui è molto scherzoso".
Regole:
- Guarda la differenza tra bozza e testo inviato: cosa ha tolto, aggiunto, cambiato nel tono, nella lunghezza, nel contenuto. Se ha scritto da zero, capisci cosa non andava nella bozza.
- Una lezione è concreta e breve (massimo 160 caratteri). Unisci quelle simili, togli quelle che la nuova correzione smentisce.
- Se la differenza dipende solo da un fatto che la bozza non poteva sapere (un appuntamento, un'informazione nuova), non farne una lezione.
- Nessun nome di persona o dato personale: per il cliente scrivi "il cliente" o {nome}. Un soprannome usato dal trainer per QUESTO cliente puoi tenerlo nella lista "client".
- Al massimo ${MAX_REPLY_LESSONS} lezioni generali e ${MAX_CLIENT_REPLY_LESSONS} su questo cliente. Se non c'è niente da imparare restituisci le liste invariate.
- In italiano.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["general", "client"],
  properties: {
    general: { type: "array", items: { type: "string" } },
    client: { type: "array", items: { type: "string" } },
  },
} as const;

const asList = (lines: string[], max: number) =>
  lines
    .map((l) => l.trim().replace(/^[-•]\s*/, "").slice(0, 160))
    .filter(Boolean)
    .slice(0, max)
    .map((l) => `- ${l}`)
    .join("\n");

/** Lezioni generali e su questo cliente, da mettere nel prompt della bozza. */
export async function replyLessons(supabase: ServerSupabase, clientId: string) {
  const [{ data: s }, { data: p }] = await Promise.all([
    supabase.from("app_settings").select("ai_reply_lessons").maybeSingle(),
    supabase.from("client_ai_profiles").select("reply_lessons").eq("client_id", clientId).maybeSingle(),
  ]);
  return { general: s?.ai_reply_lessons?.trim() ?? "", client: p?.reply_lessons?.trim() ?? "" };
}

/** Impara da una bozza chiusa (corretta o sostituita). Non lancia errori. */
export async function learnFromReply(draftId: string, createdBy: string | null) {
  if (!aiEnabled()) return;
  try {
    const admin = createAdminClient();
    const { data: d } = await admin.from("ai_reply_drafts").select("id, body, sent_text, status, client_id, learned_at, last_message_id, checkin_id").eq("id", draftId).maybeSingle();
    if (!d || d.learned_at || !d.sent_text || !worthLearning(d.body, d.sent_text)) return;
    if (await budgetExceeded(admin as unknown as ServerSupabase)) return;
    await admin.from("ai_reply_drafts").update({ learned_at: new Date().toISOString() }).eq("id", d.id);

    const [{ data: client }, lessons, question] = await Promise.all([
      admin.from("clients").select("first_name, last_name, email, phone").eq("id", d.client_id).maybeSingle(),
      replyLessons(admin as unknown as ServerSupabase, d.client_id),
      d.last_message_id
        ? admin.from("messages").select("body").eq("id", d.last_message_id).maybeSingle().then((r) => r.data?.body ?? "")
        : d.checkin_id
          ? admin.from("checkins").select("request, issues").eq("id", d.checkin_id).maybeSingle().then((r) => [r.data?.request, r.data?.issues].filter(Boolean).join(" — "))
          : Promise.resolve(""),
    ]);
    const names = [client?.first_name, client?.last_name, client?.email, client?.phone];
    const clean = (t: string) => pseudonymize(t, names);
    const user = [
      `# Lezioni generali attuali\n${lessons.general || "(nessuna)"}`,
      `# Lezioni attuali su questo cliente\n${lessons.client || "(nessuna)"}`,
      question ? `# Messaggio del cliente\n${clean(question)}` : "",
      `# La tua bozza\n${clean(d.body)}`,
      `# ${d.status === "used" ? "Il trainer l'ha corretta e ha mandato" : "Il trainer l'ha scartata e ha scritto"}\n${clean(d.sent_text)}`,
    ].filter(Boolean).join("\n\n");

    const { json, usage } = await runJson(SYSTEM, user, SCHEMA as unknown as Record<string, unknown>, [], 2000);
    const out = z.object({ general: z.array(z.string()), client: z.array(z.string()) }).parse(json);
    const now = new Date().toISOString();
    await Promise.all([
      admin.from("app_settings").update({ ai_reply_lessons: asList(out.general, MAX_REPLY_LESSONS), ai_reply_lessons_updated_at: now }).eq("id", 1),
      admin.from("client_ai_profiles").upsert({ client_id: d.client_id, reply_lessons: asList(out.client, MAX_CLIENT_REPLY_LESSONS) }, { onConflict: "client_id" }),
      admin.from("ai_requests").insert({
        created_by: createdBy,
        client_id: d.client_id,
        kind: "reply_lessons",
        model: usage.model,
        input_tokens: usage.input,
        output_tokens: usage.output,
        cost_eur: Number(usage.costEur.toFixed(4)),
      }),
    ]);
  } catch (e) {
    console.error("learnFromReply", e);
  }
}
