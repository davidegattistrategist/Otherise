import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getVideoMap } from "@/lib/data/me";
import { addDays, formatShort, todayISO } from "@/lib/dates";
import { parseContent } from "@/lib/program/types";
import { summarizeSets, type SetLog } from "@/lib/program/prescription";
import { IconArrowLeft } from "@/components/icons";
import { Logbook } from "./logbook";

export const metadata: Metadata = { title: "Allenamento" };

export default async function SessionPage({ params }: { params: Promise<{ programId: string; week: string; dayId: string }> }) {
  const { programId, week: weekStr, dayId } = await params;
  const me = await requireClient();
  if (!/^[0-9a-f-]{36}$/i.test(programId)) notFound();
  const supabase = await createClient();
  const { data: program } = await supabase.from("programs").select("id, client_id, title, weeks, start_date, status, content").eq("id", programId).maybeSingle();
  const week = Number(weekStr);
  if (!program || program.client_id !== me.clientId || program.status === "draft" || !Number.isInteger(week) || week < 1 || week > program.weeks) notFound();
  const content = parseContent(program.content);
  const dayIndex = content.days.findIndex((d) => d.id === dayId);
  if (dayIndex === -1) notFound();
  const day = content.days[dayIndex];
  const today = todayISO();

  const { data: log } = await supabase.from("workout_logs").select("id, performed_on, completed, notes, updated_at").eq("program_id", programId).eq("week", week).eq("day_id", dayId).maybeSingle();
  const [{ data: exLogs }, { data: lastLogs }, videos] = await Promise.all([
    log ? supabase.from("exercise_logs").select("item_id, sets, result_text").eq("workout_log_id", log.id) : Promise.resolve({ data: [] as Array<{ item_id: string; sets: unknown; result_text: string }> }),
    supabase.rpc("last_exercise_logs", { cid: me.clientId, before_date: log?.performed_on ?? addDays(today, 1) }),
    getVideoMap(),
  ]);

  const items: Record<string, { sets: SetLog[]; resultText: string }> = {};
  for (const l of exLogs ?? []) items[l.item_id] = { sets: (l.sets as SetLog[]) ?? [], resultText: l.result_text };
  const last: Record<string, { date: string; summary: string }> = {};
  for (const l of lastLogs ?? []) {
    // nella stessa sessione non mostriamo "ultima volta" come se fosse quella di oggi
    if (log && l.performed_on === log.performed_on) continue;
    const summary = summarizeSets(l.sets as unknown as SetLog[]) ?? l.result_text;
    if (!summary) continue;
    const entry = { date: l.performed_on, summary: `${summary} · ${formatShort(l.performed_on)}` };
    if (l.exercise_id) last[l.exercise_id] = entry;
    last[l.exercise_name.trim().toLowerCase()] = entry;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/cliente/programma?settimana=${week}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted">
          <IconArrowLeft size={18} /> Programma
        </Link>
        <div className="text-[13px] text-muted">{program.title} · settimana {week} di {program.weeks}</div>
        <h1 className="mt-1 text-[30px] leading-tight font-normal tracking-tight">{day.title}</h1>
      </div>
      <Logbook
        programId={programId}
        week={week}
        day={day}
        today={today}
        initial={{ performedOn: log?.performed_on ?? today, completed: log?.completed ?? false, notes: log?.notes ?? "", items, updatedAt: log?.updated_at ?? null }}
        last={last}
        videos={videos}
        backHref="/cliente"
      />
    </div>
  );
}
