import "server-only";
/**
 * Bozze di risposta ai clienti scritte "come il trainer".
 *
 * Quando un cliente fa una domanda in chat (o scrive una richiesta nel
 * check-up) l'assistente prepara una bozza che lo staff vede sopra la casella
 * di scrittura: può usarla, correggerla o scrivere da zero. Più il trainer
 * risponde e corregge, più le bozze somigliano al suo modo di scrivere: nel
 * prompt finiscono i suoi messaggi veri e le coppie "bozza → testo inviato".
 *
 * Privacy: all'AI non arrivano nome, cognome, email o telefono del cliente
 * (diventano {nome}); il nome viene rimesso solo nella bozza salvata.
 */
import { createAdminClient } from "../supabase/admin";
import type { ServerSupabase } from "../supabase/server";
import { aiEnabled, writeReplyDraft, type Part } from "./claude";
import { budgetExceeded, logAiRequest } from "./budget";
import { buildReplyContext } from "./reply-context";
import { learnFromReply, replyLessons, worthLearning } from "./reply-learn";
import { pushLater } from "../notify";
import { CHECKIN_QUESTIONS } from "../checkin";
import { todayISO } from "../dates";
import { fillName, looksLikeQuestion, messageText, pendingClientMessages, pseudonymize, similarity, styleParts, type DraftMessage, type StyleExample } from "../reply-draft";

type Admin = ReturnType<typeof createAdminClient>;
export type ReplyDraft = { id: string; body: string; createdAt: string };
type Result = { ok: true; draft: ReplyDraft | null } | { ok: false; error: string };

type ClientRow = { id: string; first_name: string; last_name: string; email: string | null; phone: string | null; user_id: string | null; coach_id: string | null; archived_at: string | null };

async function loadClient(admin: Admin, clientId: string) {
  const { data } = await admin.from("clients").select("id, first_name, last_name, email, phone, user_id, coach_id, archived_at").eq("id", clientId).maybeSingle();
  return data as ClientRow | null;
}

/** Chi risponde a questo cliente: il collaboratore che lo segue, altrimenti il titolare. */
async function responderFor(admin: Admin, client: ClientRow): Promise<string | null> {
  if (client.coach_id) return client.coach_id;
  const { data } = await admin.from("profiles").select("id").eq("role", "owner").order("created_at").limit(1).maybeSingle();
  return data?.id ?? null;
}

async function canRun(admin: Admin, client: ClientRow | null): Promise<string | null> {
  if (!aiEnabled()) return "L'assistente AI non è attivo: manca la chiave di Anthropic.";
  if (!client) return "Cliente non trovato.";
  return budgetExceeded(admin as unknown as ServerSupabase);
}

/**
 * Esempi veri di come scrive chi risponde, su due livelli: con tutti i clienti
 * (abitudini costanti) e solo con questo cliente (confidenza, saluti, soprannomi).
 */
