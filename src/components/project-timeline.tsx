/**
 * Il progetto annuale come timeline: fasi a colori, intensità degli stimoli,
 * note dei mesi. La usa il cliente (Percorso) e lo staff (anteprima).
 */
import { PHASE_BY_KEY, levelLabel, monthIndex, projectMonths, projectNowText, type Project } from "@/lib/project";
import type { ISODate } from "@/lib/dates";
import { cx } from "./ui";

function segments(phases: string[]) {
  const out: Array<{ key: string; start: number; len: number }> = [];
  phases.forEach((p, i) => {
    const last = out[out.length - 1];
    if (last && last.key === p) last.len++;
    else out.push({ key: p, start: i, len: 1 });
  });
  return out.filter((s) => s.key);
}

const NUTRITION_SHORT = ["—", "Deficit", "Normo", "Surplus"];

export function ProjectTimeline({ project, today }: { project: Project; today: ISODate }) {
  const months = projectMonths(project.start);
  const now = monthIndex(project, today);
  const grid = { display: "grid", gridTemplateColumns: "132px repeat(12, minmax(62px, 1fr))" } as const;
  const rows = project.rows.filter((r) => r.label.trim());
  const usedPhases = [...new Set(project.phases.filter(Boolean))];
  const nowText = projectNowText(project, today);
  return (
    <div className="flex flex-col gap-4">
      {nowText ? <p className="text-[15px] font-semibold">{nowText}</p> : null}
      <div className="scroll-x -mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <div className="relative min-w-[880px]">
          {/* mese corrente evidenziato */}
          {now >= 0 ? (
            <div aria-hidden="true" className="pointer-events-none absolute top-0 bottom-0 rounded-xl bg-accent/10" style={{ left: `calc(132px + (100% - 132px) * ${now / 12})`, width: "calc((100% - 132px) / 12)" }} />
          ) : null}
          <div style={grid} className="relative items-end pb-2 text-xs font-semibold tracking-wide text-muted uppercase">
            <span />
            {months.map((m, i) => (
              <span key={m.key} className={cx("text-center", i === now && "text-accent-deep")}>
                {m.short}
                {i === 0 || m.key.endsWith("-01") ? <span className="block text-[10px] font-normal normal-case">{m.year}</span> : null}
              </span>
            ))}
          </div>
          <div style={grid} className="relative items-center gap-y-1 py-1.5">
            <span className="sticky left-0 z-[1] self-stretch bg-card text-sm font-semibold leading-[2.2rem]">Fase</span>
            {segments(project.phases).map((s) => {
              const ph = PHASE_BY_KEY.get(s.key);
              const dark = s.key === "race" || s.key === "volume" || s.key === "intensity";
              return (
                <span
                  key={`${s.key}${s.start}`}
                  style={{ gridColumn: `${s.start + 2} / span ${s.len}`, background: ph?.color ?? "#d9d1c4" }}
                  className={cx("mx-0.5 truncate rounded-full px-2.5 py-1.5 text-center text-xs font-semibold", dark ? "text-card" : "text-ink")}
                  title={ph?.label}
                >
                  {s.len > 1 ? ph?.label ?? s.key : ph?.short ?? s.key}
                </span>
              );
            })}
          </div>
          {rows.map((r) => (
            <div key={r.id} style={grid} className="relative items-center border-t border-sand-deep py-2">
              <span className="sticky left-0 z-[1] self-stretch bg-card pr-2 text-sm font-semibold leading-8">{r.label}</span>
              {r.values.map((v, i) =>
                r.kind === "nutrition" ? (
                  <span key={i} className={cx("text-center text-xs", v ? "font-semibold" : "text-muted")} title={levelLabel(r.kind, v)}>{NUTRITION_SHORT[v]}</span>
                ) : (
                  <span key={i} className="flex justify-center gap-0.5" title={`${r.label}: ${levelLabel(r.kind, v)}`} aria-label={`${months[i].long}: ${levelLabel(r.kind, v)}`}>
                    {[1, 2, 3].map((n) => (
                      <span key={n} className={cx("h-3.5 w-2.5 rounded-sm", n <= v ? "bg-ink" : "bg-sand-deep/70")} />
                    ))}
                  </span>
                ),
              )}
            </div>
          ))}
          {project.notes.some((n) => n.trim()) ? (
            <div style={grid} className="relative items-start border-t border-sand-deep py-2">
              <span className="sticky left-0 z-[1] bg-card text-sm font-semibold">Note</span>
              {project.notes.map((n, i) => (
                <span key={i} className="px-1 text-center text-xs leading-snug text-ink-soft">{n}</span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted">
        {usedPhases.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: PHASE_BY_KEY.get(k)?.color }} />{PHASE_BY_KEY.get(k)?.label}</span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="flex gap-0.5"><span className="h-3 w-2 rounded-sm bg-ink" /><span className="h-3 w-2 rounded-sm bg-sand-deep" /><span className="h-3 w-2 rounded-sm bg-sand-deep" /></span>
          mantenimento · medio · alto
        </span>
      </div>
    </div>
  );
}
