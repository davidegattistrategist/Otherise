import Link from "next/link";
import type { Metadata } from "next";
import { requireActiveClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatLong, formatShort } from "@/lib/dates";
import { CIRCUMFERENCES } from "@/lib/body/skinfolds";
import { LineChart } from "@/components/line-chart";
import { ExerciseProgress } from "@/components/exercise-progress";
import { getExerciseProgress } from "@/lib/data/progress";
import { IconTrophy } from "@/components/icons";
import { BigNumber, Card, EmptyState, Eyebrow, cx, fmtNum } from "@/components/ui";

export const metadata: Metadata = { title: "Progressi" };

type Test = { exercise?: string; load?: number | null; reps?: number | null; rpe?: number | null; e1rm?: number | null };

export default async function ProgressPage({ searchParams }: { searchParams: Promise<{ misura?: string; esercizio?: string }> }) {
  const { misura, esercizio } = await searchParams;
  const me = await requireActiveClient();
  const supabase = await createClient();
  const [{ data: checks }, { data: posture }, { data: checkins }, { data: sessions }] = await Promise.all([
    supabase.rpc("my_checks"),
    supabase.from("posture_assessments").select("id, assessed_on, tight_muscles, what_works, posture_work, notes").eq("client_id", me.clientId).order("assessed_on", { ascending: false }).limit(3),
    supabase.from("checkins").select("week_start, training, sleep, stress, adherence").eq("client_id", me.clientId).order("week_start", { ascending: true }).limit(26),
    supabase.rpc("my_pt_session_dates"),
  ]);
  const list = checks ?? [];
  const exerciseSeries = await getExerciseProgress(supabase, me.clientId);
  const records = exerciseSeries.filter((x) => x.record).slice(0, 6);
  const series = (pick: (c: (typeof list)[number]) => number | string | null) =>
    list.map((c) => ({ date: c.check_date, value: pick(c) })).filter((p) => p.value !== null && p.value !== undefined).map((p) => ({ date: p.date, value: Number(p.value) }));
  const circKey = CIRCUMFERENCES.find((c) => c.key === misura)?.key ?? CIRCUMFERENCES.find((c) => list.some((k) => (k.circumferences as Record<string, number>)?.[c.key]))?.key ?? "vita";
  const circLabel = CIRCUMFERENCES.find((c) => c.key === circKey)!.label;

  // Test di forza: ultimo valore per esercizio e andamento
  const byExercise = new Map<string, Array<{ date: string; value: number; text: string }>>();
  for (const c of list) {
    for (const t of ((c.strength_tests as Test[] | null) ?? [])) {
      if (!t.exercise) continue;
      const value = t.e1rm ?? t.load ?? null;
      if (value === null) continue;
      const arr = byExercise.get(t.exercise) ?? [];
      arr.push({ date: c.check_date, value, text: t.e1rm ? `≈ ${fmtNum(t.e1rm)} kg massimale stimato` : `${fmtNum(t.load)} kg × ${t.reps ?? "?"}` });
      byExercise.set(t.exercise, arr);
    }
  }
  const testsText = list.filter((c) => c.tests_text).slice(-3).reverse();
  const first = list[0];
  const last = list[list.length - 1];
  const delta = (a: unknown, b: unknown) => (a === null || b === null || a === undefined || b === undefined ? null : Number(b) - Number(a));
  const ptThisYear = (sessions ?? []).filter((d) => String(d).slice(0, 4) === new Date().getFullYear().toString()).length;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[30px] leading-tight font-normal tracking-tight">I tuoi progressi</h1>
      {list.length === 0 ? (
        <EmptyState title="Ancora nessun check">Dopo il primo check con il tuo coach qui trovi peso, massa grassa, massa magra, circonferenze e test.</EmptyState>
      ) : (
        <>
          {first && last && first !== last ? (
            <Card dark className="flex flex-col gap-3">
              <Eyebrow dark>Dal {formatLong(first.check_date)}</Eyebrow>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Peso", d: delta(first.weight_kg, last.weight_kg), unit: "kg" },
                  { label: "Massa grassa", d: delta(first.body_fat_pct, last.body_fat_pct), unit: "%" },
                  { label: "Massa magra", d: delta(first.lean_mass_kg, last.lean_mass_kg), unit: "kg" },
                ].map((x) => (
                  <div key={x.label}>
                    <div className="text-xs text-muted-dark">{x.label}</div>
                    <BigNumber value={x.d === null ? "–" : `${x.d > 0 ? "+" : x.d < 0 ? "−" : ""}${fmtNum(Math.abs(x.d))}`} unit={x.unit} className="text-card" />
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card><Eyebrow className="mb-2">Massa grassa · %</Eyebrow><LineChart label="Massa grassa" unit="%" points={series((c) => c.body_fat_pct)} /></Card>
            <Card><Eyebrow className="mb-2">Massa magra · kg</Eyebrow><LineChart label="Massa magra" unit="kg" points={series((c) => c.lean_mass_kg)} /></Card>
            <Card><Eyebrow className="mb-2">Peso · kg</Eyebrow><LineChart label="Peso" unit="kg" points={series((c) => c.weight_kg)} /></Card>
            <Card>
              <Eyebrow className="mb-2">Circonferenze · cm</Eyebrow>
              <div className="scroll-x mb-2 flex gap-1.5 overflow-x-auto pb-1">
                {CIRCUMFERENCES.filter((c) => list.some((k) => (k.circumferences as Record<string, number>)?.[c.key])).map((c) => (
                  <Link key={c.key} href={`/cliente/progressi?misura=${c.key}`} scroll={false} className={cx("shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold", c.key === circKey ? "bg-ink text-card" : "bg-sand-deep/60")}>{c.label}</Link>
                ))}
              </div>
              <LineChart label={circLabel} unit="cm" points={series((c) => (c.circumferences as Record<string, number>)?.[circKey] ?? null)} />
            </Card>
          </div>
        </>
      )}

      <ExerciseProgress title="I tuoi esercizi" series={exerciseSeries} selected={esercizio} hrefFor={(k) => `/cliente/progressi?esercizio=${encodeURIComponent(k)}`} />

      {records.length ? (
        <Card className="flex flex-col gap-2">
          <Eyebrow>I tuoi record</Eyebrow>
          <ul className="flex flex-col">
            {records.map((r) => (
              <li key={r.key} className="flex items-center justify-between gap-3 border-t border-sand-deep py-2.5 first:border-t-0">
                <span className="flex min-w-0 items-center gap-2.5"><IconTrophy size={18} className="shrink-0 text-accent-deep" /><span className="truncate font-semibold">{r.name}</span></span>
                <span className="shrink-0 text-right text-sm"><span className="font-semibold tabular">{fmtNum(r.record!.kg)} kg × {r.record!.reps}</span> <span className="text-muted">· {formatShort(r.record!.date)}</span></span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {byExercise.size || testsText.length ? (
        <Card className="flex flex-col gap-3">
          <Eyebrow>Test di forza e performance</Eyebrow>
          {[...byExercise.entries()].map(([name, pts]) => {
            const lastT = pts[pts.length - 1];
            const firstT = pts[0];
            return (
              <div key={name} className="flex items-baseline justify-between gap-3 border-t border-sand-deep pt-2.5 first:border-t-0 first:pt-0">
                <div className="min-w-0">
                  <div className="font-semibold">{name}</div>
                  <div className="text-sm text-muted">{lastT.text} · {formatShort(lastT.date)}</div>
                </div>
                {pts.length > 1 ? <span className="shrink-0 text-sm font-semibold tabular">{lastT.value >= firstT.value ? "+" : "−"}{fmtNum(Math.abs(lastT.value - firstT.value))} kg</span> : null}
              </div>
            );
          })}
          {testsText.map((c) => (
            <div key={c.id} className="border-t border-sand-deep pt-2.5 text-[15px]">
              <div className="text-sm text-muted">{formatShort(c.check_date)}</div>
              <p className="whitespace-pre-line">{c.tests_text}</p>
            </div>
          ))}
        </Card>
      ) : null}

      {posture?.length ? (
        <Card className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between"><Eyebrow>Postura</Eyebrow><span className="text-xs text-muted">{formatShort(posture[0].assessed_on)}</span></div>
          {[
            ["Da allungare / sciogliere", posture[0].tight_muscles],
            ["Cosa funziona bene", posture[0].what_works],
            ["Il tuo lavoro posturale", posture[0].posture_work],
            ["Note", posture[0].notes],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k}>
              <div className="text-sm font-semibold">{k}</div>
              <p className="text-[15px] leading-relaxed whitespace-pre-line text-ink-soft">{v}</p>
            </div>
          ))}
        </Card>
      ) : null}

      {checkins && checkins.length > 1 ? (
        <Card className="flex flex-col gap-2">
          <Eyebrow>Come stai · check-up settimanali</Eyebrow>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><div className="mb-1 text-sm font-semibold">Sonno e recupero</div><LineChart label="Sonno" height={110} digits={0} yMin={1} yMax={5} points={checkins.map((c) => ({ date: c.week_start, value: c.sleep }))} /></div>
            <div><div className="mb-1 text-sm font-semibold">Stress</div><LineChart label="Stress" height={110} digits={0} yMin={1} yMax={5} points={checkins.map((c) => ({ date: c.week_start, value: c.stress }))} /></div>
          </div>
        </Card>
      ) : null}

      {sessions?.length ? <p className="px-1 text-sm text-muted">Sessioni con il coach quest&apos;anno: <span className="font-semibold text-ink">{ptThisYear}</span></p> : null}
    </div>
  );
}