async function styleSection(admin: Admin, responderId: string | null, clientId: string): Promise<{ general: string; client: string }> {
  if (!responderId) return styleParts([], clientId);
  const { data: me } = await admin.from("profiles").select("role").eq("id", responderId).maybeSingle();
  let clientsQ = admin.from("clients").select("id, first_name, last_name");
  if (me?.role !== "owner") clientsQ = clientsQ.eq("coach_id", responderId);
  const [{ data: pairs }, { data: msgs }, { data: mineMsgs }, { data: clients }] = await Promise.all([
    admin.from("ai_reply_drafts").select("id, body, sent_text, status, client_id, closed_at").eq("sent_by", responderId).in("status", ["used", "replaced"]).not("sent_text", "is", null).order("closed_at", { ascending: false }).limit(40),
    // messaggi a tutti i clienti (per le abitudini costanti)
    admin.from("messages").select("id, body, client_id, created_at").eq("sender_id", responderId).is("deleted_at", null).neq("body", "").neq("client_id", clientId).order("created_at", { ascending: false }).limit(200),
    // messaggi a questo cliente (per il tono con lui)
    admin.from("messages").select("id, body, client_id, created_at").eq("sender_id", responderId).is("deleted_at", null).neq("body", "").eq("client_id", clientId).order("created_at", { ascending: false }).limit(40),
    clientsQ.limit(500),
  ]);
  const ids = (clients ?? []).map((c) => c.id);
  const { data: replies } = ids.length
    ? await admin.from("checkins").select("id, coach_reply, client_id, reviewed_at, submitted_at").in("client_id", ids).neq("coach_reply", "").order("week_start", { ascending: false }).limit(40)
    : { data: [] as Array<{ id: string; coach_reply: string; client_id: string; reviewed_at: string | null; submitted_at: string }> };
  const namesOf = new Map((clients ?? []).map((c) => [c.id, [c.first_name, c.last_name]]));
  const missing = [...new Set([...(pairs ?? []), ...(msgs ?? []), ...(mineMsgs ?? [])].map((r) => r.client_id).filter((id) => !namesOf.has(id)))];
  if (missing.length) {
    const { data } = await admin.from("clients").select("id, first_name, last_name").in("id", missing);
    for (const c of data ?? []) namesOf.set(c.id, [c.first_name, c.last_name]);
  }
  const clean = (text: string, cid: string) => pseudonymize(text, namesOf.get(cid) ?? []);
  const examples: StyleExample[] = [
    ...(pairs ?? []).map((p) => ({ id: p.id, clientId: p.client_id, kind: "correction" as const, draft: clean(p.body, p.client_id), text: clean(p.sent_text!, p.client_id), status: p.status as "used" | "replaced", at: p.closed_at ?? "" })),
    ...[...(msgs ?? []), ...(mineMsgs ?? [])].map((m) => ({ id: m.id, clientId: m.client_id, kind: "message" as const, text: clean(m.body, m.client_id), at: m.created_at })),
    ...(replies ?? []).map((r) => ({ id: r.id, clientId: r.client_id, kind: "checkin" as const, text: clean(r.coach_reply, r.client_id), at: r.reviewed_at ?? r.submitted_at })),
  ];
  return styleParts(examples, clientId);
}

/**
 * Il messaggio per l'AI in tre parti: come scrive il trainer a tutti (cambia
 * poco, resta in cache), poi tutto ciò che riguarda questo cliente, poi la richiesta.
 */
async function promptFor(admin: Admin, responder: string | null, client: ClientRow, rest: string[]): Promise<Part[]> {
  const sb = admin as unknown as ServerSupabase;
  const [style, lessons, context] = await Promise.all([styleSection(admin, responder, client.id), replyLessons(sb, client.id), buildReplyContext(sb, client.id)]);
  const general = [
    lessons.general ? `## Lezioni dalle tue correzioni (valgono con tutti i clienti)\n${lessons.general}` : "",
    style.general,
  ].filter(Boolean).join("\n\n");
  const mine = [
    lessons.client ? `## Lezioni su questo cliente (vincono sulle generali)\n${pseudonymize(lessons.client, [client.first_name, client.last_name])}` : "",
    style.client,
    `## Dati del cliente (oggi è il ${todayISO()})\n${pseudonymize(context, [client.first_name, client.last_name])}`,
  ].filter(Boolean).join("\n\n");
  return [{ text: general, cache: true }, { text: [mine, ...rest].filter(Boolean).join("\n\n") }];
}

function saveText(draft: string, client: ClientRow) {
  return fillName(draft, client.first_name);
}

/**
 * Prepara (o rifà) la bozza di risposta all'ultima domanda in chat.
 * Senza `force` lo fa solo se i messaggi del cliente sembrano chiedere qualcosa.
 */
