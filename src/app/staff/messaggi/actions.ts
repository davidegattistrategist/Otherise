"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * "Segna da leggere": la chat torna tra quelle da rispondere, come se l'ultimo
 * messaggio del cliente non l'avessi ancora visto. Poi torna all'elenco
 * (restando nella chat verrebbe di nuovo segnata come letta).
 */
export async function markChatUnread(clientId: string) {
  const me = await requireStaff();
  const supabase = await createClient();
  const { data: last } = await supabase
    .from("messages")
    .select("created_at")
    .eq("client_id", clientId)
    .neq("sender_id", me.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last) {
    const before = new Date(new Date(last.created_at).getTime() - 1000).toISOString();
    await supabase.from("chat_reads").upsert({ user_id: me.id, client_id: clientId, last_read_at: before });
  }
  revalidatePath("/staff/messaggi");
  revalidatePath("/staff", "layout");
  redirect("/staff/messaggi?vista=da-rispondere&segnata=1");
}
