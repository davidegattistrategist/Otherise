"use server";

import { revalidatePath } from "next/cache";
import { friendlyError } from "@/lib/friendly-error";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/site";
import { isISODate, todayISO } from "@/lib/dates";
import { CHAT_BUCKET } from "@/lib/chat-shared";
import { CHECK_PHOTOS_BUCKET } from "@/lib/check-photos";
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
  const update: TablesUpdate<"clients"> = { ...parsed.data };
  if (me.role === "owner") update.coach_id = String(fd.get("coach_id") ?? "") || null;
  const { error } = await supabase.from("clients").update(update).eq("id", clientId);
  if (error) return { error: dbError(error.message) };
  const notes = fd.get("private_notes");
  if (notes !== null) {
    await supabase.from("client_private_notes").upsert({ client_id: clientId, notes: String(notes), updated_at: new Date().toISOString() });
  }
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
  return { ok: true, message: "Scheda salvata." };
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
    // invitato ma mai entrato: rimandiamo l'invito
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

export async function inviteClientAction(clientId: string, _: ActionState): Promise<ActionState> {
  await requireStaff();
  const res = await sendInvite(clientId);
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
  return res;
}

export async function deleteClientAction(clientId: string) {
  await requireOwner();
  const supabase = await createClient();
  const { data: client } = await supabase.from("clients").select("user_id").eq("id", clientId).maybeSingle();
  if (!client) return;
  // foto e video della chat e foto dei check: vanno cancellati anche dall'archivio
  const admin = createAdminClient();
  const { data: msgs } = await admin.from("messages").select("attachments").eq("client_id", clientId);
  const paths = (msgs ?? []).flatMap((m) => ((m.attachments ?? []) as Array<{ path?: string }>).map((a) => a.path).filter((p): p is string => Boolean(p)));
  for (let i = 0; i < paths.length; i += 100) await admin.storage.from(CHAT_BUCKET).remove(paths.slice(i, i + 100));
  // e le foto dei check
  const { data: photos } = await admin.from("check_photos").select("path, thumb_path").eq("client_id", clientId);
  const photoPaths = (photos ?? []).flatMap((p) => [p.path, p.thumb_path]);
  for (let i = 0; i < photoPaths.length; i += 100) await admin.storage.from(CHECK_PHOTOS_BUCKET).remove(photoPaths.slice(i, i + 100));
  await supabase.from("clients").delete().eq("id", clientId);
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
  await supabase.from("clients").update({ status }).eq("id", clientId);
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
export async function inviteLinkAction(clientId: string, _: InviteLinkState): Promise<InviteLinkState> {
  await requireStaff();
  const supabase = await createClient();
  const { data: client } = await supabase.from("clients").select("id, email, user_id").eq("id", clientId).maybeSingle();
  if (!client) return { error: "Cliente non trovato." };
  if (!client.email) return { error: "Aggiungi prima l'email del cliente." };
  const admin = createAdminClient();
  let type: "invite" | "recovery" = client.user_id ? "recovery" : "invite";
  let res = await admin.auth.admin.generateLink({ type, email: client.email });
  if (res.error && type === "invite" && /already/i.test(res.error.message)) {
    // l'account c'è già (per esempio invitato prima): link per scegliere la password
    type = "recovery";
    res = await admin.auth.admin.generateLink({ type, email: client.email });
  }
  const hash = res.data?.properties?.hashed_token;
  if (res.error || !hash) return { error: `Non sono riuscito a preparare il link. ${res.error ? friendlyError(res.error) : ""}`.trim() };
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
  return { link: `${await siteUrl()}/auth/entra?token_hash=${encodeURIComponent(hash)}&type=${type}` };
}
