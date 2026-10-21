import type { Metadata } from "next";
import { requireActiveClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatLong, formatShort, todayISO } from "@/lib/dates";
import { DailyWeight } from "@/components/daily-weight";
import { getWeights } from "@/lib/data/weights";
import { averagesOf, type SkinfoldReadings } from "@/lib/body/skinfolds";
import { circOf, firstToLast, sitesInAll, toNumber, type BodyPoint } from "@/lib/body/progress";
import { BodyCharts, CheckCompare } from "@/components/body-progress";
import { LineChart } from "@/components/line-chart";
import { StrengthTests } from "@/components/strength-tests";
import { strengthTestSeries } from "@/lib/strength/tests";
import { ExerciseProgress } from "@/components/exercise-progress";
import { getExerciseProgress } from "@/lib/data/progress";
import { IconTrophy } from "@/components/icons";
import { BigNumber, Card, EmptyState, Eyebrow, fmtNum } from "@/components/ui";
import { myCheckPhotos } from "@/lib/check-photos";
import { PhotoAlbums, PhotoCompare } from "@/components/check-photos";

export const metadata: Metadata = { title: "Progressi" };

export default async function ProgressPage({ searchParams }: { searchParams: Promise<{ esercizio?: string }> }) {
  const { esercizio } = await searchParams;
  const me = await requireActiveClient();
  const supabase = await createClient();
  const [{ data: checks }, { data: posture }, { data: checkins }, { data: sessions }, exerciseSeries, photos, weights] = await Promise.all([
    supabase.rpc("my_checks"),
    supabase.from("posture_assessments").select("id, assessed_on, tight_muscles, what_works, posture_work, notes").eq("client_id", me.clientId).order("assessed_on", { ascending: false }).limit(3),
    supabase.from("checkins").select("week_start, training, sleep, stress, adherence").eq("client_id", me.clientId).order("week_start", { ascending: true }).limit(26),
    supabase.rpc("my_pt_session_dates"),
    getExerciseProgress(supabase, me.clientId),
    myCheckPhotos(supabase),
    getWeights(supabase, me.clientId),
  ]);
  const list = checks ?? [];
  // foto dei check, dal più recente
  const photoChecks = [...photos.values()].filter((g) => g.length).sort((a, b) => (b[0].checkDate ?? "").localeCompare(a[0].checkDate ?? ""));
  const records = exerciseSeries.filter((x) => x.record).slice(0, 6);
  const year = new Date().getFullYear();
  const points: BodyPoint[] = list.map((c) => ({
    id: c.id,
    date: c.check_date,
    label: formatShort(c.check_date, year),
    weight: toNumber(c.weight_kg),
    fatPct: toNumber(c.body_fat_pct),
    fatKg: toNumber(c.fat_mass_kg),
    leanKg: toNumber(c.lean_mass_kg),
    folds: averagesOf(c.skinfolds as SkinfoldReadings),
    circ: circOf(c.circumferences),
  }));
  // ogni misura dal primo check che ce l'ha (non tutti i check hanno le pliche)
  const summary = [
    { label: "Peso", d: firstToLast(points, (p) => p.weight), unit: "kg" },
    { label: "Massa grassa", d: firstToLast(points, (p) => p.fatKg), unit: "kg" },
    { label: "Massa grassa", d: firstToLast(points, (p) => p.fatPct), unit: "%" },
    { label: "Massa magra", d: firstToLast(points, (p) => p.leanKg), unit: "kg" },
  ];

  // Test di forza dei check: un grafico per esercizio
  const strength = strengthTestSeries(list);
  const testsText = list.filter((c) => c.tests_text).slice(-3).reverse();
  const ptThisYear = (sessions ?? []).filter((d) => String(d).slice(0, 4) === new Date().getFullYear().toString()).length;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[30px] leading-tight font-normal tracking-tight">I tuoi progressi</h1>
      <div id="peso" className="scroll-mt-24"><DailyWeight entries={weights} today={todayISO()} /></div>
      {list.length === 0 ? (
        <EmptyState title="Ancora nessun check">Dopo il primo check con il tuo coach qui trovi peso, massa grassa, massa magra, circonferenze e test.</EmptyState>
      ) : (
        <>
          {summary.some((x) => x.d) ? (
            <Card dark className="flex flex-col gap-3">
              <Eyebrow dark>Dal primo check</Eyebrow>
              <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4">
                {summary.map((x) => (
                  <div key={x.label}>
                    <div className="text-xs text-muted-dark">{x.label}</div>
                    <BigNumber value={x.d === null ? "–" : `${x.d.diff > 0 ? "+" : x.d.diff < 0 ? "−" : ""}${fmtNum(Math.abs(x.d.diff))}`} unit={x.unit} className="text-card" />
                    {x.d ? <div className="mt-0.5 text-xs text-muted-dark tabular">{fmtNum(x.d.from)} → {fmtNum(x.d.to)}</div> : null}
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
          <BodyCharts points={points} sumSites={sitesInAll(points)} />
          <CheckCompare points={points} sumSites={sitesInAll(points)} title="Confronta due check" />
        </>
      )}

      {photoChecks.length ? (
        <Card className="flex flex-col gap-2">
          <Eyebrow>Le foto dei check</Eyebrow>
          <PhotoAlbums albums={photoChecks.map((g) => ({ id: g[0].checkId, title: g[0].checkDate ? formatLong(g[0].checkDate) : "Check", photos: g }))} />
          <PhotoCompare albums={[...photoChecks].reverse().map((g) => ({ id: g[0].checkId, title: g[0].checkDate ? formatShort(g[0].checkDate) : "Check", photos: g }))} label="Confronta due check" />
        </Card>
      ) : null}

      {strength.length ? (
        <StrengthTests series={strength} title="Test di forza e performance" footer={testsText.length ? <div className="flex flex-col">{testsText.map((c) => (
            <div key={c.id} className="border-t border-sand-deep pt-2.5 text-[15px]">
              <div className="text-sm text-muted">{formatShort(c.check_date)}</div>
              <p className="whitespace-pre-line">{c.tests_text}</p>
            </div>
          ))}</div> : null} />
      ) : testsText.length ? (
        <Card className="flex flex-col gap-3">
          <Eyebrow>Test di forza e performance</Eyebrow>
          {testsText.map((c) => (
            <div key={c.id} className="border-t border-sand-deep pt-2.5 text-[15px]">
              <div className="text-sm text-muted">{formatShort(c.check_date)}</div>
              <p className="whitespace-pre-line">{c.tests_text}</p>
            </div>
          ))}
        </Card>
      ) : null}

      <ExerciseProgress title="I tuoi esercizi" series={exerciseSeries} selected={esercizio} />

      {records.length ? (
        <Card className="flex flex-col gap-2">
          <Eyebrow>I tuoi record</Eyebrow>
          <ul className="flex flex-col">
            {records.map((r) => (
              <li key={r.key} className="flex items-center justify-between gap-3 border-t border-sand-deep py-2.5 first:border-t-0">
                <span className="flex min-w-0 items-center gap-2.5"><IconTrophy size={18} className="shrink-0 text-accent-deep" /><span className="min-w-0 font-semibold break-words">{r.name}</span></span>
                <span className="max-w-[45%] shrink-0 text-right text-sm"><span className="font-semibold tabular">{fmtNum(r.record!.kg)} kg × {r.record!.reps}</span> <span className="text-muted">· {formatShort(r.record!.date)}</span></span>
              </li>
            ))}
          </ul>
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
          <Eyebrow>Come stai · diari settimanali</Eyebrow>
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
