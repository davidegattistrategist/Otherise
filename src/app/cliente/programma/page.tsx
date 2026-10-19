import Link from "next/link";
import type { Metadata } from "next";
import { requireActiveClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getMyLogs, getMyMaxes, getMyPrograms, getVideoMap, type MyProgram } from "@/lib/data/me";
import { addDays, formatShort, todayISO } from "@/lib/dates";
import { earlyStartDays, nextWorkout, programEndDate, startsLabel } from "@/lib/program/schedule";
import { EarlyStart } from "@/components/early-start/early-start";
import { Card, EmptyState, Eyebrow, cx } from "@/components/ui";
import { ProgramDayView } from "@/components/program-day";
import { IconCheck, IconDown } from "@/components/icons";
import { OneDayOpen } from "@/components/one-day-open";

export const metadata: Metadata = { title: "Programma" };

export default async function ClientProgramPage({ searchParams }: { searchParams: Promise<{ settimana?: string; programma?: string }> }) {
  const sp = await searchParams;
  const me = await requireActiveClient();
  const { current, upcoming, past } = await getMyPrograms(me.clientId, sp.programma);
  const all = [current, upcoming, ...past].filter((p): p is MyProgram => Boolean(p));
  const program = all.find((p) => p.id === sp.programma) ?? current ?? upcoming;
  if (!program) {
    return <EmptyState title="Il programma è in preparazione">Appena è pronto lo trovi qui, con tutte le settimane e i video degli esercizi.</EmptyState>;
  }
  const isCurrent = program.id === current?.id;
  // ha aperto il programma: l'avviso "programma pronto" è visto (niente email di promemoria)
  await (await createClient()).from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", me.id).eq("kind", "program_published").is("read_at", null);
  const weekParam = Number(sp.settimana);
  const [logs, videos, maxes] = await Promise.all([getMyLogs(program.id), getVideoMap(), getMyMaxes(me.clientId)]);
  // la settimana "di adesso" è quella del prossimo allenamento in sequenza
  const next = isCurrent && program.position.state !== "not_started" ? nextWorkout(program.content, program.weeks, logs) : null;
  const nowWeek = next?.week ?? program.week;
  const week = Number.isInteger(weekParam) && weekParam >= 1 && weekParam <= program.weeks ? weekParam : nowWeek;
  const status = (dayId: string) => logs.find((l) => l.week === week && l.day_id === dayId);
  const weekStart = addDays(program.start_date, (week - 1) * 7);
  const base = `/cliente/programma?${program.id !== current?.id ? `programma=${program.id}&` : ""}settimana=`;
  const canLog = program.status === "published" && program.start_date <= todayISO();
  const pastOthers = past.filter((p) => p.id !== program.id);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-[13px] text-muted">{isCurrent ? "Fase in corso" : program.id === upcoming?.id ? "Prossima fase" : "Fase passata"} · {formatShort(program.start_date)} – {formatShort(programEndDate(program.start_date, program.weeks))}</div>
        <h1 className="mt-1 text-[30px] leading-tight font-normal tracking-tight">{program.title}</h1>
        {program.description ? <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-line text-ink-soft">{program.description}</p> : null}
      </div>

      {/* settimane a capo, niente fila che esce dallo schermo (su Android sembrava rotta) */}
      <nav aria-label="Settimane" className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm font-semibold text-muted">Settimana</span>
        {Array.from({ length: program.weeks }, (_, i) => i + 1).map((w) => {
          const now = isCurrent && w === nowWeek;
          return (
            <Link
              key={w}
              href={`${base}${w}`}
              aria-current={w === week ? "page" : undefined}
              aria-label={`Settimana ${w}${now ? " (ora)" : ""}`}
              className={cx("flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full px-3 text-sm font-semibold", w === week ? "bg-ink text-card" : "bg-card text-ink")}
            >
              {w}{now ? <span className={cx("text-xs font-normal", w === week ? "text-card/80" : "text-accent")}>· ora</span> : null}
            </Link>
          );
        })}
      </nav>
      <div className="-mt-1 flex flex-wrap items-baseline gap-x-3 text-sm text-muted">
        <span>Dal {formatShort(weekStart)} al {formatShort(addDays(weekStart, 6))}{program.session_minutes ? ` · circa ${program.session_minutes} minuti a seduta` : ""}</span>
        <details className="group w-full">
          <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1 font-semibold text-ink underline [&::-webkit-details-marker]:hidden">Come funziona?</summary>
          <p className="leading-relaxed">Fai gli allenamenti in ordine: se ne salti uno, la volta dopo riparti da quello. Se un giorno non puoi (per esempio niente palestra), fanne un altro e recupera dopo. Tocca un allenamento per vedere gli esercizi.</p>
        </details>
      </div>

      {!canLog && program.status === "published" && earlyStartDays(program.start_date, todayISO()) ? (
        <Card>
          <EarlyStart programId={program.id} title={program.title} startsLabel={startsLabel(program.start_date, todayISO())} hasLeftovers={Boolean(current && current.id !== program.id && current.position.state !== "not_started")} />
        </Card>
      ) : null}
      <OneDayOpen group="giorni" />
      {program.content.days.map((day) => {
        const st = status(day.id);
        // aperto solo il prossimo da fare: gli altri si aprono al tocco
        const isNext = Boolean(next && next.week === week && next.day.id === day.id);
        const names = day.blocks.flatMap((b) => b.items.map((it) => it.name)).filter(Boolean);
        return (
          <Card key={day.id} className="flex flex-col gap-3" data-day-card>
            <div className="flex items-center justify-between gap-3">
              <h2 className="min-w-0 text-xl font-semibold break-words">{day.title}{isNext ? <span className="ml-2 align-middle rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-white">Prossimo</span> : null}</h2>
              {st?.completed ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-3 py-1 text-xs font-semibold whitespace-nowrap text-card"><IconCheck size={14} /> Fatto il {formatShort(st.performed_on)}</span>
              ) : st ? (
                <span className="shrink-0 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold whitespace-nowrap">Iniziato</span>
              ) : null}
            </div>
            {canLog ? (
              <Link href={`/cliente/sessione/${program.id}/${week}/${day.id}`} className={cx("flex min-h-12 items-center justify-center rounded-full text-[15px] font-semibold", st?.completed ? "bg-sand-deep/60 text-ink" : "bg-ink text-card")}>
                {st?.completed ? (st.performed_on === todayISO() ? "Continua o correggi il logbook" : "Rivedi o correggi il logbook") : st ? "Riprendi l'allenamento" : "Inizia questo allenamento"}
              </Link>
            ) : null}
            <details className="group" open={isNext} data-day-group="giorni">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 text-sm">
                  <span className="font-semibold group-open:hidden">{names.length === 1 ? "1 esercizio" : `${names.length} esercizi`}</span>
                  <span className="hidden font-semibold group-open:inline">Gli esercizi</span>
                  <span className="line-clamp-1 text-muted group-open:hidden" data-clamp-ok>{names.join(" · ")}</span>
                </span>
                <IconDown size={18} className="shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <div className="pt-2">
                <ProgramDayView day={day} week={week} videos={videos} maxes={maxes} />
              </div>
            </details>
          </Card>
        );
      })}

      {/* altre fasi: in corso e prossima in vista, quelle passate nell'archivio */}
      {[current, upcoming].some((p) => p && p.id !== program.id) ? (
        <Card className="flex flex-col gap-2">
          <Eyebrow>Altre fasi</Eyebrow>
          {[current, upcoming].filter((p): p is MyProgram => Boolean(p) && p!.id !== program.id).map((p) => (
            <Link key={p.id} href={`/cliente/programma?programma=${p.id}&settimana=1`} className="flex flex-wrap items-baseline justify-between gap-x-3 border-t border-sand-deep py-2.5 first:border-t-0 hover:opacity-70">
              <span className="min-w-0 font-semibold break-words">{p.title}</span>
              <span className="shrink-0 text-sm whitespace-nowrap text-muted">{p.id === current?.id ? (p.position.state === "finished" ? "conclusa" : "in corso") : `dal ${formatShort(p.start_date)}`}</span>
            </Link>
          ))}
        </Card>
      ) : null}
      {pastOthers.length ? (
        <details className="group rounded-[24px] bg-card">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="font-semibold">Archivio</span>
              <span className="ml-2 text-sm text-muted">{pastOthers.length === 1 ? "1 fase passata" : `${pastOthers.length} fasi passate`}</span>
            </span>
            <IconDown size={18} className="shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <div className="flex flex-col px-5 pb-3">
            {pastOthers.map((p) => (
              <Link key={p.id} href={`/cliente/programma?programma=${p.id}&settimana=1`} className="flex flex-wrap items-baseline justify-between gap-x-3 border-t border-sand-deep py-2.5 hover:opacity-70">
                <span className="min-w-0 font-semibold break-words">{p.title}</span>
                <span className="shrink-0 text-sm whitespace-nowrap text-muted">dal {formatShort(p.start_date)}</span>
              </Link>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
