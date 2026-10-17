"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { HOME_COOKIE } from "@/lib/home-cookie";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";
import type { ActionState } from "@/components/form-bits";

export async function signIn(_: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Inserisci email e password." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Email o password non corrette." };
  // un altro account su questo telefono: la pagina iniziale la decide di nuovo "/"
  (await cookies()).delete(HOME_COOKIE);
  redirect("/");
}

export async function sendReset(_: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Inserisci la tua email." };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${await siteUrl()}/auth/confirm?next=/imposta-password` });
  // Stessa risposta anche se l'email non esiste, per non rivelare chi è iscritto
  return { ok: true, message: "Se l'email è registrata, tra poco ricevi il link per scegliere una nuova password." };
}

export async function setPassword(_: ActionState, formData: FormData): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "La password deve avere almeno 8 caratteri." };
  if (password !== confirm) return { error: "Le due password non coincidono." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "Il link è scaduto o non è valido. Chiedi un nuovo link." };
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(HOME_COOKIE);
  redirect("/login");
}

/** Cambio password dall'interno dell'app (utente già collegato). */
export async function changePassword(_: ActionState, formData: FormData): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "La password deve avere almeno 8 caratteri." };
  if (password !== confirm) return { error: "Le due password non coincidono." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: /different/i.test(error.message) ? "La nuova password deve essere diversa da quella attuale." : "Non sono riuscito a cambiare la password. Riprova." };
  return { ok: true, message: "Password cambiata." };
}
