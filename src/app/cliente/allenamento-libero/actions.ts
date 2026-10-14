"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, isISODate, todayISO } from "@/lib/dates";
import { isFreeKind } from "@/lib/free-workout";

export type FreeState = { error?: string } | null;

/** "Segna l'allenamento": cosa, quanto, com'era, quando (+ nota facoltativa). */
export async function saveFreeWorkout(_: FreeState, fd: FormData): Promise<FreeState> {
  const me = await requireActiveClient();
  const kind = String(fd.get("kind") ?? "");
  if (!isFreeKind(kind)) return { error: "Scegli cosa hai fatto." };
  const minutesRaw = String(fd.get("minutes") ?? "").trim();
  const minutes = minutesRaw ? Math.round(Number(minutesRaw.replace(",", "."))) : null;
  if (minutes !== null && (!Number.isFinite(minutes) || minutes < 1 || minutes > 600)) return { error: "I minuti sembrano sbagliati: scrivi un numero tra 1 e 600." };
  const effortRaw = Number(fd.get("effort") ?? 0);
  const effort = [1, 2, 3].includes(effortRaw) ? effortRaw : null;
  const today = todayISO();
  const day = String(fd.get("performed_on") ?? today);
  if (!isISODate(day) || day > today || day < addDays(today, -60)) return { error: "Scegli un giorno tra oggi e gli ultimi due mesi." };
  const notes = String(fd.get("notes") ?? "").trim().slice(0, 2000);
  const supabase = await createClient();
  const { error } = await supabase.from("free_workouts").insert({ client_id: me.clientId, kind, minutes, effort, performed_on: day, notes });
  if (error) return { error: "Non sono riuscito a salvarlo. Riprova tra poco." };
  revalidatePath("/cliente");
  redirect("/cliente?libero=1");
}

/** "Rifallo oggi": stesso allenamento di quella volta, segnato oggi. */
export async function repeatFreeWorkout(id: string) {
  const me = await requireActiveClient();
  const supabase = await createClient();
  const { data: w } = await supabase.from("free_workouts").select("kind, minutes, effort").eq("id", id).eq("client_id", me.clientId).maybeSingle();
  if (!w) redirect("/cliente/allenamento-libero");
  await supabase.from("free_workouts").insert({ client_id: me.clientId, kind: w.kind, minutes: w.minutes, effort: w.effort, performed_on: todayISO() });
  revalidatePath("/cliente");
  redirect("/cliente?libero=1");
}

export async function deleteFreeWorkout(id: string) {
  const me = await requireActiveClient();
  const supabase = await createClient();
  await supabase.from("free_workouts").delete().eq("id", id).eq("client_id", me.clientId);
  revalidatePath("/cliente/allenamento-libero");
}
