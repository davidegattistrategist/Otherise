"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/site";
import { isISODate, todayISO } from "@/lib/dates";
import type { ActionState } from "@/components/form-bits";
import type { TablesUpdate } from "@/lib/supabase/database.types";

const clientSchema = z.object({
  first_name: z.string().trim().min(1, "Il nome è obbligatorio"),
  last_name: z.string().trim().default(""),
  email: z.string().trim().toLowerCase().email("Email non valida").or(z.literal("")).transform((v) => v || null),
  phone: z.string().trim().transform((v) => v || null),
  sex: z.enum(["M", "F"], { message: "Indica il sesso (serve per le pliche)" }),
  birth_date: z.string().refine((v) => v === "" || isISODate(v), "Data di nascita non valida").transform((v) => v || null),
  goals: z.string().trim().default(""),
  start_date: z.string().refine((v) => v === "" || isISODate(v), "Data di inizio non valida").transform((v) => v || todayISO()),
  weekly_checkin: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
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
  const status = String(fd.get("status") ?? "");
  if (status === "active" || status === "paused" || status === "archived") update.status = status;
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
    return { error: `Invito non inviato: ${error.message}` };
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
  await supabase.from("clients").delete().eq("id", clientId);
  if (client?.user_id) {
    // elimina anche l'account di accesso del cliente
    await createAdminClient().auth.admin.deleteUser(client.user_id);
  }
  revalidatePath("/staff");
  redirect("/staff/clienti");
}
