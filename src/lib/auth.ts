import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

export type Role = "owner" | "coach" | "client" | "none";

export type Me = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  clientId: string | null;
  /** Solo per i clienti: active, paused (in pausa) o archived (percorso terminato) */
  clientStatus: string | null;
};

/** L'utente collegato con il suo ruolo (una sola lettura per richiesta). */
export const getMe = cache(async (): Promise<Me | null> => {
  const supabase = await createClient();
  // firma del token controllata sul server (senza chiamare Auth a ogni pagina)
  const { data: auth } = await supabase.auth.getClaims();
  const userId = typeof auth?.claims?.sub === "string" ? auth.claims.sub : null;
  if (!userId) return null;
  // profilo e scheda cliente insieme (una sola attesa)
  const [{ data: profile }, { data: c }] = await Promise.all([
    supabase.from("profiles").select("full_name, role, email").eq("id", userId).maybeSingle(),
    supabase.from("clients").select("id, status").eq("user_id", userId).maybeSingle(),
  ]);
  const role = (profile?.role ?? "none") as Role;
  const isClient = role === "client";
  return {
    id: userId,
    email: profile?.email ?? (typeof auth?.claims?.email === "string" ? auth.claims.email : ""),
    fullName: profile?.full_name ?? "",
    role,
    clientId: isClient ? (c?.id ?? null) : null,
    clientStatus: isClient ? (c?.status ?? null) : null,
  };
});

export async function requireUser(): Promise<Me> {
  const me = await getMe();
  if (!me) redirect("/login");
  return me;
}

export async function requireStaff(): Promise<Me> {
  const me = await requireUser();
  if (me.role !== "owner" && me.role !== "coach") redirect("/");
  return me;
}

export async function requireOwner(): Promise<Me> {
  const me = await requireUser();
  if (me.role !== "owner") redirect("/staff?solo-titolare=1");
  return me;
}

export async function requireClient(): Promise<Me & { clientId: string }> {
  const me = await requireUser();
  if (me.role !== "client" || !me.clientId) redirect("/");
  return me as Me & { clientId: string };
}

/**
 * Pagine del percorso (programma, allenamenti, progressi, check-up): a chi ha
 * terminato il percorso resta solo la chat.
 */
export async function requireActiveClient(): Promise<Me & { clientId: string }> {
  const me = await requireClient();
  if (me.clientStatus === "archived") redirect("/cliente/messaggi");
  return me;
}

export function homeFor(role: Role): string {
  if (role === "owner" || role === "coach") return "/staff";
  if (role === "client") return "/cliente";
  return "/in-attesa";
}
