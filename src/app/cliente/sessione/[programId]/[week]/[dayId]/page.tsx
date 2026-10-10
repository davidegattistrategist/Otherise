import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadSession } from "@/lib/data/session";
import { IconArrowLeft } from "@/components/icons";
import { Logbook } from "@/components/logbook/logbook";

export const metadata: Metadata = { title: "Allenamento" };

export default async function SessionPage({ params }: { params: Promise<{ programId: string; week: string; dayId: string }> }) {
  const { programId, week, dayId } = await params;
  const me = await requireClient();
  const supabase = await createClient();
  const s = await loadSession(supabase, programId, week, dayId, "client");
  if (!s || s.program.client_id !== me.clientId) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/cliente/programma?settimana=${s.week}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted">
          <IconArrowLeft size={18} /> Programma
        </Link>
        <div className="text-[13px] text-muted">{s.program.title} · settimana {s.week} di {s.program.weeks}</div>
        <h1 className="mt-1 text-[30px] leading-tight font-normal tracking-tight">{s.day.title}</h1>
      </div>
      <Logbook
        programId={s.program.id}
        week={s.week}
        day={s.day}
        today={s.today}
        initial={s.initial}
        last={s.last}
        lastSets={s.lastSets}
        records={s.records}
        maxes={s.maxes}
        videos={s.videos}
        backHref="/cliente"
        barClass="bottom-[var(--nav-gap)] md:bottom-4"
      />
    </div>
  );
}
