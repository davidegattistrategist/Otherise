"use server";

import { revalidatePath } from "next/cache";
import { linkAllowedForRole } from "@/lib/invite-link";
import { friendlyError } from "@/lib/friendly-error";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { removeClientFiles } from "@/lib/storage-cleanup";
import { siteUrl } from "@/lib/site";
import { isISODate, todayISO } from "@/lib/dates";
import type { ActionState } from "@/components/form-bits";
import type { TablesUpdate } from "@/lib/supabase/database.types";

const clientSchema = z.object({
  first_name: z.string().trim().min(1, "Il nome è obbligatorio"),
  last_name: z.string().trim().default(""),
  email: z.string().trim().toLowerCase().email("Email non valida").or(z.literal("")).transform((v) => v || null),
  phone: z.string().trim().transform((v) => v || null),
  // da decidere per clienti spot o solo lezioni PT: si sceglie al primo check
  sex: z.enum(["M", "F", ""]).transform((v) => (v ? v : null)),
  birth_date: z.string().refine((v) => v === "" || isISODate(v), "Data di nascita non valida").transform((v) => v || null),
  goals: z.string().trim().default(""),
  start_date: z.string().refine((v) => v === "" || isISODate(v), "Data di inizio non valida").transform((v) => v || todayISO()),
  weekly_checkin: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  // vuota = da decidere (si usano 4 settimane quando si prepara un programma)
  phase_weeks: z.union([z.literal(""), z.coerce.number().int().min(2, "Durata delle fasi non valida").max(12, "Durata delle fasi non valida")]).transform((v) => (v === "" ? null : v)),
});

function readClientForm(fd: FormData) {
  return clientSchema.safeParse({
    first_name: fd.get("first_name") ?? "",
    last_name: fd.get("last_name") ?? "",
    email: fd.get("email") ?? "",
    phone: fd.get("phone") ?? "",
    sex: fd.get("sex") ?? "",
    birth_date: fd.get("birth_date") ?? "",
    goals: fd.get("goals") ?? "",
    start_date: fd.get("start_date") ?? "",
    weekly_checkin: fd.get("weekly_checkin") ?? "",
    phase_weeks: fd.get("phase_weeks") ?? "",
  });
}

function dbError(message: string): string {
  if (message.includes("clients_email_unique")) return "C'è già un cliente con questa email.";
  return "Non è stato possibile salvare. Riprova.";
}

export async function createClientAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const parsed = readClientForm(fd);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const coachId = me.role === "owner" ? (String(fd.get("coach_id") ?? "") || null) : me.id;
  const { data, error } = await supabase.from("clients").insert({ ...parsed.data, coach_id: coachId }).select("id").single();
  if (error || !data) return { error: dbError(error?.message ?? "") };
  if (fd.get("invite_now") === "on" && parsed.data.email) {
    const res = await sendInvite(data.id);
    if (res?.error) redirect(`/staff/clienti/${data.id}/profilo?invito=errore`);
  }
  revalidatePath("/staff");
  redirect(`/staff/clienti/${data.id}`);
}

export async function updateClientAction(clientId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const parsed = readClientForm(fd);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: before } = await supabase.from("clients").select("email, user_id").eq("id", clientId).maybeSingle();
  const update: TablesUpdate<"clients"> = { ...parsed.data };
  // "Inizio percorso" lasciato vuoto in una modifica: resta la data di prima (non diventa oggi)
  if (!String(fd.get("start_date") ?? "").trim()) delete update.start_date;
  if (me.role === "owner") update.coach_id = String(fd.get("coach_id") ?? "") || null;
  const { error } = await supabase.from("clients").update(update).eq("id", clientId);
  if (error) return { error: dbError(error.message) };
  const notes = fd.get("private_notes");
  if (notes !== null) {
    await supabase.from("client_private_notes").upsert({ client_id: clientId, notes: String(notes), updated_at: new Date().toISOString() });
  }
  // email corretta dopo un invito mai usato: l'account con l'email sbagliata non serve più
  let note = "";
  if (before?.user_id && (before.email ?? "") !== (parsed.data.email ?? "")) {
    const dropped = await dropUnusedAccount(before.user_id, parsed.data.email);
    if (dropped) note = parsed.data.email ? " L'invito mandato alla vecchia email non vale più: premi “Invia invito” per mandarlo a quella nuova." : "";
  }
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
  return { ok: true, message: `Scheda salvata.${note}` };
}

