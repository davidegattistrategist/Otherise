import { checkLabel, sortChecks } from "@/lib/check-order";
import type { Metadata } from "next";
import { getExerciseLibrary } from "@/lib/data/cached";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseContent } from "@/lib/program/types";
import { summarizeSets, type SetLog } from "@/lib/program/prescription";
import { formatShort } from "@/lib/dates";
import { aiEnabled } from "@/lib/ai/claude";
import { openJobForProgram } from "@/lib/ai/program-jobs";
import { ProgramEditor, type EditorProgram } from "./program-editor";

export const metadata: Metadata = { title: "Programma" };

export default async function ProgramEditorPage({ params }: { params: Promise<{ programId: string }> }) {
  const { programId } = await params;
  await requireStaff();
  if (!/^[0-9a-f-]{36}$/i.test(programId)) notFound();
  const supabase = await createClient();
  const { data: program } = await supabase
    .from("programs")
    .select("id, title, description, weeks, start_date, session_minutes, status, is_template, is_ai_example, updated_at, client_id, source, ai_notes, content, clients(first_name, last_name)")
    .eq("id", programId)
    .maybeSingle();
  if (!program) notFound();

  const [exercises, lastLogsRes, checkRes, { count: loggedWorkouts }, aiJob] = await Promise.all([
    getExerciseLibrary().then((all) => all.filter((e) => !e.archived).map(({ id, name, video_url }) => ({ id, name, video_url }))),
    program.client_id ? supabase.rpc("last_exercise_logs", { cid: program.client_id }) : Promise.resolve({ data: [] as Array<{ exercise_id: string | null; exercise_name: string; performed_on: string; sets: unknown; result_text: string }> }),
    program.client_id
      ? supabase.from("checks").select("check_date, sequence, created_at, order_hint, notes_next_phase").eq("client_id", program.client_id).neq("notes_next_phase", "").limit(200)
      : Promise.resolve({ data: [] as Array<{ check_date: string | null; sequence: number | null; created_at: string; order_hint: string | null; notes_next_phase: string }> }),
    supabase.from("workout_logs").select("id", { count: "exact", head: true }).eq("program_id", programId),
    program.client_id && aiEnabled() ? openJobForProgram(supabase, programId) : Promise.resolve(null),
  ]);
  const lastNotes = sortChecks(checkRes.data ?? []).pop() ?? null;

  const lastLogs: Record<string, string> = {};
  for (const l of lastLogsRes.data ?? []) {
    const txt = summarizeSets(l.sets as SetLog[]) ?? l.result_text;
    if (!txt) continue;
    const v = `${txt} (${formatShort(l.performed_on)})`;
    if (l.exercise_id) lastLogs[l.exercise_id] = v;
    lastLogs[`n:${l.exercise_name.trim().toLowerCase()}`] = v;
  }
  const client = program.clients as unknown as { first_name: string; last_name: string } | null;
  const clientName = client ? `${client.first_name} ${client.last_name}`.trim() : null;

  return (
    <ProgramEditor
      // un programma = un editor: passando da un cliente all'altro non resta niente del precedente
      key={program.id}
      program={{ ...(program as unknown as EditorProgram), ai_notes: (program.ai_notes as Record<string, string> | null) ?? null }}
      initialContent={parseContent(program.content)}
      exercises={exercises ?? []}
      lastLogs={lastLogs}
      nextPhaseNotes={lastNotes ? { label: checkLabel(lastNotes), text: lastNotes.notes_next_phase } : null}
      clientName={clientName}
      aiEnabled={aiEnabled()}
      backHref={program.client_id ? `/staff/clienti/${program.client_id}/programma` : "/staff/modelli"}
      loggedWorkouts={loggedWorkouts ?? 0}
      aiJob={aiJob}
    />
  );
}
