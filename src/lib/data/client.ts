import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "../supabase/server";

/** Scheda del cliente per lo staff (404 se non esiste o non è visibile a chi chiede). */
export const getStaffClient = cache(async (id: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase
    .from("clients")
    .select("id, first_name, last_name, email, phone, sex, birth_date, goals, status, start_date, weekly_checkin, phase_weeks, coach_id, user_id, ai_opt_out, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  return data;
});

export type StaffClient = Awaited<ReturnType<typeof getStaffClient>>;
