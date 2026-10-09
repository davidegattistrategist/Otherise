/** Andamento di un esercizio (massimale stimato per sessione) con scelta tra i più allenati. */
import Link from "next/link";
import type { ExerciseSeries } from "@/lib/data/progress";
import { formatShort } from "@/lib/dates";
import { LineChart } from "./line-chart";
import { Card, Eyebrow, cx, fmtNum } from "./ui";

export function ExerciseProgress({ series, selected, hrefFor, title = "Andamento esercizi" }: { series: ExerciseSeries[]; selected?: string; hrefFor: (key: string) => string; title?: string }) {
  if (!series.length) return null;
  const top = series.slice(0, 8);
  const cur = top.find((s) => s.key === selected) ?? top[0];
  const first = cur.points[0].value;
  const lastV = cur.points[cur.points.length - 1].value;
  const delta = Math.round((lastV - first) * 10) / 10;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Eyebrow>{title}</Eyebrow>
        <span className="text-sm text-muted">massimale stimato, kg</span>
      </div>
      <div className="scroll-x -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {top.map((s) => (
          <Link key={s.key} href={hrefFor(s.key)} scroll={false} className={cx("shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold", s.key === cur.key ? "bg-ink text-card" : "bg-sand-deep/60")}>{s.name}</Link>
        ))}
      </div>
      <LineChart label={cur.name} unit="kg" points={cur.points} />
      <p className="text-sm text-muted">
        {delta !== 0 ? <>{delta > 0 ? "+" : "−"}{fmtNum(Math.abs(delta))} kg dal {formatShort(cur.points[0].date)} · </> : null}
        {cur.record ? <>record {fmtNum(cur.record.kg)} kg × {cur.record.reps} il {formatShort(cur.record.date)}</> : null}
      </p>
    </Card>
  );
}
