import type { Metadata } from "next";
import { setClientFree } from "../pagamenti/actions";
import { requireStaff } from "@/lib/auth";
import { getStaffClient } from "@/lib/data/client";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button, Card, Eyebrow, Notice } from "@/components/ui";
import { ConfirmButton } from "@/components/form-bits";
import { ClientForm } from "../../client-form";
import { deleteClientAction, inviteClientAction, inviteLinkAction, setClientStatus, updateClientAction } from "../../actions";
import { InviteButton } from "./invite-button";
import { InviteLink } from "./invite-link";
import { PrivacyStaffCard } from "./privacy-staff-card";
import { ClearParams } from "@/components/clear-param";

export const metadata: Metadata = { title: "Scheda cliente" };

export default async function ClientProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ invito?: string; stato?: string; errore?: string }> }) {
  const { id } = await params;
  const { invito, stato, errore } = await searchParams;
  const me = await requireStaff();
  const client = await getStaffClient(id);
  const supabase = await createClient();
  const [{ data: coaches }, { data: notes }, { data: consent }, account] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("role", "coach").order("full_name"),
    supabase.from("client_private_notes").select("notes").eq("client_id", id).maybeSingle(),
    supabase.from("clients").select("health_consent_at, consent_source, instagram_consent_at").eq("id", id).single(),
    client.user_id ? createAdminClient().auth.admin.getUserById(client.user_id).then((r) => r.data.user) : Promise.resolve(null),
  ]);
  const hasEntered = Boolean(account?.last_sign_in_at);
  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
      <Card className="flex flex-col gap-3 [grid-column:1/-1]">
        <Eyebrow>Percorso</Eyebrow>
        {errore ? <><ClearParams names={["errore"]} /><Notice tone="error">{errore === "elimina" ? "Non sono riuscito a eliminare il cliente: non è cambiato niente. Riprova tra poco." : "Non sono riuscito a cambiare il percorso: non è cambiato niente. Riprova tra poco."}</Notice></> : null}
        {stato ? <><ClearParams names={["stato"]} /><Notice tone="success">{stato === "paused" ? "Cliente in pausa." : stato === "archived" ? "Percorso terminato: al cliente resta solo la chat." : stato === "gratis" ? "Cliente gratis: fuori da pagamenti, incassi e previsioni." : stato === "pagante" ? "Il cliente torna nei pagamenti." : "Cliente di nuovo attivo."}</Notice></> : null}
        {client.status === "paused" ? (
          <p className="text-[15px] leading-relaxed text-muted">In pausa: usa l&apos;app come sempre, ma non compare tra i pagamenti da incassare, nelle previsioni e nei promemoria. Quando rinnova, riattivalo.</p>
        ) : client.status === "archived" ? (
          <p className="text-[15px] leading-relaxed text-muted">Percorso terminato: entrando nell&apos;app il cliente vede solo la chat con te. Programmi, misure e pagamenti restano salvati e li vedi tu. Lo trovi in Clienti → Ex clienti.</p>
        ) : (
          <p className="text-[15px] leading-relaxed text-muted">Percorso in corso. Se si ferma per un po&apos; mettilo in pausa; se finite, termina il percorso.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {client.status !== "active" ? (
            <form action={setClientStatus.bind(null, id, "active")}>
              <Button type="submit" size="sm">{client.status === "paused" ? "Riattiva" : "Riprendi il percorso"}</Button>
            </form>
          ) : null}
          {client.status === "active" ? (
            <form action={setClientStatus.bind(null, id, "paused")}>
              <ConfirmButton variant="secondary" message={`Mettere in pausa ${client.first_name}? Continua a usare l'app, ma non comparirà tra i pagamenti da incassare.`}>Metti in pausa</ConfirmButton>
            </form>
          ) : null}
          {client.status !== "archived" ? (
            <form action={setClientStatus.bind(null, id, "archived")}>
              <ConfirmButton variant="secondary" message={`Terminare il percorso con ${client.first_name}? Entrando nell'app vedrà solo la chat con te. I suoi dati restano salvati e puoi riprendere il percorso quando vuoi.`}>Termina il percorso</ConfirmButton>
            </form>
          ) : null}
        </div>
        {me.role === "owner" ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-sand-deep pt-3">
            <p className="min-w-0 flex-1 text-sm text-muted">
              {client.free ? <><strong className="text-ink">Cliente gratis</strong>: non compare in pagamenti, scadenze, incassi, previsioni ed export.</> : "Cliente di prova o te stesso? Mettilo gratis: esce da pagamenti, scadenze, incassi e previsioni."}
            </p>
            <form action={setClientFree.bind(null, id, !client.free, "profilo")}>
              {client.free ? (
                <ConfirmButton variant="secondary" message="Togliere il cliente dai gratis? Tornerà nei pagamenti e nelle previsioni.">Non è più gratis</ConfirmButton>
              ) : (
                <ConfirmButton variant="secondary" message="Mettere questo cliente gratis? Non comparirà più in pagamenti, scadenze, incassi e previsioni.">Metti gratis</ConfirmButton>
              )}
            </form>
          </div>
        ) : null}
      </Card>
      <Card className="[grid-column:1/-1] lg:[grid-column:auto/span_2]">
        <Eyebrow className="mb-4">Dati del cliente</Eyebrow>
        {me.role === "coach" ? (
          <p className="mb-4 rounded-2xl bg-sand px-4 py-3 text-[15px]">{client.coach_id === me.id ? "Lo segui tu: vedi programmi, check, diario e chat. I pagamenti li gestisce il titolare." : "Lo segue il titolare."}</p>
        ) : null}
        <ClientForm
          action={updateClientAction.bind(null, id)}
          coaches={coaches ?? []}
          isOwner={me.role === "owner"}
          values={{ ...client, private_notes: notes?.notes ?? "" }}
        />
      </Card>
      <div className="flex flex-col gap-4">
        <Card>
          <Eyebrow className="mb-3">Accesso all&apos;app</Eyebrow>
          {invito === "errore" ? <div className="mb-3"><ClearParams names={["invito"]} /><Notice tone="error">Il cliente è stato creato, ma l&apos;invito non è partito. Riprova da qui.</Notice></div> : null}
          {client.user_id && hasEntered ? (
            <p className="text-[15px] leading-relaxed text-muted">Il cliente ha già un account e può entrare con {client.email}. Se perde la password usa “Password dimenticata” nella pagina di accesso.</p>
          ) : client.user_id ? (
            <div className="flex flex-col gap-3">
              <p className="text-[15px] leading-relaxed text-muted">Invito inviato a {client.email}, ma il cliente non è ancora entrato. Il link vale 24 ore: se è scaduto, rimandalo.</p>
              <InviteButton action={inviteClientAction.bind(null, id)} label="Rimanda l'invito" />
              <InviteLink action={inviteLinkAction.bind(null, id)} name={client.first_name} />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-[15px] leading-relaxed text-muted">
                {client.email ? `Mandiamo a ${client.email} un'email con il link per scegliere la password.` : "Aggiungi l'email del cliente per poterlo invitare."}
              </p>
              {client.email ? <InviteButton action={inviteClientAction.bind(null, id)} label="Invia invito" /> : null}
              {client.email ? <InviteLink action={inviteLinkAction.bind(null, id)} name={client.first_name} /> : null}
            </div>
          )}
        </Card>
        {consent ? <PrivacyStaffCard clientId={id} isOwner={me.role === "owner"} consent={consent} /> : null}
        {me.role === "owner" ? (
          <Card>
            <Eyebrow className="mb-3">Elimina cliente</Eyebrow>
            <p className="mb-4 text-[15px] leading-relaxed text-muted">Cancella per sempre il cliente con programmi, check, logbook e pagamenti. Per un ex cliente è meglio “Termina il percorso”: i dati restano.</p>
            <form action={deleteClientAction.bind(null, id)}>
              <ConfirmButton message={`Eliminare per sempre ${client.first_name} ${client.last_name} e tutti i suoi dati?`}>Elimina per sempre</ConfirmButton>
            </form>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
