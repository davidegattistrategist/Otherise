"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isISODate } from "@/lib/dates";
import type { ActionState } from "@/components/form-bits";

export async function savePosture(clientId: string, postureId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const supabase = await createClient();
  const date = String(fd.get("assessed_on") ?? "");
  if (!isISODate(date)) return { error: "Data non valida." };
  const t = (k: string) => String(fd.get(k) ?? "").trim();
  const row = {
    assessed_on: date,
    tight_muscles: t("tight_muscles"),
    what_works: t("what_works"),
    posture_work: t("posture_work"),
    notes: t("notes"),
    visible_to_client: fd.get("visible_to_client") === "on",
  };
  if (!row.tight_muscles && !row.what_works && !row.posture_work && !row.notes) return { error: "Scrivi almeno una delle sezioni." };
  const { error } = postureId
    ? await supabase.from("posture_assessments").update(row).eq("id", postureId).eq("client_id", clientId)
    : await supabase.from("posture_assessments").insert({ ...row, client_id: clientId, created_by: me.id });
  if (error) return { error: "Salvataggio non riuscito." };
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
  redirect(`/staff/clienti/${clientId}/posturale?salvato=1`);
}

export async function deletePosture(clientId: string, postureId: string) {
  await requireStaff();
  const supabase = await createClient();
  await supabase.from("posture_assessments").delete().eq("id", postureId).eq("client_id", clientId);
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
  redirect(`/staff/clienti/${clientId}/posturale`);
}
