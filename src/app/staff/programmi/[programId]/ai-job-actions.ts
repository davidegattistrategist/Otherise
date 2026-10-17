"use server";

import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { closeJob } from "@/lib/ai/program-jobs";

/** Bozza AI aperta nell'editor ("applied") o scartata: esce dall'elenco delle bozze in coda. */
export async function closeAiJob(id: string, status: "applied" | "discarded") {
  await requireStaff();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const supabase = await createClient();
  await closeJob(supabase, id, status);
}
