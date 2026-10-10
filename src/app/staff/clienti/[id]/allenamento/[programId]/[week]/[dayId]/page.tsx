import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadSession } from "@/lib/data/session";
import { formatShort } from "@/lib/dates";
import { Logbook } from "@/components/logbook/logbook";
import { Card, cx } from "@/components/ui";

export const metadata: Metadata = { title: "Registra allenamento" };

/** Lo staff registra l'allenamento al posto del cliente (es. durante la sessione in palestra). */
export default async function StaffLogPage({ params }: { params: Promise<{ id: string; programId: string; week: string; dayId: string }> }) {
  const { id, programId, week, dayId } = await params;
  await requireStaff();
  const supabase = await createClient();
  const s = await loadSession(supabase, programId, week, dayId, "staff");
  if (!s || s.program.client_id !== id) notFound();
  const { data: program } = await supabase.from("programs").select("content").eq("id", programId).single();
  const days = ((program?.content as { days?: Array<{ id: string; title: string }> }) ?? {}).days ?? [];
  const base = `/staff/clienti/${id}/allenamento/${programId}`;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <div className="text-sm text-muted">{s.program.title} · registri tu al posto del cliente{s.initial.updatedAt ? ` · ultima modifica ${formatShort(s.initial.performedOn)}` : ""}</div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: s.program.weeks }, (_, i) => i + 1).map((w) => (
            <Link key={w} href={`${base}/${w}/${dayId}`} className={cx("rounded-full px-3 py-1.5 text-sm font-semibold", w === s.week ? "bg-ink text-card" : "bg-sand")}>S{w}</Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {days.map((d) => (
            <Link key={d.id} href={`${base}/${s.week}/${d.id}`} className={cx("rounded-full px-3 py-1.5 text-sm font-semibold", d.id === dayId ? "bg-accent text-white" : "bg-sand")}>{d.title}</Link>
          ))}
        </div>
      </Card>
      <h2 className="text-2xl font-semibold">{s.day.title} · settimana {s.week}</h2>
      <Logbook
        key={`${s.week}-${dayId}`}
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
        backHref={`/staff/clienti/${id}`}
        finishLabel="Salva come fatto"
        barClass="bottom-[calc(var(--nav-space)+0.5rem)] lg:bottom-4"
      />
    </div>
  );
}
