"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ageOn, isISODate } from "@/lib/dates";
import { CIRCUMFERENCES, SKINFOLD_SITES, computeBodyComposition, type Sex, type SkinfoldReadings } from "@/lib/body/skinfolds";
import { estimateOneRepMax } from "@/lib/strength/e1rm";
import type { ActionState } from "@/components/form-bits";
import type { Json } from "@/lib/supabase/database.types";

const num = (v: FormDataEntryValue | null): number | null => {
  if (v === null) return null;
  const s = String(v).trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export async function saveCheck(clientId: string, checkId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff();
  const supabase = await createClient();
  const { data: client } = await supabase.from("clients").select("sex, birth_date").eq("id", clientId).maybeSingle();
  if (!client) return { error: "Cliente non trovato." };

  const date = String(fd.get("check_date") ?? "");
  if (!isISODate(date)) return { error: "Data del check non valida." };
  const weight = num(fd.get("weight_kg"));
  if (weight !== null && (weight < 25 || weight > 300)) return { error: "Il peso sembra sbagliato." };

  const skinfolds: SkinfoldReadings = {};
  for (const s of SKINFOLD_SITES) {
    const vals = [0, 1, 2].map((i) => num(fd.get(`sf_${s.key}_${i}`)));
    if (vals.some((v) => v !== null && (v <= 0 || v > 80))) return { error: `Valore della plica ${s.label.toLowerCase()} fuori scala (mm).` };
    if (vals.some((v) => v !== null)) skinfolds[s.key] = vals;
  }
  const circumferences: Record<string, number> = {};
  for (const c of CIRCUMFERENCES) {
    const v = num(fd.get(`circ_${c.key}`));
    if (v !== null) circumferences[c.key] = v;
  }
  const tests: Array<{ exercise: string; load: number | null; reps: number | null; rpe: number | null; e1rm: number | null }> = [];
  for (let i = 0; i < 6; i++) {
    const exercise = String(fd.get(`test_${i}_exercise`) ?? "").trim();
    if (!exercise) continue;
    const load = num(fd.get(`test_${i}_load`));
    const reps = num(fd.get(`test_${i}_reps`));
    const rpe = num(fd.get(`test_${i}_rpe`));
    tests.push({ exercise, load, reps, rpe, e1rm: load && reps && rpe ? estimateOneRepMax(load, reps, rpe) : null });
  }

  const age = ageOn(client.birth_date, date);
  const comp = computeBodyComposition({ sex: client.sex as Sex, age, weightKg: weight, skinfolds });
  const row = {
    client_id: clientId,
    check_date: date,
    weight_kg: weight,
    age_years: age,
    sex: client.sex,
    skinfolds: skinfolds as unknown as NonNullable<Json>,
    skinfold_sum_mm: comp.ok ? comp.sumMm : null,
    body_fat_pct: comp.ok ? comp.bodyFatPct : null,
    fat_mass_kg: comp.ok ? comp.fatMassKg : null,
    lean_mass_kg: comp.ok ? comp.leanMassKg : null,
    circumferences: circumferences as unknown as NonNullable<Json>,
    strength_tests: tests as unknown as NonNullable<Json>,
    tests_text: String(fd.get("tests_text") ?? "").trim(),
    notes_next_phase: String(fd.get("notes_next_phase") ?? "").trim(),
    visible_to_client: fd.get("visible_to_client") === "on",
    created_by: me.id,
  };
  const { error } = checkId
    ? await supabase.from("checks").update(row).eq("id", checkId).eq("client_id", clientId)
    : await supabase.from("checks").insert(row);
  if (error) return { error: "Salvataggio non riuscito." };
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
  redirect(`/staff/clienti/${clientId}/check?salvato=1`);
}

export async function deleteCheck(clientId: string, checkId: string) {
  await requireStaff();
  const supabase = await createClient();
  await supabase.from("checks").delete().eq("id", checkId).eq("client_id", clientId);
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
  redirect(`/staff/clienti/${clientId}/check`);
}
