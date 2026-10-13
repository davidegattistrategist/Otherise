import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getClientTimeline, getStaffTimeline, type TimelineKind } from "@/lib/data/timeline";
import { KIND_LABELS, Timeline } from "@/components/timeline";
import { Card, Eyebrow, cx } from "@/components/ui";

export const metadata: Metadata = { title: "Note" };

/**
 * Tutte le note del cliente in una linea del tempo: i tuoi appunti (sessioni
 * PT, check, posturale) e, a parte, quello che scrive lui (logbook e diario).
 */
export default async function NotesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ vista?: string; tipo?: string }> }) {
  const { id } = await params;
  const { vista, tipo } = await searchParams;
  await requireStaff();
  const supabase = await createClient();
  const client = vista === "cliente";
  const base = `/staff/clienti/${id}/note`;
  const staff = client ? null : await getStaffTimeline(supabase, id);
  const all = client ? await getClientTimeline(supabase, id) : staff!.items;
  const kinds = [...new Set(all.map((i) => i.kind))] as TimelineKind[];
  const filter = kinds.includes(tipo as TimelineKind) ? (tipo as TimelineKind) : null;
  const items = filter ? all.filter((i) => i.kind === filter) : all;
  const tab = (active: boolean) => cx("flex min-h-11 flex-1 items-center justify-center rounded-full px-4 text-[15px] font-semibold transition-colors", active ? "bg-ink text-card" : "text-ink-soft hover:text-ink");
  const chip = (active: boolean) => cx("min-h-9 rounded-full px-3.5 py-1.5 text-sm font-semibold", active ? "bg-ink text-card" : "bg-card text-ink-soft hover:text-ink");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <nav aria-label="Quali note" className="flex gap-1 rounded-full bg-sand-deep/60 p-1">
        <Link href={base} className={tab(!client)} aria-current={!client ? "page" : undefined}>I tuoi appunti</Link>
        <Link href={`${base}?vista=cliente`} className={tab(client)} aria-current={client ? "page" : undefined}>Note del cliente</Link>
      </nav>
      <p className="px-1 text-sm text-muted">
        {client
          ? "Quello che scrive nel logbook (nota finale, note sugli esercizi, dolori) e nel diario, con le tue risposte. Le note che l'AI giudica importanti ti arrivano anche in Oggi."
          : "Note delle sessioni PT, dei check e delle valutazioni posturali, dalla più recente. Il cliente non le vede."}
      </p>
      {kinds.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          <Link href={client ? `${base}?vista=cliente` : base} className={chip(!filter)}>Tutto</Link>
          {kinds.map((k) => (
            <Link key={k} href={`${base}?${client ? "vista=cliente&" : ""}tipo=${k}`} className={chip(filter === k)}>{KIND_LABELS[k]}</Link>
          ))}
        </div>
      ) : null}
      {staff?.privateNotes.trim() ? (
        <Card className="flex flex-col gap-1.5">
          <Eyebrow>Note riservate</Eyebrow>
          <p className="text-[15px] leading-relaxed whitespace-pre-line">{staff.privateNotes}</p>
          <Link href={`/staff/clienti/${id}/profilo`} className="self-start text-sm font-semibold underline">Modifica</Link>
        </Card>
      ) : null}
      <Timeline items={items} empty={client ? "Il cliente non ha ancora scritto note nel logbook o nel diario." : "Ancora nessuna nota: le aggiungi con le sessioni PT, i check e il posturale."} />
    </div>
  );
}
