import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { getStaffClient } from "@/lib/data/client";
import { foldContext, previousCheck } from "@/lib/data/checks";
import { createClient } from "@/lib/supabase/server";
import type { Sex } from "@/lib/body/skinfolds";
import { Card, Eyebrow, buttonClass } from "@/components/ui";
import { startCheckMode } from "@/app/check/actions";
import { ConfirmButton } from "@/components/form-bits";
import { CheckForm, type CheckValues } from "../check-form";
import { SexPrompt } from "../sex-prompt";
import { deleteCheck, saveCheck } from "../actions";
import { staffCheckPhotos } from "@/lib/check-photos";
import { CheckPhotoUploader, PhotoCompare, PhotoGrid } from "@/components/check-photos";
import { checkLabel, sortChecks } from "@/lib/check-order";

export const metadata: Metadata = { title: "Check" };

export default async function EditCheckPage({ params }: { params: Promise<{ id: string; checkId: string }> }) {
  const { id, checkId } = await params;
  await requireStaff();
  const client = await getStaffClient(id);
  if (!/^[0-9a-f-]{36}$/i.test(checkId)) notFound();
  const supabase = await createClient();
  const [{ data: c }, folds, previous] = await Promise.all([
    supabase.from("checks").select("*").eq("id", checkId).eq("client_id", id).maybeSingle(),
    client.sex ? foldContext(supabase, { ...client, sex: client.sex }, checkId) : Promise.resolve({ ref: null, lastMissing: [] }),
    previousCheck(supabase, id, checkId),
  ]);
  if (!c) notFound();
  const [allPhotos, { data: order }] = await Promise.all([
    staffCheckPhotos(supabase, id),
    supabase.from("checks").select("id, check_date, sequence, created_at, order_hint").eq("client_id", id),
  ]);
  const photos = allPhotos.get(checkId) ?? [];
  // per il confronto: i check con le foto, dal più vecchio; di partenza il precedente con questo
  const albums = sortChecks(order ?? []).filter((k) => allPhotos.get(k.id)?.length).map((k) => ({ id: k.id, title: checkLabel(k, 0), photos: allPhotos.get(k.id)! }));
  const here = albums.findIndex((a) => a.id === checkId);
  const pair: [string, string] | undefined = here > 0 ? [albums[here - 1].id, checkId] : here === 0 && albums.length > 1 ? [checkId, albums[1].id] : undefined;
  if (!c.sex && !client.sex) return <SexPrompt clientId={id} />;
  return (
    <div className="flex flex-col gap-5">
      <form action={startCheckMode.bind(null, id, checkId)} className="flex justify-end">
        <button type="submit" className={buttonClass("secondary", "sm")}>Apri in modalità check</button>
      </form>
      <Card>
        <Eyebrow className="mb-3">Foto del check</Eyebrow>
        <div className="flex flex-col gap-3">
          <PhotoGrid photos={photos} clientId={id} canDelete />
          {!photos.length ? <p className="text-[15px] text-muted">Frontale, laterali e dietro: sceglile tutte insieme dalla galleria. {c.visible_to_client ? "Il cliente le vedrà nei suoi progressi." : "Il cliente le vedrà quando renderai visibile il check."}</p> : null}
          <div className="flex flex-wrap items-start gap-2">
            <CheckPhotoUploader clientId={id} checkId={checkId} label={photos.length ? "Aggiungi altre foto" : "Aggiungi le foto"} variant={photos.length ? "secondary" : "primary"} />
            {pair ? <PhotoCompare albums={albums} initial={pair} label="Confronta con un altro check" /> : null}
          </div>
        </div>
      </Card>
      <CheckForm
        clientId={id}
        checkId={checkId}
        previous={previous}
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
