import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayISO } from "@/lib/dates";
import { currentProgram, programEndDate } from "@/lib/program/schedule";
import { parseContent } from "@/lib/program/types";
import { getTrainingHistory } from "@/lib/data/training";
import { trainingSummary } from "@/lib/training-history";
import { TrainingHistoryList } from "@/components/training-history";
import { TrainingSummaryView } from "@/components/training-summary";
import { Card, Eyebrow, cx } from "@/components/ui";

export const metadata: Metadata = { title: "Allenamenti" };

const PERIODS = [
  { weeks: 12, label: "3 mesi" },
  { weeks: 26, label: "6 mesi" },
  { weeks: 52, label: "1 anno" },
] as const;

/**
 * Lo storico vero degli allenamenti del cliente: quelli del programma (con
 * cosa ha fatto, esercizio per esercizio) e quelli liberi, con la costanza e
 * quanti allenamenti fa a settimana.
 */
export default async function TrainingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ periodo?: string }> }) {
  const { id } = await params;
  const { periodo } = await searchParams;
  await requireStaff();
  const supabase = await createClient();
  const today = todayISO();
  const period = PERIODS.find((p) => String(p.weeks) === periodo) ?? PERIODS[0];
  const since = addDays(today, -7 * period.weeks);
  const [sessions, { data: programs }] = await Promise.all([
    getTrainingHistory(supabase, id, since),
    supabase.from("programs").select("id, weeks, start_date, status, content").eq("client_id", id).eq("status", "published").not("start_date", "is", null),
  ]);
  const cur = currentProgram(programs ?? [], today, { upcoming: false });
  const days = cur ? parseContent(cur.content).days.length : 0;
  const summary = trainingSummary(sessions, today, cur?.start_date && days ? { start: cur.start_date, end: programEndDate(cur.start_date, cur.weeks), daysPerWeek: days } : null);
  const base = `/staff/clienti/${id}/allenamenti`;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <Eyebrow>Costanza</Eyebrow>
        <TrainingSummaryView summary={summary} />
      </Card>
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Eyebrow>Storico degli allenamenti</Eyebrow>
          <nav aria-label="Periodo" className="flex gap-1">
            {PERIODS.map((p) => (
              <Link key={p.weeks} href={p.weeks === 12 ? base : `${base}?periodo=${p.weeks}`} aria-current={p === period ? "page" : undefined} className={cx("min-h-9 rounded-full px-3 py-1.5 text-sm font-semibold", p === period ? "bg-ink text-card" : "bg-sand-deep/60 text-ink-soft")}>
                {p.label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="text-sm text-muted">Del programma e liberi, dal più recente. Tocca un allenamento per vedere cosa ha fatto, esercizio per esercizio.</p>
        <TrainingHistoryList sessions={sessions} clientId={id} emptyText={`Nessun allenamento negli ultimi ${period.label}.`} />
      </Card>
    </div>
  );
}
