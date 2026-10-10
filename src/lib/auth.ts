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
};

/** L'utente collegato con il suo ruolo (una sola lettura per richiesta). */
export const getMe = cache(async (): Promise<Me | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase.from("profiles").select("full_name, role, email").eq("id", data.user.id).maybeSingle();
  const role = (profile?.role ?? "none") as Role;
  let clientId: string | null = null;
  if (role === "client") {
    const { data: c } = await supabase.from("clients").select("id").eq("user_id", data.user.id).maybeSingle();
    clientId = c?.id ?? null;
  }
  return {
    id: data.user.id,
    email: profile?.email ?? data.user.email ?? "",
    fullName: profile?.full_name ?? "",
    role,
    clientId,
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

export function homeFor(role: Role): string {
  if (role === "owner" || role === "coach") return "/staff";
  if (role === "client") return "/cliente";
  return "/in-attesa";
}