export async function generateChatDraft(clientId: string, opts: { force?: boolean } = {}): Promise<Result> {
  const admin = createAdminClient();
  const client = await loadClient(admin, clientId);
  const blocked = await canRun(admin, client);
  if (blocked || !client) return { ok: false, error: blocked ?? "Cliente non trovato." };
  if (!client.user_id) return { ok: true, draft: null };

  const { data: rows } = await admin
    .from("messages")
    .select("id, sender_id, body, attachments, created_at")
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(16);
  const atts = (r: { attachments: unknown }) => (Array.isArray(r.attachments) ? (r.attachments as Array<{ kind?: string }>) : []);
  const voiceIds = (rows ?? []).filter((r) => atts(r).some((a) => a.kind === "audio")).map((r) => r.id);
  const { data: transcripts } = voiceIds.length ? await admin.from("message_transcripts").select("message_id, text").in("message_id", voiceIds) : { data: [] };
  const textOf = new Map((transcripts ?? []).map((t) => [t.message_id, t.text]));
  const messages: DraftMessage[] = (rows ?? []).map((r) => ({
    id: r.id,
    fromClient: r.sender_id === client.user_id,
    body: r.body,
    attachments: atts(r).filter((a) => a.kind !== "audio").length,
    createdAt: r.created_at,
    voice: voiceIds.includes(r.id) ? textOf.get(r.id) ?? "" : null,
  }));
  const pending = pendingClientMessages(messages);
  if (!pending.length) return opts.force ? { ok: false, error: "Non ci sono messaggi del cliente a cui rispondere." } : { ok: true, draft: null };
  if (!opts.force && !pending.some((m) => looksLikeQuestion(`${m.body} ${m.voice ?? ""}`))) return { ok: true, draft: null };
  const last = pending[pending.length - 1];

  if (!opts.force) {
    const { data: same } = await admin.from("ai_reply_drafts").select("id").eq("client_id", clientId).eq("source", "chat").eq("status", "ready").eq("last_message_id", last.id).limit(1);
    if (same?.length) return { ok: true, draft: null };
  }

  const responder = await responderFor(admin, client);
  const sorted = [...messages].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const senderLabel = new Map<string, string>();
  for (const r of rows ?? []) senderLabel.set(r.id, r.sender_id === client.user_id ? "Cliente" : r.sender_id === responder ? "Tu" : "Altro coach");
  const names = [client.first_name, client.last_name, client.email, client.phone];
  const convo = sorted.map((m) => `${senderLabel.get(m.id)}: ${pseudonymize(messageText(m), names)}`).join("\n");
  const pendingTxt = pending.map((m) => `- ${pseudonymize(messageText(m), names)}`).join("\n");

  const userText = await promptFor(admin, responder, client, [
    `## Conversazione in chat (dalla più vecchia)\n${convo}`,
    `## Messaggi a cui rispondere ora\n${pendingTxt}`,
    "Scrivi la bozza di risposta a questi messaggi, come la scriveresti tu.",
  ]);

  let out;
  try {
    out = await writeReplyDraft(userText);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "L'assistente non ha risposto, riprova tra poco." };
  }
  await logAiRequest(responder, clientId, "reply", out.usage);

  // nel frattempo sono arrivati altri messaggi? ci pensa la richiesta successiva
  const { data: newest } = await admin.from("messages").select("id, sender_id").eq("client_id", clientId).is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!opts.force && newest && newest.id !== last.id) return { ok: true, draft: null };
  if (!out.needsReply) return opts.force ? { ok: false, error: "Per l'assistente questi messaggi non chiedono una risposta." } : { ok: true, draft: null };

  // la bozza vecchia è superata da questa (non conta come esempio: niente sent_text)
  await admin.from("ai_reply_drafts").update({ status: "replaced", closed_at: new Date().toISOString() }).eq("client_id", clientId).eq("source", "chat").in("status", ["ready", "dismissed"]).is("sent_text", null);
  const { data: saved } = await admin
    .from("ai_reply_drafts")
    .insert({ client_id: clientId, source: "chat", last_message_id: last.id, body: saveText(out.draft, client) })
    .select("id, body, created_at")
    .single();
  return { ok: true, draft: saved ? { id: saved.id, body: saved.body, createdAt: saved.created_at } : null };
}

