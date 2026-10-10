import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { youtubeId } from "@/lib/import/exercises";
import { Card, Notice, PageTitle } from "@/components/ui";
import { ConfirmButton } from "@/components/form-bits";
import { ExerciseForm } from "../exercise-form";
import { deleteExercise, saveExercise } from "../actions";
import { ClearParams } from "@/components/clear-param";

export const metadata: Metadata = { title: "Esercizio" };

export default async function ExercisePage({ params, searchParams }: { params: Promise<{ exerciseId: string }>; searchParams: Promise<{ nuovo?: string }> }) {
  const { exerciseId } = await params;
  const { nuovo } = await searchParams;
  const me = await requireStaff();
  if (!/^[0-9a-f-]{36}$/i.test(exerciseId)) notFound();
  const supabase = await createClient();
  const { data: ex } = await supabase.from("exercises").select("id, name, video_url, description, category, archived").eq("id", exerciseId).maybeSingle();
  if (!ex) notFound();
  const yt = youtubeId(ex.video_url);
  return (
    <div className="flex flex-col gap-6">
      <PageTitle eyebrow={<Link href="/staff/eserciziario" className="hover:underline">Eserciziario</Link>} title={ex.name} />
      {nuovo ? <><ClearParams names={["nuovo"]} /><Notice tone="success">Esercizio creato.</Notice></> : null}
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
        <Card><ExerciseForm action={saveExercise.bind(null, ex.id)} values={ex} /></Card>
        <div className="flex flex-col gap-4">
          {yt ? (
            <div className="overflow-hidden rounded-[24px] bg-ink">
              <iframe
                className="aspect-video w-full"
                src={`https://www.youtube-nocookie.com/embed/${yt}`}
                title={`Video: ${ex.name}`}
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : ex.video_url ? (
            <Card><a href={ex.video_url} target="_blank" rel="noreferrer" className="font-semibold underline">Apri il video</a></Card>
          ) : null}
          {me.role === "owner" ? (
            <Card>
              <p className="mb-3 text-[15px] text-muted">Eliminare l&apos;esercizio non cambia i programmi già scritti: il nome resta, ma senza video e descrizione. Per toglierlo solo dalla scelta usa “Nascondi”.</p>
              <form action={deleteExercise.bind(null, ex.id)}>
                <ConfirmButton message={`Eliminare “${ex.name}” dall'eserciziario?`}>Elimina esercizio</ConfirmButton>
              </form>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
