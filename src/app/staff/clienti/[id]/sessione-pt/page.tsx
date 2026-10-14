import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import { parseContent } from "@/lib/program/types";
import { displayWeek, nextWorkout } from "@/lib/program/schedule";
import { Card, Eyebrow, cx } from "@/components/ui";
import { IconArrowRight, IconNote, IconPlay } from "@/components/icons";

export const metadata: Metadata = { title: "Sessione PT" };

/**
 * "Sessione PT": se il cliente ha un programma scegli se fate un suo
 * allenamento (si registra nel logbook, con le note della lezione e "si
 * scala") oppure una lezione libera (solo data e note). Senza programma la
 * pagina lo dice e offre solo la lezione libera (prima si saltava dritti a
 * Sessioni PT e non si capiva perché).
 */
export default async function PtSessionChoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireStaff();
  const supabase = await createClient();
  const today = todayISO();
  const free = `/staff/clienti/${id}/sessioni#nuova`;
  const { data: programs } = await supabase.from("programs").select("id, title, weeks, start_date, content").eq("client_id", id).eq("status", "published").not("start_date", "is", null).order("start_date", { ascending: false });
  const current = (programs ?? []).find((p) => p.start_date! <= today) ?? null;
  const content = current ? parseContent(current.content) : null;
  if (!current || !content?.days.length) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <h2 className="text-[24px] leading-tight font-semibold">Sessione PT di oggi</h2>
        <p className="text-[15px] text-muted">Nessun programma in corso: registri la lezione come lezione libera, con data, &quot;si scala&quot; e note.</p>
        <Link href={free} className="flex min-h-16 items-center justify-between gap-3 rounded-[24px] bg-ink px-5 py-4 text-card">
          <span className="flex items-center gap-3">
            <IconNote size={20} />
            <span className="font-semibold">Registra la lezione libera</span>
          </span>
          <IconArrowRight size={18} />
        </Link>
      </div>
    );
  }
  const { data: logs } = await supabase.from("workout_logs").select("week, day_id, completed").eq("program_id", current.id);
  const next = nextWorkout(content, current.weeks, logs ?? []);
  const week = next?.week ?? displayWeek(current.start_date!, current.weeks, today);
  const nextDay = next?.day ?? content.days[0];
  const done = new Set((logs ?? []).filter((l) => l.completed && l.week === week).map((l) => l.day_id));
  const href = (dayId: string) => `/staff/clienti/${id}/allenamento/${current.id}/${week}/${dayId}?pt=1`;

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h2 className="text-[24px] leading-tight font-semibold">Sessione PT di oggi</h2>
      <Card className="flex flex-col gap-3">
        <Eyebrow>Un allenamento del suo programma</Eyebrow>
        <p className="text-sm text-muted">{current.title} · settimana {week}. Registri le serie nel suo logbook e in fondo trovi le note della lezione: chiudendo si salva anche la sessione PT.</p>
        <Link href={href(nextDay.id)} className="flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-card">
          <span className="flex items-center gap-3">
            <IconPlay size={18} />
            <span><span className="block text-xs text-muted-dark">Il prossimo</span><span className="block font-semibold">{nextDay.title}</span></span>
          </span>
          <IconArrowRight size={18} />
        </Link>
        {content.days.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {content.days.filter((d) => d.id !== nextDay.id).map((d) => (
              <Link key={d.id} href={href(d.id)} className={cx("min-h-10 rounded-full px-4 py-2 text-sm font-semibold", done.has(d.id) ? "bg-sand text-muted" : "bg-sand")}>
                {d.title}{done.has(d.id) ? " · fatto" : ""}
              </Link>
            ))}
          </div>
        ) : null}
      </Card>
      <Link href={free} className="flex min-h-16 items-center justify-between gap-3 rounded-[24px] bg-card px-5 py-4">
        <span className="flex items-center gap-3">
          <IconNote size={20} />
          <span><span className="block font-semibold">Lezione libera</span><span className="block text-sm text-muted">Fuori dal programma: data, &quot;si scala&quot; e note della lezione.</span></span>
        </span>
        <IconArrowRight size={18} className="text-muted" />
      </Link>
    </div>
  );
}