/** Bozza di risposta a un check-up con una richiesta o un problema scritto. */
export async function generateCheckinDraft(checkinId: string, opts: { force?: boolean } = {}): Promise<Result> {
  const admin = createAdminClient();
  const { data: c } = await admin.from("checkins").select("id, client_id, week_start, training, sleep, stress, adherence, issues, request, coach_reply").eq("id", checkinId).maybeSingle();
  if (!c) return { ok: false, error: "Check-up non trovato." };
  if (!opts.force && (!c.request.trim() || c.coach_reply.trim())) return { ok: true, draft: null };
  const client = await loadClient(admin, c.client_id);
  const blocked = await canRun(admin, client);
  if (blocked || !client) return { ok: false, error: blocked ?? "Cliente non trovato." };
  const { data: existing } = await admin.from("ai_reply_drafts").select("id, status").eq("checkin_id", checkinId).maybeSingle();
  if (existing && existing.status !== "ready" && !opts.force) return { ok: true, draft: null };

  const responder = await responderFor(admin, client);
  const names = [client.first_name, client.last_name, client.email, client.phone];
  const scores = CHECKIN_QUESTIONS.map((q) => `${q.short} ${c[q.key]}/5`).join(", ");
  const userText = await promptFor(admin, responder, client, [
    `## Check-up settimanale appena compilato (settimana del ${c.week_start}, voti da 1 a 5)\n${scores}${c.issues.trim() ? `\nProblemi: ${pseudonymize(c.issues, names)}` : ""}${c.request.trim() ? `\nRichiesta al coach: ${pseudonymize(c.request, names)}` : ""}`,
    "Scrivi la risposta al check-up che il cliente leggerà nell'app: rispondi alla richiesta e, se ci sono, ai problemi. needsReply è true.",
  ]);

  let out;
  try {
    out = await writeReplyDraft(userText);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "L'assistente non ha risposto, riprova tra poco." };
  }
  await logAiRequest(responder, client.id, "reply", out.usage);
  if (!out.draft) return opts.force ? { ok: false, error: "L'assistente non ha preparato una risposta, riprova." } : { ok: true, draft: null };
  const { data: saved } = await admin
    .from("ai_reply_drafts")
    .upsert({ client_id: client.id, source: "checkin", checkin_id: checkinId, body: saveText(out.draft, client), status: "ready", sent_text: null, sent_by: null, closed_at: null, created_at: new Date().toISOString() }, { onConflict: "checkin_id" })
    .select("id, body, created_at")
    .single();
  return { ok: true, draft: saved ? { id: saved.id, body: saved.body, createdAt: saved.created_at } : null };
}

/** La bozza pronta per la chat di un cliente (solo lo staff la vede: permessi del database). */
export async function readyChatDraft(supabase: ServerSupabase, clientId: string): Promise<ReplyDraft | null> {
  const { data } = await supabase.from("ai_reply_drafts").select("id, body, created_at").eq("client_id", clientId).eq("source", "chat").eq("status", "ready").order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data ? { id: data.id, body: data.body, createdAt: data.created_at } : null;
}

/**
 * Lo staff ha risposto: la bozza è stata usata (anche se corretta) oppure
 * sostituita da un messaggio scritto da zero. Il testo inviato resta come esempio.
 */
export async function closeDrafts(supabase: ServerSupabase, filter: { clientId: string; source: "chat" } | { checkinId: string }, sentText: string, sentBy: string, usedDraftId?: string | null) {
  // anche le bozze appena scartate con "Scrivo da zero": quello che scrive il trainer insegna lo stile
  const since = new Date(Date.now() - 3 * 864e5).toISOString();
  let q = supabase.from("ai_reply_drafts").select("id, body").in("status", ["ready", "dismissed"]).is("sent_text", null).gte("created_at", since);
  q = "checkinId" in filter ? q.eq("checkin_id", filter.checkinId) : q.eq("client_id", filter.clientId).eq("source", "chat");
  const { data } = await q.order("created_at", { ascending: false });
  const now = new Date().toISOString();
  let learnFrom: { id: string; used: boolean; body: string } | null = null;
  for (const d of data ?? []) {
    const used = d.id === usedDraftId || similarity(d.body, sentText) >= 0.5;
    await supabase.from("ai_reply_drafts").update({ status: used ? "used" : "replaced", sent_text: sentText.slice(0, 4000), sent_by: sentBy, closed_at: now }).eq("id", d.id);
    // si impara da una sola bozza: quella usata, altrimenti la più recente
    if (!learnFrom || (used && !learnFrom.used)) learnFrom = { id: d.id, used, body: d.body };
  }
  // il trainer l'ha corretta o riscritta: dopo la risposta, l'AI ne ricava le lezioni
  if (learnFrom && worthLearning(learnFrom.body, sentText)) {
    const id = learnFrom.id;
    await pushLater(() => learnFromReply(id, sentBy));
  }
}
