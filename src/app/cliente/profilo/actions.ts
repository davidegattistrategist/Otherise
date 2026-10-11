"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify, staffRecipients } from "@/lib/notify";
import { todayISO } from "@/lib/dates";
import type { ActionState } from "@/components/form-bits";

async function clientName(clientId: string) {
  const { data } = await createAdminClient().from("clients").select("first_name, last_name").eq("id", clientId).maybeSingle();
  return data ? `${data.first_name} ${data.last_name}`.trim() : "Un cliente";
}

/** Revoca del consenso sui dati di salute: avvisa lo staff e torna alla pagina del consenso. */
export async function withdrawConsent() {
  const me = await requireClient();
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_health_consent");
  if (error) return;
  const name = await clientName(me.clientId);
  const ids = await staffRecipients(me.clientId);
  await notify(ids.map((id) => ({
    recipient_id: id,
    client_id: me.clientId,
    kind: "privacy_request",
    title: `Privacy: ${name} ha revocato il consenso`,
    body: "Ha revocato il consenso sui dati relativi alla salute: non registrare nuovi check finché non ne parlate.",
    link: `/staff/clienti/${me.clientId}/profilo`,
    dedupe_key: `privacy:withdraw:${me.clientId}:${todayISO()}`,
  })));
  redirect("/consenso");
}

/** Richiesta di copia o cancellazione dei dati: arriva al titolare. */
export async function requestData(kind: "copy" | "delete", _: ActionState, __: FormData): Promise<ActionState> {
  const me = await requireClient();
  const admin = createAdminClient();
  const [{ data: owners }, name] = await Promise.all([admin.from("profiles").select("id").eq("role", "owner"), clientName(me.clientId)]);
  await notify((owners ?? []).map((o) => ({
    recipient_id: o.id,
    client_id: me.clientId,
    kind: "privacy_request",
    title: kind === "copy" ? `Privacy: ${name} chiede una copia dei suoi dati` : `Privacy: ${name} chiede di cancellare i suoi dati`,
    body: kind === "copy"
      ? "Scarica i dati dalla sua scheda (Scheda → Privacy → Scarica i dati) e mandaglieli entro un mese."
      : "Rispondi entro un mese. Se non ci sono motivi per conservarli, eliminali dalla sua scheda (Scheda → Elimina per sempre).",
    link: `/staff/clienti/${me.clientId}/profilo`,
    dedupe_key: `privacy:${kind}:${me.clientId}:${todayISO()}`,
  })));
  return { ok: true, message: "Richiesta inviata. Ti rispondiamo entro un mese." };
}

/** Permesso facoltativo per Instagram: il cliente lo dà o lo toglie quando vuoi; se lo toglie avvisiamo lo staff. */
export async function setInstagramConsent(consent: boolean) {
  const me = await requireClient();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_instagram_consent", { consent });
  if (error) return;
  if (!consent) {
    const name = await clientName(me.clientId);
    const ids = await staffRecipients(me.clientId);
    await notify(ids.map((id) => ({
      recipient_id: id,
      client_id: me.clientId,
      kind: "privacy_request",
      title: `Privacy: ${name} non vuole più comparire sui social`,
      body: "Ha tolto il permesso di pubblicare video e foto su Instagram: da ora non pubblicare nuovi contenuti con lui. Quelli già pubblicati possono restare, salvo sua richiesta.",
      link: `/staff/clienti/${me.clientId}/profilo`,
      dedupe_key: `privacy:instagram:${me.clientId}:${todayISO()}`,
    })));
  }
  revalidatePath("/cliente/profilo");
}
