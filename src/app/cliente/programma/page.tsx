import Link from "next/link";
import type { Metadata } from "next";
import { requireClient } from "@/lib/auth";
import { getMyLogs, getMyPrograms, getVideoMap, type MyProgram } from "@/lib/data/me";
import { addDays, formatShort, todayISO } from "@/lib/dates";
import { programEndDate } from "@/lib/program/schedule";
import { Card, EmptyState, Eyebrow, cx } from "@/components/ui";
import { ProgramDayView } from "@/components/program-day";
import { IconCheck } from "@/components/icons";

export const metadata: Metadata = { title: "Programma" };

export default async function ClientProgramPage({ searchParams }: { searchParams: Promise<{ settimana?: string; programma?: string }> }) {
  const sp = await searchParams;
  const me = await requireClient();
  const { current, upcoming, past } = await getMyPrograms(me.clientId);
  const all = [current, upcoming, ...past].filter((p): p is MyProgram => Boolean(p));
  const program = all.find((p) => p.id === sp.programma) ?? current ?? upcoming;
  if (!program) {
    return <EmptyState title="Il programma è in preparazione">Appena è pronto lo trovi qui, con tutte le settimane e i video degli esercizi.</EmptyState>;
  }
  const isCurrent = program.id === current?.id;
  const weekParam = Number(sp.settimana);
  const week = Number.isInteger(weekParam) && weekParam >= 1 && weekParam <= program.weeks ? weekParam : program.week;
  const [logs, videos] = await Promise.all([getMyLogs(program.id), getVideoMap()]);
  const status = (dayId: string) => logs.find((l) => l.week === week && l.day_id === dayId);
  const weekStart = addDays(program.start_date, (week - 1) * 7);
  const base = `/cliente/programma?${program.id !== current?.id ? `programma=${program.id}&` : ""}settimana=`;
  const canLog = program.status === "published" && program.start_date <= todayISO();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-[13px] text-muted">{isCurrent ? "Fase in corso" : program.id === upcoming?.id ? "Prossima fase" : "Fase passata"} · {formatShort(program.start_date)} – {formatShort(programEndDate(program.start_date, program.weeks))}</div>
        <h1 className="mt-1 text-[30px] leading-tight font-normal tracking-tight">{program.title}</h1>
        {program.description ? <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-line text-ink-soft">{program.description}</p> : null}
      </div>

      <nav aria-label="Settimane" className="scroll-x -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {Array.from({ length: program.weeks }, (_, i) => i + 1).map((w) => (
          <Link
            key={w}
            href={`${base}${w}`}
            aria-current={w === week ? "page" : undefined}
            className={cx("flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold", w === week ? "bg-ink text-card" : "bg-card text-ink")}
          >
            Settimana {w}{isCurrent && w === program.week ? " · ora" : ""}
          </Link>
        ))}
      </nav>
      <p className="-mt-1 text-sm text-muted">Dal {formatShort(weekStart)} al {formatShort(addDays(weekStart, 6))}. Fai le sessioni nell&apos;ordine che preferisci.</p>

      {program.content.days.map((day) => {
        const st = status(day.id);
        return (
          <Card key={day.id} className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">{day.title}</h2>
              {st?.completed ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1 text-xs font-semibold text-card"><IconCheck size={14} /> Fatto il {formatShort(st.performed_on)}</span>
              ) : st ? (
                <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold">Iniziato</span>
              ) : null}
            </div>
            <ProgramDayView day={day} week={week} videos={videos} />
            {canLog ? (
              <Link href={`/cliente/sessione/${program.id}/${week}/${day.id}`} className={cx("mt-1 flex min-h-12 items-center justify-center rounded-full text-[15px] font-semibold", st?.completed ? "bg-sand-deep/60 text-ink" : "bg-ink text-card")}>
                {st?.completed ? "Rivedi o correggi il logbook" : st ? "Riprendi l'allenamento" : "Inizia questo allenamento"}
              </Link>
            ) : null}
          </Card>
        );
      })}

      {past.length || (upcoming && program.id !== upcoming.id) || (current && program.id !== current.id) ? (
        <Card className="flex flex-col gap-2">
          <Eyebrow>Altre fasi</Eyebrow>
          {[current, upcoming, ...past].filter((p): p is MyProgram => Boolean(p) && p!.id !== program.id).map((p) => (
            <Link key={p.id} href={`/cliente/programma?programma=${p.id}&settimana=1`} className="flex items-baseline justify-between gap-3 border-t border-sand-deep py-2.5 first:border-t-0 hover:opacity-70">
              <span className="font-semibold">{p.title}</span>
              <span className="text-sm text-muted">{p.id === current?.id ? "in corso" : `dal ${formatShort(p.start_date)}`}</span>
            </Link>
          ))}
        </Card>
      ) : null}
    </div>
  );
}
