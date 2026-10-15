/**
 * Una giornata del programma in sola lettura: blocchi (superserie, circuiti,
 * AMRAP, EMOM…), esercizi e prescrizione della settimana scelta.
 */
import { restLabel } from "@/lib/program/logbook";
import { VideoLink } from "./video-link";
import { blockHeading, itemLabel, type ProgramDay } from "@/lib/program/types";
import { parsePrescription } from "@/lib/program/prescription";
import { loadFromPercent } from "@/lib/strength/records";
import { cx } from "./ui";

export type VideoMap = Record<string, string>;

export function videoFor(videos: VideoMap, item: { exerciseId?: string | null; name: string }) {
  return (item.exerciseId && videos[item.exerciseId]) || videos[item.name.trim().toLowerCase()] || null;
}

/** Carico in kg di una prescrizione in % del massimale ("4x5 @80%"), se il massimale è noto. */
function pctKg(rx: string, item: { exerciseId?: string | null; name: string }, maxes?: Record<string, number>) {
  if (!maxes) return null;
  const p = parsePrescription(rx);
  if (p.kind !== "sets" || !p.pct) return null;
  const max = (item.exerciseId && maxes[item.exerciseId]) || maxes[item.name.trim().toLowerCase()];
  return max ? loadFromPercent(p.pct, max) : null;
}

export function ProgramDayView({ day, week, videos, compact, maxes }: { day: ProgramDay; week: number; videos: VideoMap; compact?: boolean; maxes?: Record<string, number> }) {
  return (
    <div className="flex flex-col gap-3">
      {day.notes ? <p className="text-sm text-muted whitespace-pre-line">{day.notes}</p> : null}
      {day.blocks.map((b, bi) => {
        if (b.kind === "text") {
          return (
            <div key={b.id} className="rounded-2xl bg-sand/70 px-4 py-3">
              {b.title ? <div className="text-sm font-semibold">{b.title}</div> : null}
              <p className="text-[15px] whitespace-pre-line text-ink-soft">{b.notes}</p>
            </div>
          );
        }
        const multi = b.kind !== "single";
        return (
          <div key={b.id} className={cx(multi && "rounded-2xl border border-sand-deep px-3 py-2.5")}>
            {multi ? (
              <div className="mb-1 flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-bold">{blockHeading(b).title}</span>
                <span className="text-muted">{blockHeading(b).detail}</span>
                {b.notes ? <span className="w-full text-muted">{b.notes}</span> : null}
              </div>
            ) : null}
            <ul className="flex flex-col">
              {b.items.map((it, ii) => {
                const video = videoFor(videos, it);
                const rx = it.prescriptions[week - 1] || "";
                return (
                  <li key={it.id} className="flex items-start gap-3 py-1.5">
                    <span className="w-7 shrink-0 pt-0.5 text-sm font-bold text-muted tabular">{itemLabel(b, bi, ii)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-3">
                        <span className="font-semibold">{it.name}</span>
                        <span className="shrink-0 text-right font-semibold tabular">
                          {rx || "—"}
                          {pctKg(rx, it, maxes) ? <span className="block text-xs font-semibold text-accent-deep">≈ {String(pctKg(rx, it, maxes)).replace(".", ",")} kg</span> : null}
                        </span>
                      </span>
                      {!compact && (it.rest || it.notes) ? (
                        <span className="block text-sm text-muted">{[restLabel(it.rest), it.notes].filter(Boolean).join(" · ")}</span>
                      ) : null}
                      {!compact && video ? (
                        <VideoLink url={video} title={it.name} className="mt-0.5 inline-flex min-h-8 items-center gap-1 text-sm font-semibold text-accent-deep" />
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
