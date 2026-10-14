import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { getStaffClient } from "@/lib/data/client";
import { foldContext, previousCheck } from "@/lib/data/checks";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import type { Sex } from "@/lib/body/skinfolds";
import { CheckForm } from "../check-form";
import { saveCheck } from "../actions";
import { SexPrompt } from "../sex-prompt";

export const metadata: Metadata = { title: "Nuovo check" };

export default async function NewCheckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireStaff();
  const client = await getStaffClient(id);
  if (!client.sex) return <SexPrompt clientId={id} />;
  const supabase = await createClient();
  const [folds, previous] = await Promise.all([foldContext(supabase, { ...client, sex: client.sex }), previousCheck(supabase, id)]);
  return (
    <CheckForm
      clientId={id} newCheck
      action={saveCheck.bind(null, id, null)}
      sex={client.sex as Sex}
      birthDate={client.birth_date}
      formula={folds.ref?.id ?? null}
      manual={Boolean(client.skinfold_formula)}
      lastMissing={folds.lastMissing}
      previous={previous}
      values={{ check_date: todayISO(), weight_kg: null, skinfolds: {}, circumferences: {}, strength_tests: [], tests_text: "", notes_next_phase: "", visible_to_client: true }}
    />
  );
}
