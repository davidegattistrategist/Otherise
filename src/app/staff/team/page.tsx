import type { Metadata } from "next";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, Eyebrow, Input, PageTitle, Pill } from "@/components/ui";
import { ConfirmButton, SubmitButton } from "@/components/form-bits";
import { InviteForm } from "./invite-form";
import { cancelInvite, inviteCollaborator, removeCollaborator, renameStaff, resendInvite } from "./actions";

export const metadata: Metadata = { title: "Collaboratori" };

export default async function TeamPage() {
  const me = await requireOwner();
  const supabase = await createClient();
  const [{ data: staff }, { data: clients }] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, role").in("role", ["owner", "coach"]).order("role", { ascending: false }).order("full_name"),
    supabase.from("clients").select("coach_id").neq("status", "archived"),
  ]);
  const admin = createAdminClient();
  const signedIn = new Map<string, boolean>();
  await Promise.all((staff ?? []).map(async (s) => {
    const { data } = await admin.auth.admin.getUserById(s.id);
    signedIn.set(s.id, Boolean(data.user?.last_sign_in_at));
  }));
  const count = (id: string) => (clients ?? []).filter((c) => c.coach_id === id).length;
  const unassigned = (clients ?? []).filter((c) => !c.coach_id).length;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageTitle eyebrow="Solo titolare" title="Collaboratori">
        <p className="max-w-2xl text-[15px] text-muted">Un collaboratore vede e gestisce solo i clienti che gli assegni (dalla scheda del cliente). Non vede i pagamenti né le impostazioni. Tu vedi tutto.</p>
      </PageTitle>

      <Card className="flex flex-col gap-4">
        <Eyebrow>Invita un collaboratore</Eyebrow>
        <InviteForm action={inviteCollaborator} />
      </Card>

      <div className="flex flex-col gap-3">
        {(staff ?? []).map((s) => {
          const isMe = s.id === me.id;
          const active = signedIn.get(s.id);
          return (
            <Card key={s.id} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">{s.full_name}{isMe ? <span className="ml-2 text-sm font-normal text-muted">(tu)</span> : null}</div>
                  <div className="text-sm text-muted">{s.email}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Pill active={s.role === "owner"}>{s.role === "owner" ? "Titolare" : "Collaboratore"}</Pill>
                  {!active ? <Pill className="!bg-accent-soft">Invito in attesa</Pill> : null}
                </div>
              </div>
              <div className="text-sm text-muted">{s.role === "owner" ? `Clienti senza collaboratore: ${unassigned}` : `Clienti assegnati: ${count(s.id)}`}</div>
              <div className="flex flex-wrap items-end gap-3 border-t border-sand-deep pt-3">
                <form action={renameStaff.bind(null, s.id)} className="flex flex-wrap items-end gap-2">
                  <label className="sr-only" htmlFor={`name-${s.id}`}>Nome</label>
                  <Input id={`name-${s.id}`} name="full_name" defaultValue={s.full_name} className="w-56" />
                  <SubmitButton variant="secondary" size="sm">Rinomina</SubmitButton>
                </form>
                {s.role === "coach" && !active ? (
                  <>
                    <form action={resendInvite.bind(null, s.id)}><SubmitButton variant="secondary" size="sm" pendingText="Invio…">Rimanda l&apos;invito</SubmitButton></form>
                    <form action={cancelInvite.bind(null, s.id)}><ConfirmButton variant="ghost" message="Annullare l'invito?">Annulla invito</ConfirmButton></form>
                  </>
                ) : null}
                {s.role === "coach" && active ? (
                  <form action={removeCollaborator.bind(null, s.id)}>
                    <ConfirmButton message={`Togliere l'accesso a ${s.full_name}? I suoi clienti tornano a te.`}>Togli l&apos;accesso</ConfirmButton>
                  </form>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