/**
 * L'account creato da un invito con un'email sbagliata: se il cliente non è
 * mai entrato e l'email non è più quella della scheda, lo si toglie (il
 * collegamento al cliente si libera da solo), così il prossimo invito parte
 * con l'email giusta. Mai per chi è già entrato o per lo staff.
 */
async function dropUnusedAccount(userId: string, email: string | null): Promise<boolean> {
  const admin = createAdminClient();
  const [{ data: u }, { data: prof }] = await Promise.all([admin.auth.admin.getUserById(userId), admin.from("profiles").select("role").eq("id", userId).maybeSingle()]);
  const user = u.user;
  if (!user || user.last_sign_in_at) return false;
  if (prof && prof.role !== "client" && prof.role !== "none") return false;
  if (email && user.email?.toLowerCase() === email.toLowerCase()) return false;
  const { error } = await admin.auth.admin.deleteUser(userId);
  return !error;
}

/**
 * L'email scritta nella scheda ma non ancora salvata (si corregge e si preme
 * subito "Rimanda l'invito"): si salva prima di mandare l'invito.
 */
async function saveTypedEmail(clientId: string, fd: FormData | undefined): Promise<{ error?: string; saved?: boolean }> {
  const raw = String(fd?.get("email") ?? "").trim().toLowerCase();
  if (!raw) return {};
  const parsed = z.string().email().safeParse(raw);
  if (!parsed.success) return { error: "L'email scritta nella scheda non è valida: correggila e riprova." };
  const supabase = await createClient();
  const { data: client } = await supabase.from("clients").select("email, user_id").eq("id", clientId).maybeSingle();
  if (!client || client.email === raw) return {};
  const { error } = await supabase.from("clients").update({ email: raw }).eq("id", clientId);
  if (error) return { error: dbError(error.message) };
  if (client.user_id) await dropUnusedAccount(client.user_id, raw);
  return { saved: true };
}

/** Manda l'email di invito al cliente (crea il suo account). */
async function sendInvite(clientId: string): Promise<ActionState> {
  const supabase = await createClient();
  // la lettura passa dai permessi: se lo staff non gestisce il cliente non lo trova
  const { data: client } = await supabase.from("clients").select("id, email, user_id").eq("id", clientId).maybeSingle();
  if (!client) return { error: "Cliente non trovato." };
  if (!client.email) return { error: "Aggiungi prima l'email del cliente." };
  const admin = createAdminClient();
  if (client.user_id) {
    const { data: u } = await admin.auth.admin.getUserById(client.user_id);
    if (u.user?.last_sign_in_at) return { error: "Il cliente ha già un account. Se ha perso la password può usare “Password dimenticata”." };
    // invitato ma mai entrato: se l'invito era partito per un'altra email, quell'account si toglie
    await dropUnusedAccount(client.user_id, client.email);
  }
  const { error } = await admin.auth.admin.inviteUserByEmail(client.email, {
    redirectTo: `${await siteUrl()}/auth/confirm?next=/imposta-password`,
  });
  if (error) {
    if (/already/i.test(error.message)) {
      // esiste già un account con questa email (per esempio registrato prima dell'invito): lo colleghiamo
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const user = list?.users.find((u) => u.email?.toLowerCase() === client.email);
      if (!user) return { error: "Esiste già un account con questa email ma non riesco a trovarlo." };
      const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (prof && prof.role !== "none" && prof.role !== "client") return { error: "Questa email appartiene a un membro dello staff." };
      await admin.from("clients").update({ user_id: user.id }).eq("id", client.id);
      await admin.from("profiles").upsert({ id: user.id, email: client.email, role: "client" });
      return { ok: true, message: "Il cliente aveva già un account: ora è collegato. Può entrare con la sua password o usare “Password dimenticata”." };
    }
    return { error: `Invito non inviato. ${friendlyError(error)}` };
  }
  return { ok: true, message: `Invito inviato a ${client.email}.` };
}

export async function inviteClientAction(clientId: string, _: ActionState, fd?: FormData): Promise<ActionState> {
  await requireStaff();
  const typed = await saveTypedEmail(clientId, fd);
  if (typed.error) return { error: typed.error };
  const res = await sendInvite(clientId);
  if (typed.saved && res?.ok) res.message = `${res.message} Ho salvato anche la nuova email nella scheda.`;
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
  return res;
}

