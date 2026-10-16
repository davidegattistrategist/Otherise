/**
 * Elenco degli allenamenti del cliente per lo staff: data, cosa (giorno del
 * programma o allenamento libero) e, aprendo la riga, cosa ha fatto esercizio
 * per esercizio, le sue note e gli eventuali dolori.
 */
import Link from "next/link";
import type { HistorySession } from "@/lib/training-history";
import { formatWithWeekday, todayISO, addDays } from "@/lib/dates";
import { IconDown } from "./icons";
import { cx } from "./ui";

function when(date: string) {
  const today = todayISO();
  if (date === today) return "Oggi";
  if (date === addDays(today, -1)) return "Ieri";
  const year = Number(today.slice(0, 4));
  const label = formatWithWeekday(date);
  return Number(date.slice(0, 4)) === year ? label : `${label} ${date.slice(0, 4)}`;
}

function Tag({ children, tone = "sand" }: { children: React.ReactNode; tone?: "sand" | "accent" | "ink" }) {
  return (
    <span className={cx("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", tone === "accent" ? "bg-accent-soft" : tone === "ink" ? "bg-ink text-card" : "bg-sand-deep/60")}>{children}</span>
  );
}

export function TrainingHistoryList({ sessions, clientId, emptyText = "Nessun allenamento registrato in questo periodo." }: { sessions: HistorySession[]; clientId: string; emptyText?: string }) {
  if (!sessions.length) return <p className="text-[15px] text-muted">{emptyText}</p>;
  return (
    <ul className="flex flex-col" data-training-history>
      {sessions.map((s) => {
        const hasMore = s.kind === "program" ? s.exercises.length > 0 || Boolean(s.notes) || Boolean(s.discomfort) : Boolean(s.notes);
        const summary = (
          <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-muted">{when(s.date)}</div>
              <div className="font-semibold break-words">{s.title}</div>
              <div className="text-sm text-muted break-words">
                {s.subtitle}
                {s.kind === "program" && s.exercises.length ? ` · ${s.planned ? `${s.exercises.length} di ${s.planned}` : s.exercises.length} esercizi` : ""}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {s.kind === "free" ? <Tag>Libero</Tag> : null}
              {s.kind === "program" && s.pt ? <Tag tone="ink">Sessione PT</Tag> : null}
              {s.kind === "program" && !s.completed ? <Tag tone="accent">Iniziato</Tag> : null}
              {s.kind === "program" && s.discomfort ? <Tag tone="accent">Dolore</Tag> : null}
            </div>
          </div>
        );
        return (
          <li key={`${s.kind}-${s.id}`} className="border-t border-sand-deep first:border-t-0" data-session={s.kind}>
            {hasMore ? (
              <details className="group">
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 py-2.5 [&::-webkit-details-marker]:hidden">
                  {summary}
                  <IconDown size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
                </summary>
                <div className="flex flex-col gap-2 pb-3">
                  {s.kind === "program" && s.exercises.length ? (
                    <ul className="flex flex-col gap-1 rounded-2xl bg-sand px-3.5 py-2.5 text-[15px]">
                      {s.exercises.map((e, i) => (
                        <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="min-w-0 break-words">{e.name}</span>
                          <span className="text-sm text-ink-soft tabular">{e.summary}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {s.kind === "program" && s.discomfort ? <p className="text-[15px]"><span className="font-semibold text-accent-deep">Dolore o fastidio:</span> {s.discomfort}</p> : null}
                  {s.notes ? <p className="text-[15px] whitespace-pre-line text-ink-soft"><span className="font-semibold text-ink">Nota:</span> {s.notes}</p> : null}
                  {s.kind === "program" ? (
                    <Link href={`/staff/clienti/${clientId}/allenamento/${s.programId}/${s.week}/${s.dayId}`} className="self-start text-sm font-semibold underline">Apri il logbook</Link>
                  ) : null}
                </div>
              </details>
            ) : (
              <div className="flex min-h-12 items-center gap-2 py-2.5 pr-[26px]">{summary}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
