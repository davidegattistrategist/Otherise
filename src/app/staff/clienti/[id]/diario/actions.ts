"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";
import { emailsLater } from "@/lib/email";
import { closeDrafts, generateCheckinDraft, type ReplyDraft } from "@/lib/ai/reply";

export async function reviewCheckin(clientId: string, checkinId: string, fd: FormData) {
  const me = await requireStaff();
  const supabase = await createClient();
  const reply = String(fd.get("coach_reply") ?? "").trim();
  const { data: before } = await supabase.from("checkins").select("coach_reply").eq("id", checkinId).eq("client_id", clientId).maybeSingle();
  if (!before) return;
  await supabase.from("checkins").update({ coach_reply: reply, reviewed_at: new Date().toISOString() }).eq("id", checkinId).eq("client_id", clientId);
  // la bozza dell'assistente: usata (anche se corretta) o sostituita. Il testo vero insegna lo stile.
  if (reply && reply !== before.coach_reply) {
    const used = String(fd.get("draft_used") ?? "");
    await closeDrafts(supabase, { checkinId }, reply, me.id, /^[0-9a-f-]{36}$/i.test(used) ? used : null);
  }
  // Il "visto" sulle notifiche di questo diario per chi l'ha guardato
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", me.id).like("dedupe_key", `checkin:${checkinId}:%`).is("read_at", null);
  if (reply && reply !== before.coach_reply) {
    const { data: client } = await supabase.from("clients").select("user_id").eq("id", clientId).maybeSingle();
    if (client?.user_id) {
      await notify([{ recipient_id: client.user_id, client_id: clientId, kind: "checkin_reply", title: `${me.fullName.split(" ")[0] || "Il tuo coach"} ha risposto al tuo diario`, body: reply.slice(0, 280), link: "/cliente/diario", dedupe_key: `reply:${checkinId}:${reply.length}` }]);
      await emailsLater();
    }
  }
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
  revalidatePath("/staff");
}

export async function requestCheckinDraft(clientId: string, checkinId: string): Promise<{ ok: true; draft: ReplyDraft | null } | { ok: false; error: string }> {
  await requireStaff();
  const supabase = await createClient();
  // passa dai permessi: se lo staff non vede il diario, niente bozza
  const { data } = await supabase.from("checkins").select("id").eq("id", checkinId).eq("client_id", clientId).maybeSingle();
  if (!data) return { ok: false, error: "Diario non trovato." };
  return generateCheckinDraft(checkinId, { force: true });
}
