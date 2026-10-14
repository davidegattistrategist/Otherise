"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { snoozeUntil } from "@/lib/chat-silence";
import { todayISO } from "@/lib/dates";

/** Il trainer ha visto la segnalazione di dolore o fastidio. */
export async function markDiscomfortSeen(logId: string) {
  await requireStaff();
  const supabase = await createClient();
  await supabase.from("workout_logs").update({ discomfort_seen_at: new Date().toISOString() }).eq("id", logId);
  revalidatePath("/staff");
}

/** Il trainer ha letto la nota finale del cliente (esce da Oggi, resta nella linea del tempo). */
export async function markNoteSeen(logId: string) {
  await requireStaff();
  const supabase = await createClient();
  await supabase.from("workout_logs").update({ note_seen_at: new Date().toISOString() }).eq("id", logId);
  revalidatePath("/staff");
}

/**
 * "Non senti X da N giorni" rimandato di 5 giorni: esce da Oggi e, se nel
 * frattempo non vi scrivete, torna con una nuova notifica.
 */
export async function snoozeChatSilence(clientId: string) {
  const me = await requireStaff();
  const supabase = await createClient();
  await supabase.from("chat_snoozes").upsert({ client_id: clientId, until: snoozeUntil(todayISO()), snoozed_by: me.id });
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", me.id).eq("kind", "chat_silence").eq("client_id", clientId).is("read_at", null);
  revalidatePath("/staff");
}
