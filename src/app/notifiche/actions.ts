"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Apre una notifica: la segna come letta e porta alla pagina giusta. */
export async function openNotification(id: string) {
  const me = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("recipient_id", me.id).select("link").maybeSingle();
  revalidatePath("/", "layout");
  const link = data?.link && data.link.startsWith("/") && !data.link.startsWith("//") ? data.link : null;
  redirect(link ?? (me.role === "client" ? "/cliente/notifiche" : "/staff/notifiche"));
}

export async function markAllRead() {
  const me = await requireUser();
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", me.id).is("read_at", null);
  revalidatePath("/", "layout");
}
