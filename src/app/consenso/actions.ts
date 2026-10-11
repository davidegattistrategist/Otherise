"use server";

import { redirect } from "next/navigation";
import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PRIVACY_VERSION } from "@/lib/privacy";
import type { ActionState } from "@/components/form-bits";

export async function acceptPrivacy(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireClient();
  if (fd.get("consent") !== "on") return { error: "Senza questo consenso non possiamo usare l'app per il tuo percorso. Se hai dubbi, parlane con il tuo coach." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_privacy", { version: PRIVACY_VERSION, instagram: fd.get("instagram") === "on" });
  if (error) return { error: "Non sono riuscito a salvare. Riprova tra poco." };
  redirect("/cliente");
}
