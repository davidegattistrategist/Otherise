import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { getStaffClient } from "@/lib/data/client";
import { createClient } from "@/lib/supabase/server";
import { Card, Eyebrow, Notice } from "@/components/ui";
import { ConfirmButton } from "@/components/form-bits";
import { ClientForm } from "../../client-form";
import { deleteClientAction, inviteClientAction, updateClientAction } from "../../actions";
import { InviteButton } from "./invite-button";

export const metadata: Metadata = { title: "Scheda cliente" };

export default async function ClientProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ invito?: string }> }) {
  const { id } = await params;
  const { invito } = await searchParams;
  const me = await requireStaff();
  const client = await getStaffClient(id);
  const supabase = await createClient();
  const [{ data: coaches }, { data: notes }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("role", "coach").order("full_name"),
    supabase.from("client_private_notes").select("notes").eq("client_id", id).maybeSingle(),
  ]);
  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
      <Card className="[grid-column:1/-1] lg:[grid-column:auto/span_2]">
        <Eyebrow className="mb-4">Dati del cliente</Eyebrow>
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
          {invito === "errore" ? <div className="mb-3"><Notice tone="error">Il cliente è stato creato, ma l&apos;invito non è partito. Riprova da qui.</Notice></div> : null}
          {client.user_id ? (
            <p className="text-[15px] leading-relaxed text-muted">Il cliente ha già un account e può entrare con {client.email}. Se perde la password usa “Password dimenticata” nella pagina di accesso.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-[15px] leading-relaxed text-muted">
                {client.email ? `Mandiamo a ${client.email} un'email con il link per scegliere la password.` : "Aggiungi l'email del cliente per poterlo invitare."}
              </p>
              {client.email ? <InviteButton action={inviteClientAction.bind(null, id)} label="Invia invito" /> : null}
            </div>
          )}
        </Card>
        {me.role === "owner" ? (
          <Card>
            <Eyebrow className="mb-3">Elimina cliente</Eyebrow>
            <p className="mb-4 text-[15px] leading-relaxed text-muted">Cancella per sempre il cliente con programmi, check, logbook e pagamenti. Per un ex cliente è meglio impostare lo stato “Archiviato”.</p>
            <form action={deleteClientAction.bind(null, id)}>
              <ConfirmButton message={`Eliminare per sempre ${client.first_name} ${client.last_name} e tutti i suoi dati?`}>Elimina per sempre</ConfirmButton>
            </form>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
