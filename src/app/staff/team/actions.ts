"use server";

import { revalidatePath } from "next/cache";
import { friendlyError } from "@/lib/friendly-error";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/site";
import type { ActionState } from "@/components/form-bits";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function inviteCollaborator(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireOwner();
  const supabase = await createClient();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const fullName = String(fd.get("full_name") ?? "").trim();
  if (!EMAIL_RE.test(email)) return { error: "Email non valida." };
  if (!fullName) return { error: "Scrivi nome e cognome." };
  if (email === me.email.toLowerCase()) return { error: "Questa è la tua email." };

  const admin = createAdminClient();
  const { data: existingClient } = await admin.from("clients").select("id").eq("email", email).maybeSingle();
  if (existingClient) return { error: "Questa email è già usata da un cliente." };

  const { data: existingProfile } = await admin.from("profiles").select("id, role").eq("email", email).maybeSingle();
  if (existingProfile) {
    if (existingProfile.role === "coach" || existingProfile.role === "owner") return { error: "È già nello staff." };
    if (existingProfile.role === "client") return { error: "Questa email appartiene a un cliente." };
    // account già esistente ma senza ruolo: diventa collaboratore subito
    await supabase.from("profiles").update({ role: "coach", full_name: fullName }).eq("id", existingProfile.id).throwOnError();
    revalidatePath("/staff/team");
    return { ok: true, message: `${fullName} aveva già un account: ora è collaboratore e può entrare con la sua password.` };
  }

  const { error: invErr } = await supabase.from("staff_invites").upsert({ email, full_name: fullName });
  if (invErr) return { error: "Non riesco a salvare l'invito." };
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${await siteUrl()}/auth/confirm?next=/imposta-password`,
    data: { full_name: fullName },
  });
  if (error) {
    await supabase.from("staff_invites").delete().eq("email", email);
    return { error: `Invito non inviato. ${friendlyError(error)}` };
  }
  revalidatePath("/staff/team");
  return { ok: true, message: `Invito inviato a ${email}.` };
}

/** Annulla l'invito di chi non è mai entrato: l'account creato dall'invito viene eliminato. */
export async function cancelInvite(userId: string) {
  await requireOwner();
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.getUserById(userId);
  const { data: prof } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (data.user && !data.user.last_sign_in_at && prof?.role === "coach") await admin.auth.admin.deleteUser(userId);
  revalidatePath("/staff/team");
}

export async function resendInvite(userId: string) {
  await requireOwner();
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.getUserById(userId);
  if (data.user?.email && !data.user.last_sign_in_at) {
    await admin.auth.admin.inviteUserByEmail(data.user.email, { redirectTo: `${await siteUrl()}/auth/confirm?next=/imposta-password` });
  }
  revalidatePath("/staff/team");
}

/** Toglie l'accesso a un collaboratore: i suoi clienti tornano al titolare. */
export async function removeCollaborator(userId: string) {
  await requireOwner();
  const supabase = await createClient();
  await supabase.from("clients").update({ coach_id: null }).eq("coach_id", userId);
  await supabase.from("profiles").update({ role: "none" }).eq("id", userId).eq("role", "coach");
  revalidatePath("/staff/team");
  revalidatePath("/staff/clienti");
}

export async function renameStaff(userId: string, fd: FormData) {
  const me = await requireOwner();
  const supabase = await createClient();
  const fullName = String(fd.get("full_name") ?? "").trim();
  if (!fullName) return;
  await supabase.from("profiles").update({ full_name: fullName }).eq("id", userId);
  if (userId === me.id) revalidatePath("/", "layout");
  revalidatePath("/staff/team");
}
