"use server";

import { redirect } from "next/navigation";
import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PRIVACY_VERSION } from "@/lib/privacy";
import type { ActionState } from "@/components/form-bits";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify, staffRecipients } from "@/lib/notify";

export async function acceptPrivacy(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireClient();
  if (fd.get("consent") !== "on") return { error: "Senza questo consenso non possiamo usare l'app per il tuo percorso. Se hai dubbi, parlane con il tuo coach." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_privacy", { version: PRIVACY_VERSION, instagram: fd.get("instagram") === "on" });
  if (error) return { error: "Non sono riuscito a salvare. Riprova tra poco." };
  // niente permesso per Instagram: lo staff lo sa, così può parlargliene (il cliente lo può dare quando vuole da Percorso → Privacy)
  if (fd.get("instagram") !== "on") await instagramAlert(me.clientId);
  redirect("/cliente");
}

async function instagramAlert(clientId: string) {
  const { data: c } = await createAdminClient().from("clients").select("first_name, last_name").eq("id", clientId).maybeSingle();
  const name = c ? `${c.first_name} ${c.last_name}`.trim() : "Un cliente";
  const ids = await staffRecipients(clientId);
  await notify(ids.map((id) => ({
    recipient_id: id,
    client_id: clientId,
    kind: "instagram_consent",
    title: `${name} non ha dato il permesso per Instagram`,
    body: "Non possiamo pubblicare video o foto delle sedute con lui nelle storie. Se pensi che gli faccia piacere, parlagliene: può dare il permesso quando vuole dall'app, in Percorso → Privacy → Video sui social.",
    link: `/staff/clienti/${clientId}/profilo`,
    dedupe_key: `instagram:none:${clientId}`,
  })));
}
