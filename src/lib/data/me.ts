import "server-only";
import { cache } from "react";
import { createClient } from "../supabase/server";
import { todayISO } from "../dates";
import { parseContent, type ProgramContent } from "../program/types";
import { displayWeek, weekPosition, type WeekPosition } from "../program/schedule";

export type MyProgram = {
  id: string;
  title: string;
  description: string;
  weeks: number;
  start_date: string;
  status: string;
  content: ProgramContent;
  week: number;
  position: WeekPosition;
};

/** Il programma da mostrare al cliente: quello iniziato più di recente, altrimenti il prossimo in partenza. */
export const getMyPrograms = cache(async (clientId: string) => {
  const supabase = await createClient();
  const today = todayISO();
  const { data } = await supabase
    .from("programs")
    .select("id, title, description, weeks, start_date, status, content")
    .eq("client_id", clientId)
    .in("status", ["published", "archived"])
    .order("start_date", { ascending: false });
  const all = (data ?? []).filter((p) => p.start_date);
  const published = all.filter((p) => p.status === "published");
  const started = published.filter((p) => p.start_date! <= today);
  const raw = started[0] ?? published[published.length - 1] ?? null;
  const toProgram = (p: NonNullable<typeof raw>): MyProgram => ({
    ...p,
    start_date: p.start_date!,
    content: parseContent(p.content),
    week: displayWeek(p.start_date, p.weeks, today),
    position: weekPosition(p.start_date!, p.weeks, today),
  });
  const current = raw ? toProgram(raw) : null;
  // un programma pubblicato che parte dopo quello in corso
  const upcoming = published.filter((p) => p.start_date! > today && p.id !== raw?.id).map(toProgram).pop() ?? null;
  const past = all.filter((p) => p.id !== raw?.id && p.id !== upcoming?.id).map(toProgram);
  return { current, upcoming, past };
});

export async function getMyLogs(programId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("workout_logs").select("id, week, day_id, completed, performed_on").eq("program_id", programId);
  return data ?? [];
}

/** Video degli esercizi, per id e per nome (minuscolo). */
export const getVideoMap = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("exercises").select("id, name, video_url").not("video_url", "is", null);
  const map: Record<string, string> = {};
  for (const e of data ?? []) {
    if (!e.video_url) continue;
    map[e.id] = e.video_url;
    map[e.name.trim().toLowerCase()] = e.video_url;
  }
  return map;
});
