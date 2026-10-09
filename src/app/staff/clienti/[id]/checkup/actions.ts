"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";
import { deliverPendingEmails } from "@/lib/email";

export async function reviewCheckin(clientId: string, checkinId: string, fd: FormData) {
  const me = await requireStaff();
  const supabase = await createClient();
  const reply = String(fd.get("coach_reply") ?? "").trim();
  const { data: before } = await supabase.from("checkins").select("coach_reply").eq("id", checkinId).eq("client_id", clientId).maybeSingle();
  if (!before) return;
  await supabase.from("checkins").update({ coach_reply: reply, reviewed_at: new Date().toISOString() }).eq("id", checkinId).eq("client_id", clientId);
  // Il "visto" sulle notifiche di questo check-up per chi l'ha guardato
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", me.id).like("dedupe_key", `checkin:${checkinId}:%`).is("read_at", null);
  if (reply && reply !== before.coach_reply) {
    const { data: client } = await supabase.from("clients").select("user_id").eq("id", clientId).maybeSingle();
    if (client?.user_id) {
      await notify([{ recipient_id: client.user_id, client_id: clientId, kind: "checkin_reply", title: `${me.fullName.split(" ")[0] || "Il tuo coach"} ha risposto al tuo check-up`, body: reply.slice(0, 280), link: "/cliente/checkup", dedupe_key: `reply:${checkinId}:${reply.length}` }]);
      await deliverPendingEmails();
    }
  }
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
  revalidatePath("/staff");
}
