import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { getStaffClient } from "@/lib/data/client";
import { foldContext } from "@/lib/data/checks";
import { createClient } from "@/lib/supabase/server";
import type { Sex } from "@/lib/body/skinfolds";
import { Card, Eyebrow } from "@/components/ui";
import { ConfirmButton } from "@/components/form-bits";
import { CheckForm, type CheckValues } from "../check-form";
import { SexPrompt } from "../sex-prompt";
import { deleteCheck, saveCheck } from "../actions";
import { staffCheckPhotos } from "@/lib/check-photos";
import { CheckPhotoUploader, PhotoGrid } from "@/components/check-photos";

export const metadata: Metadata = { title: "Check" };

export default async function EditCheckPage({ params }: { params: Promise<{ id: string; checkId: string }> }) {
  const { id, checkId } = await params;
  await requireStaff();
  const client = await getStaffClient(id);
  if (!/^[0-9a-f-]{36}$/i.test(checkId)) notFound();
  const supabase = await createClient();
  const [{ data: c }, folds] = await Promise.all([
    supabase.from("checks").select("*").eq("id", checkId).eq("client_id", id).maybeSingle(),
    client.sex ? foldContext(supabase, { ...client, sex: client.sex }, checkId) : Promise.resolve({ ref: null, lastMissing: [] }),
  ]);
  if (!c) notFound();
  const photos = (await staffCheckPhotos(supabase, id, checkId)).get(checkId) ?? [];
  if (!c.sex && !client.sex) return <SexPrompt clientId={id} />;
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <Eyebrow className="mb-3">Foto del check</Eyebrow>
        <div className="flex flex-col gap-3">
          <PhotoGrid photos={photos} clientId={id} canDelete />
          {!photos.length ? <p className="text-[15px] text-muted">Frontale, laterali e dietro: sceglile tutte insieme dalla galleria. {c.visible_to_client ? "Il cliente le vedrà nei suoi progressi." : "Il cliente le vedrà quando renderai visibile il check."}</p> : null}
          <CheckPhotoUploader clientId={id} checkId={checkId} label={photos.length ? "Aggiungi altre foto" : "Aggiungi le foto"} variant={photos.length ? "secondary" : "primary"} />
        </div>
      </Card>
      <CheckForm
        action={saveCheck.bind(null, id, checkId)}
        sex={(c.sex ?? client.sex) as Sex}
        birthDate={client.birth_date}
        formula={folds.ref?.id ?? null}
        manual={Boolean(client.skinfold_formula)}
        lastMissing={[]}
        values={{
          check_date: c.check_date ?? "",
          weight_kg: c.weight_kg === null ? null : Number(c.weight_kg),
          skinfolds: (c.skinfolds ?? {}) as CheckValues["skinfolds"],
          circumferences: (c.circumferences ?? {}) as Record<string, number>,
          strength_tests: (c.strength_tests ?? []) as CheckValues["strength_tests"],
          tests_text: c.tests_text,
          notes_next_phase: c.notes_next_phase,
          visible_to_client: c.visible_to_client,
        }}
      />
      <Card>
        <form action={deleteCheck.bind(null, id, checkId)}>
          <ConfirmButton message="Eliminare questo check?">Elimina check</ConfirmButton>
        </form>
      </Card>
    </div>
  );
}
