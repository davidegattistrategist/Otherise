"use client";

/**
 * Test di forza dei check nel tempo (massimale stimato, o il carico se non si
 * può stimare): un esercizio alla volta, cambio immediato con i bottoni.
 */
import { useState } from "react";
import type { TestSeries } from "@/lib/strength/tests";
import { testDetail } from "@/lib/strength/tests";
import { LineChart } from "./line-chart";
import { Card, Eyebrow, cx, fmtNum } from "./ui";

export function StrengthTests({ series, title = "Test di forza", footer }: { series: TestSeries[]; title?: string; footer?: React.ReactNode }) {
  const [chosen, setChosen] = useState<string | null>(null);
  if (!series.length) return null;
  const cur = series.find((s) => s.key === chosen) ?? series[0];
  const first = cur.points[0];
  const last = cur.points[cur.points.length - 1];
  const delta = Math.round((last.value - first.value) * 10) / 10;
  const allEstimated = cur.points.every((p) => p.estimated);
  return (
    <Card className="@container flex flex-col gap-3" data-strength-tests>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Eyebrow>{title}</Eyebrow>
        <span className="text-sm text-muted">{allEstimated ? "massimale stimato, kg" : "massimale stimato o carico, kg"}</span>
      </div>
      {series.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {series.map((s) => (
            <button key={s.key} type="button" aria-pressed={s.key === cur.key} onClick={() => setChosen(s.key)} className={cx("min-h-9 rounded-full px-3 py-1.5 text-xs font-semibold", s.key === cur.key ? "bg-ink text-card" : "bg-sand-deep/60")}>
              {s.name}
            </button>
          ))}
        </div>
      ) : null}
      {/* sul computer il grafico non si allarga oltre una card normale (scritte giganti): accanto, i numeri */}
      {/* grafico e numeri affiancati solo se la card è larga (in Panoramica è stretta anche sul computer) */}
      <div className="grid gap-x-8 gap-y-3 @min-[44rem]:grid-cols-[minmax(0,560px)_minmax(0,1fr)] @min-[44rem]:items-start">
      {cur.points.length > 1 ? (
        <div className="min-w-0"><LineChart label={cur.name} unit="kg" points={cur.points.map((p) => ({ date: p.date, value: p.value, label: p.label }))} /></div>
      ) : null}
      <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="text-[15px]">
          <span className="font-semibold">{cur.name}</span>{" "}
          <span className="tabular">{fmtNum(last.value)} kg</span>
          <span className="text-sm text-muted"> · {last.label}{testDetail(last) ? ` · ${testDetail(last)}` : ""}</span>
        </div>
        {cur.points.length > 1 && delta !== 0 ? (
          <div className={cx("text-sm font-semibold tabular", delta > 0 ? "text-ink" : "text-accent-deep")}>{delta > 0 ? "+" : "−"}{fmtNum(Math.abs(delta))} kg dal {first.label}</div>
        ) : null}
      </div>
      {cur.points.length > 1 ? (
        <details className="group">
          <summary className="cursor-pointer list-none text-sm font-semibold underline [&::-webkit-details-marker]:hidden">Tutti i test ({cur.points.length})</summary>
          <ul className="mt-2 flex flex-col">
            {[...cur.points].reverse().map((p, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 border-t border-sand-deep py-1.5 text-sm first:border-t-0">
                <span className="text-muted">{p.label}</span>
                <span className="ml-auto text-right tabular"><span className="font-semibold">{fmtNum(p.value)} kg</span>{testDetail(p) ? <span className="text-muted"> · {testDetail(p)}</span> : null}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      </div>
      </div>
      {footer}
    </Card>
  );
}
