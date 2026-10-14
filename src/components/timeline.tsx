/**
 * Linea del tempo delle note (staff): mesi, un pallino con l'icona per tipo,
 * la card con data, titolo, testo e righe in più. Una colonna sola: va bene
 * dal telefono e dal computer.
 */
import Link from "next/link";
import type { TimelineItem, TimelineKind } from "@/lib/data/timeline";
import { formatWithWeekday } from "@/lib/dates";
import { IconBook, IconNote, IconPlay, IconPosture, IconRuler } from "./icons";
import { cx } from "./ui";

const KIND: Record<TimelineKind, { label: string; icon: (p: { size?: number }) => React.ReactNode; dot: string }> = {
  pt: { label: "Sessione PT", icon: IconNote, dot: "bg-ink text-card" },
  check: { label: "Check", icon: IconRuler, dot: "bg-accent-soft text-accent-deep" },
  posture: { label: "Posturale", icon: IconPosture, dot: "bg-sand-deep text-ink" },
  workout: { label: "Allenamento", icon: IconPlay, dot: "bg-ink text-card" },
  diary: { label: "Diario", icon: IconBook, dot: "bg-accent-soft text-accent-deep" },
  free: { label: "Allenamento libero", icon: IconPlay, dot: "bg-sand-deep text-ink" },
};

export const KIND_LABELS: Record<TimelineKind, string> = { pt: "Sessioni PT", check: "Check", posture: "Posturale", workout: "Allenamenti", diary: "Diari", free: "Allenamenti liberi" };

const monthOf = (d: string) => new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d.slice(0, 7)}-15T00:00:00Z`));

export function Timeline({ items, empty }: { items: TimelineItem[]; empty: string }) {
  if (!items.length) return <p className="rounded-[24px] bg-card px-5 py-6 text-[15px] text-muted">{empty}</p>;
  const groups: Array<{ month: string; items: TimelineItem[] }> = [];
  for (const it of items) {
    const m = it.date.slice(0, 7);
    const g = groups[groups.length - 1];
    if (g && g.month === m) g.items.push(it);
    else groups.push({ month: m, items: [it] });
  }
  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.month} aria-label={monthOf(g.month)}>
          <h3 className="mb-3 pl-[52px] text-[13px] font-bold tracking-wider text-muted uppercase first-letter:uppercase">{monthOf(g.month)}</h3>
          <ol className="relative flex flex-col gap-3 before:absolute before:top-2 before:bottom-2 before:left-[19px] before:w-px before:bg-sand-deep">
            {g.items.map((it) => {
              const k = KIND[it.kind];
              const Icon = k.icon;
              const body = (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="text-xs font-semibold tracking-wide text-muted uppercase">{k.label} · {it.undated ? "senza data" : formatWithWeekday(it.date)}</span>
                    {it.badge ? <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-deep">{it.badge}</span> : null}
                  </div>
                  <div className="mt-1 text-[16px] leading-snug font-semibold">{it.title}</div>
                  {it.text.trim() ? <p className="mt-1.5 text-[15px] leading-relaxed whitespace-pre-line">{it.text}</p> : it.kind === "pt" || it.kind === "check" ? <p className="mt-1 text-sm text-muted">Senza note</p> : null}
                  {it.lines.length ? (
                    <dl className="mt-2.5 flex flex-col gap-1.5">
                      {it.lines.map((l, i) => (
                        <div key={i} className={cx("rounded-xl px-3 py-2 text-[14px] leading-relaxed", l.tone === "accent" ? "bg-accent-soft/70" : "bg-sand")}>
                          <dt className="text-xs font-semibold text-ink-soft">{l.label}</dt>
                          <dd className="whitespace-pre-line">{l.text}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </>
              );
              return (
                <li key={it.id} className="relative flex gap-3">
                  <span aria-hidden="true" className={cx("relative z-10 mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-4 ring-sand", k.dot)}>
                    <Icon size={18} />
                  </span>
                  {it.href ? (
                    <Link href={it.href} className="min-w-0 flex-1 rounded-[20px] bg-card px-4 py-3.5 transition-colors hover:bg-white sm:px-5">{body}</Link>
                  ) : (
                    <div className="min-w-0 flex-1 rounded-[20px] bg-card px-4 py-3.5 sm:px-5">{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
