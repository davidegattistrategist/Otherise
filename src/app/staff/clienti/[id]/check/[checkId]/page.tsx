import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { getStaffClient } from "@/lib/data/client";
import { foldContext } from "@/lib/data/checks";
import { createClient } from "@/lib/supabase/server";
import type { Sex } from "@/lib/body/skinfolds";
import { Card } from "@/components/ui";
import { ConfirmButton } from "@/components/form-bits";
import { CheckForm, type CheckValues } from "../check-form";
import { deleteCheck, saveCheck } from "../actions";

export const metadata: Metadata = { title: "Check" };

export default async function EditCheckPage({ params }: { params: Promise<{ id: string; checkId: string }> }) {
  const { id, checkId } = await params;
  await requireStaff();
  const client = await getStaffClient(id);
  if (!/^[0-9a-f-]{36}$/i.test(checkId)) notFound();
  const supabase = await createClient();
  const [{ data: c }, folds] = await Promise.all([
    supabase.from("checks").select("*").eq("id", checkId).eq("client_id", id).maybeSingle(),
    foldContext(supabase, client, checkId),
  ]);
  if (!c) notFound();
  return (
    <div className="flex flex-col gap-5">
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