export async function deleteClientAction(clientId: string) {
  await requireOwner();
  const supabase = await createClient();
  const { data: client } = await supabase.from("clients").select("user_id").eq("id", clientId).maybeSingle();
  if (!client) return;
  // prima il cliente (se non riesce non si tocca niente), poi tutti i suoi file:
  // foto, video e vocali della chat (anche quelli mai inviati) e foto dei check
  const { error } = await supabase.from("clients").delete().eq("id", clientId);
  if (error) redirect(`/staff/clienti/${clientId}/profilo?errore=elimina`);
  await removeClientFiles(clientId);
  if (client?.user_id) {
    // elimina anche l'account di accesso del cliente
    await createAdminClient().auth.admin.deleteUser(client.user_id);
  }
  revalidatePath("/staff");
  redirect("/staff/clienti");
}

/**
 * Stato del percorso: in corso, in pausa (usa l'app come sempre ma non è tra i
 * pagamenti da incassare) o terminato (ex cliente: gli resta solo la chat).
 */
export async function setClientStatus(clientId: string, status: "active" | "paused" | "archived") {
  await requireStaff();
  const supabase = await createClient();
  const { data, error } = await supabase.from("clients").update({ status }).eq("id", clientId).select("id");
  if (error || !data?.length) redirect(`/staff/clienti/${clientId}/profilo?errore=stato`);
  revalidatePath("/staff", "layout");
  redirect(`/staff/clienti/${clientId}/profilo?stato=${status}`);
}

export type InviteLinkState = { link?: string; error?: string } | null;

/**
 * Link per entrare senza aspettare l'email (da mandare su WhatsApp o per
 * messaggio): crea l'account se serve e prepara il link per scegliere la
 * password. Il link apre una pagina con un pulsante, così le anteprime dei
 * messaggi non lo consumano.
 */
export async function inviteLinkAction(clientId: string, _: InviteLinkState, fd?: FormData): Promise<InviteLinkState> {
  await requireStaff();
  const typed = await saveTypedEmail(clientId, fd);
  if (typed.error) return { error: typed.error };
  const supabase = await createClient();
  const { data: first } = await supabase.from("clients").select("id, email, user_id").eq("id", clientId).maybeSingle();
  if (!first) return { error: "Cliente non trovato." };
  if (!first.email) return { error: "Aggiungi prima l'email del cliente." };
  // invito partito per un'altra email e mai usato: quell'account si toglie e si riparte
  const client = first.user_id && (await dropUnusedAccount(first.user_id, first.email)) ? { ...first, user_id: null } : first;
  const admin = createAdminClient();
  // Il link di recupero apre l'account dell'email a cui è intestato: si usa
  // solo per l'account collegato al cliente (mai un'email scritta a mano nella
  // scheda, che potrebbe essere quella del titolare) e solo se è un cliente.
  let type: "invite" | "recovery" = client.user_id ? "recovery" : "invite";
  let email: string = first.email;
  if (client.user_id) {
    const [{ data: u }, { data: prof }] = await Promise.all([admin.auth.admin.getUserById(client.user_id), admin.from("profiles").select("role").eq("id", client.user_id).maybeSingle()]);
    if (!u.user?.email || !linkAllowedForRole(prof?.role)) return { error: "Questo account non è di un cliente: il link non si può preparare." };
    email = u.user.email;
  }
  let res = await admin.auth.admin.generateLink({ type, email });
  if (res.error && type === "invite" && /already/i.test(res.error.message)) {
    // l'account c'è già (per esempio registrato prima): link per scegliere la password,
    // ma solo se è un cliente (non un membro dello staff) e non è mai entrato
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const user = list?.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
    if (!user) return { error: "Esiste già un account con questa email ma non riesco a trovarlo." };
    const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!linkAllowedForRole(prof?.role)) return { error: "Questa email appartiene a un membro dello staff." };
    if (user.last_sign_in_at) return { error: "Esiste già un account con questa email che è già entrato: può usare “Password dimenticata”." };
    type = "recovery";
    res = await admin.auth.admin.generateLink({ type, email });
  }
  const hash = res.data?.properties?.hashed_token;
  if (res.error || !hash) return { error: `Non sono riuscito a preparare il link. ${res.error ? friendlyError(res.error) : ""}`.trim() };
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
  return { link: `${await siteUrl()}/auth/entra?token_hash=${encodeURIComponent(hash)}&type=${type}` };
}
