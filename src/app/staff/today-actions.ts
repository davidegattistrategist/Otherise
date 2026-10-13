"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Il trainer ha visto la segnalazione di dolore o fastidio. */
export async function markDiscomfortSeen(logId: string) {
  await requireStaff();
  const supabase = await createClient();
  await supabase.from("workout_logs").update({ discomfort_seen_at: new Date().toISOString() }).eq("id", logId);
  revalidatePath("/staff");
}

/** Il trainer ha letto la nota finale del cliente (esce da Oggi, resta nella linea del tempo). */
export async function markNoteSeen(logId: string) {
  await requireStaff();
  const supabase = await createClient();
  await supabase.from("workout_logs").update({ note_seen_at: new Date().toISOString() }).eq("id", logId);
  revalidatePath("/staff");
}
