import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { getStaffClient } from "@/lib/data/client";
import { todayISO } from "@/lib/dates";
import type { Sex } from "@/lib/body/skinfolds";
import { CheckForm } from "../check-form";
import { saveCheck } from "../actions";

export const metadata: Metadata = { title: "Nuovo check" };

export default async function NewCheckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireStaff();
  const client = await getStaffClient(id);
  return (
    <CheckForm
      action={saveCheck.bind(null, id, null)}
      sex={client.sex as Sex}
      birthDate={client.birth_date}
      values={{ check_date: todayISO(), weight_kg: null, skinfolds: {}, circumferences: {}, strength_tests: [], tests_text: "", notes_next_phase: "", visible_to_client: true }}
    />
  );
}
