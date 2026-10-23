import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatLong, todayISO } from "@/lib/dates";
import { Card, EmptyState, Eyebrow, LinkButton, Notice } from "@/components/ui";
import { ConfirmButton } from "@/components/form-bits";
import { PostureForm } from "./posture-form";
import { deletePosture, savePosture } from "./actions";
import { ClearParams } from "@/components/clear-param";

export const metadata: Metadata = { title: "Posturale" };

const ROWS = [
  ["tight_muscles", "Muscoli rigidi / da allungare"],
  ["what_works", "Cosa funziona bene"],
  ["posture_work", "Lavori posturali"],
  ["notes", "Note"],
] as const;

export default async function PosturePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nuova?: string; modifica?: string; salvato?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  await requireStaff();
  const supabase = await createClient();
  const { data } = await supabase
    .from("posture_assessments")
    .select("id, assessed_on, tight_muscles, what_works, posture_work, notes, visible_to_client")
    .eq("client_id", id)
    .order("assessed_on", { ascending: false });
  const list = data ?? [];
  const editing = list.find((p) => p.id === sp.modifica);
  const showForm = sp.nuova !== undefined || editing || list.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {sp.salvato ? <><ClearParams names={["salvato"]} /><Notice tone="success">Valutazione salvata.</Notice></> : null}
      {showForm ? (
        <Card className="flex flex-col gap-4">
          <Eyebrow>{editing ? "Modifica valutazione" : "Nuova valutazione posturale"}</Eyebrow>
          <p className="-mt-2 text-sm text-muted">Testo libero. Se la rendi visibile, il cliente la trova nei suoi progressi; l&apos;assistente AI la usa sempre per proporre il lavoro posturale nel programma.</p>
          <PostureForm action={savePosture.bind(null, id, editing?.id ?? null)} values={editing} postureId={editing?.id} today={todayISO()} />
          {editing ? <div><LinkButton href={`/staff/clienti/${id}/posturale`} variant="secondary">Fatto</LinkButton></div> : null}
        </Card>
      ) : (
        <div className="flex justify-end"><LinkButton href={`/staff/clienti/${id}/posturale?nuova`}>Nuova valutazione</LinkButton></div>
      )}
      {list.length === 0 && !showForm ? <EmptyState title="Nessuna valutazione posturale" /> : null}
      {list.filter((p) => p.id !== editing?.id).map((p, i) => (
        <Card key={p.id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-lg font-semibold">{formatLong(p.assessed_on)}{i === 0 && !editing ? <span className="ml-2 text-sm font-normal text-muted">la più recente</span> : null}</span>
            <span className="text-sm text-muted">{p.visible_to_client ? "Visibile al cliente" : "Solo staff"}</span>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            {ROWS.filter(([k]) => p[k]).map(([k, label]) => (
              <div key={k}>
                <dt className="text-sm font-semibold">{label}</dt>
                <dd className="mt-0.5 whitespace-pre-line text-[15px] leading-relaxed text-ink-soft">{p[k]}</dd>
              </div>
            ))}
          </dl>
          <div className="flex gap-4">
            <a href={`/staff/clienti/${id}/posturale?modifica=${p.id}`} className="text-sm font-semibold underline">Modifica</a>
            <form action={deletePosture.bind(null, id, p.id)}>
              <ConfirmButton variant="ghost" message="Eliminare questa valutazione?">Elimina</ConfirmButton>
            </form>
          </div>
        </Card>
      ))}
    </div>
  );
}
