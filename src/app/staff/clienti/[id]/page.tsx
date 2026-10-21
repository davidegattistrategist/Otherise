import { StrengthTests } from "@/components/strength-tests";
import { strengthTestSeries } from "@/lib/strength/tests";
import { sortChecks } from "@/lib/check-order";
import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { getStaffClient } from "@/lib/data/client";
import { createClient } from "@/lib/supabase/server";
import { addDays, diffDays, formatShort, todayISO } from "@/lib/dates";
import { parseContent } from "@/lib/program/types";
import { currentProgram, completedCount, displayWeek, nextWorkout, programEndDate, timeProgress, weekPosition } from "@/lib/program/schedule";
import { getPtCounter, getUnpaidRows } from "@/lib/data/billing";
import { billingStatus, withUnpaidRows, formatEuro, PLAN_LABELS, type BillingRow, type PlanKind } from "@/lib/billing";
import { CHECKIN_QUESTIONS } from "@/lib/checkin";
import { LineChart } from "@/components/line-chart";
import { ExerciseProgress } from "@/components/exercise-progress";
import { getExerciseProgress } from "@/lib/data/progress";
import { getTrainingHistory } from "@/lib/data/training";
import { trainingSummary } from "@/lib/training-history";
import { TrainingHistoryList } from "@/components/training-history";
import { TrainingSummaryView } from "@/components/training-summary";
import { ArrowCTA, BigNumber, Card, Dot, EmptyState, Eyebrow, LinkButton, Notice, ProgressBar, Ring, fmtNum } from "@/components/ui";
import { ClearParams } from "@/components/clear-param";
import { getWeights } from "@/lib/data/weights";
import { weightSummary } from "@/lib/body/weights";

export const metadata: Metadata = { title: "Cliente" };

function Delta({ now, before, unit, goodWhen }: { now: number | null; before: number | null; unit: string; goodWhen?: "up" | "down" }) {
  if (now === null || before === null) return null;
  const d = Math.round((now - before) * 10) / 10;
  if (d === 0) return <span className="text-sm text-muted">invariato</span>;
  const good = goodWhen ? (goodWhen === "up" ? d > 0 : d < 0) : null;
  return (
    <span className={`text-sm ${good === false ? "text-accent-deep" : "text-muted"}`}>
      {d > 0 ? "+" : "−"}{fmtNum(Math.abs(d))} {unit}
    </span>
  );
}

export default async function ClientOverviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fatto?: string; aperto?: string; esercizio?: string }> }) {
  const { id } = await params;
  const { fatto, aperto, esercizio } = await searchParams;
  const me = await requireStaff();
  const client = await getStaffClient(id);
  const supabase = await createClient();
  const today = todayISO();

  // tutto insieme: una sola attesa invece di quattro una dopo l'altra
  const [programs, checks, sessions, checkins, history, notes, billing, settings, exerciseSeries, ptCounterRes, unpaidRows, weights] = await Promise.all([
    supabase.from("programs").select("id, title, weeks, start_date, status, content").eq("client_id", id).in("status", ["published", "draft"]).order("start_date", { ascending: false, nullsFirst: true }),
    supabase.from("checks").select("check_date, sequence, created_at, order_hint, weight_kg, body_fat_pct, lean_mass_kg, notes_next_phase, strength_tests").eq("client_id", id).order("check_date", { ascending: true }),
    supabase.from("pt_sessions").select("id, session_date, notes").eq("client_id", id).order("session_date", { ascending: false }).limit(3),
    supabase.from("checkins").select("id, week_start, training, sleep, stress, adherence, flagged, flag_reasons, request, reviewed_at").eq("client_id", id).order("week_start", { ascending: false }).limit(1),
    getTrainingHistory(supabase, id, addDays(today, -7 * 12)),
    supabase.from("client_private_notes").select("notes").eq("client_id", id).maybeSingle(),
    me.role === "owner" ? supabase.rpc("client_billing", { cid: id }) : Promise.resolve({ data: null }),
    supabase.from("app_settings").select("reminder_days").maybeSingle(),
    getExerciseProgress(supabase, id),
    me.role === "owner" ? getPtCounter(supabase, id) : Promise.resolve(null),
    me.role === "owner" ? getUnpaidRows(supabase, id) : Promise.resolve(null),
    getWeights(supabase, id),
  ]);
  const dailyWeight = weightSummary(weights, today);
  const published = (programs.data ?? []).filter((p) => p.status === "published" && p.start_date);
  const current = currentProgram(published, today);
  const drafts = (programs.data ?? []).filter((p) => p.status === "draft");
  let programCard: React.ReactNode;
  if (current?.start_date) {
    const content = parseContent(current.content);
    const { data: logs } = await supabase.from("workout_logs").select("week, day_id, completed").eq("program_id", current.id);
    const week = displayWeek(current.start_date, current.weeks, today);
    const pos = weekPosition(current.start_date, current.weeks, today);
    const done = completedCount(content, logs ?? [], current.weeks);
    const total = content.days.length * current.weeks;
    const next = nextWorkout(content, current.weeks, logs ?? []);
    const end = programEndDate(current.start_date, current.weeks);
    const daysLeft = diffDays(today, end);
    programCard = (
      <Card dark className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Eyebrow dark>Programma in corso</Eyebrow>
            <div className="mt-2 text-[22px] leading-tight font-semibold">{current.title}</div>
            <div className="mt-1 text-sm text-muted-dark">
              {pos.state === "not_started" ? `Inizia il ${formatShort(current.start_date, 0)}` : pos.state === "finished" ? `Finito il ${formatShort(end, 0)}` : `Settimana ${week} di ${current.weeks} · finisce ${daysLeft === 0 ? "oggi" : `tra ${daysLeft} giorni`}`}
            </div>
          </div>
          <Ring value={timeProgress(current.start_date, current.weeks, today)} />
        </div>
        <div>
          <div className="mb-1.5 flex justify-between text-sm text-muted-dark"><span>Sessioni registrate</span><span className="tabular">{done} / {total}</span></div>
          <ProgressBar dark value={total ? (done / total) * 100 : 0} />
        </div>
        {next && pos.state !== "not_started" ? <div className="text-sm text-muted-dark">Prossimo allenamento: <span className="text-card">settimana {next.week} · {next.day.title}</span>{next.week < week ? " (è indietro, sta recuperando)" : ""}</div> : null}
        <div className="flex flex-wrap gap-2">
          <LinkButton href={`/staff/programmi/${current.id}`} variant="light" size="sm">Apri il programma</LinkButton>
          {pos.state !== "not_started" && content.days.length ? (
            <LinkButton href={`/staff/clienti/${id}/allenamento/${current.id}/${next?.week ?? week}/${(next?.day ?? content.days[0]).id}`} variant="secondary" size="sm" className="!bg-transparent !text-card ring-1 ring-line-dark">Registra l&apos;allenamento</LinkButton>
          ) : null}
          {pos.state !== "not_started" && daysLeft <= 10 ? <LinkButton href={`/staff/clienti/${id}/programma`} variant="secondary" size="sm" className="!bg-transparent !text-card ring-1 ring-line-dark">Prepara la prossima fase</LinkButton> : null}
        </div>
      </Card>
    );
  } else {
    programCard = (
      <Card dark className="flex flex-col gap-3">
        <Eyebrow dark>Programma</Eyebrow>
        <div className="text-[22px] leading-tight font-semibold">{drafts.length ? "Bozza pronta da pubblicare" : "Nessun programma pubblicato"}</div>
        <p className="text-sm text-muted-dark">{drafts.length ? "Rivedila e pubblicala: il cliente la vedrà subito." : "Parti da un modello, da un programma vecchio o da zero."}</p>
        <div><LinkButton href={drafts[0] ? `/staff/programmi/${drafts[0].id}` : `/staff/clienti/${id}/programma`} variant="light" size="sm">{drafts.length ? "Apri la bozza" : "Crea il programma"}</LinkButton></div>
      </Card>
    );
  }

  const curDays = current?.start_date ? parseContent(current.content).days.length : 0;
  const training = trainingSummary(history, today, current?.start_date && curDays ? { start: current.start_date, end: programEndDate(current.start_date, current.weeks), daysPerWeek: curDays } : null);

  const checkList = sortChecks(checks.data ?? []);
  const last = checkList[checkList.length - 1];
  const prev = checkList[checkList.length - 2];
  const n = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));
  const bf = checkList.filter((c) => c.body_fat_pct !== null && c.check_date).map((c) => ({ date: c.check_date!, value: Number(c.body_fat_pct) }));
  const weight = checkList.filter((c) => c.weight_kg !== null && c.check_date).map((c) => ({ date: c.check_date!, value: Number(c.weight_kg) }));

  const b = (billing.data as BillingRow[] | null)?.[0];
  const ptCounter = ptCounterRes?.counter ?? null;
  const bStatus = me.role === "owner" ? withUnpaidRows(billingStatus(b ? { ...b, kind: b.kind as PlanKind } : null, today, settings.data?.reminder_days ?? 7), unpaidRows?.get(id) ?? [], today) : null;
  const lastCheckin = checkins.data?.[0];

  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
      {fatto ? <div className="[grid-column:1/-1]"><ClearParams names={["fatto"]} /><Notice tone="success">Allenamento registrato.</Notice></div> : null}
      {aperto ? <div className="[grid-column:1/-1]"><ClearParams names={["aperto"]} /><Notice tone="success">Sessione salvata. L&apos;allenamento resta aperto: lo finisce dal suo telefono con &quot;Riprendi l&apos;allenamento&quot;.</Notice></div> : null}
      {programCard}

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between"><Eyebrow>Composizione corporea</Eyebrow>{last ? <span className="text-sm text-muted">{formatShort(last.check_date, 0)}</span> : null}</div>
        {last ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div><div className="text-xs text-muted">Peso</div><BigNumber value={fmtNum(last.weight_kg)} unit="kg" /><Delta now={n(last.weight_kg)} before={n(prev?.weight_kg)} unit="kg" /></div>
              <div><div className="text-xs text-muted">Grasso</div><BigNumber value={fmtNum(last.body_fat_pct)} unit="%" /><Delta now={n(last.body_fat_pct)} before={n(prev?.body_fat_pct)} unit="%" goodWhen="down" /></div>
              <div><div className="text-xs text-muted">Magra</div><BigNumber value={fmtNum(last.lean_mass_kg)} unit="kg" /><Delta now={n(last.lean_mass_kg)} before={n(prev?.lean_mass_kg)} unit="kg" goodWhen="up" /></div>
            </div>
            {bf.length > 1 ? <LineChart label="Massa grassa" unit="%" height={110} points={bf} /> : weight.length > 1 ? <LineChart label="Peso" unit="kg" height={110} points={weight} /> : null}
            {last.notes_next_phase ? <p className="line-clamp-6 text-sm whitespace-pre-line text-ink-soft" data-clamp-ok><span className="font-semibold">Per la prossima fase:</span>{"\n"}{last.notes_next_phase}</p> : null}
            <ArrowCTA href={`/staff/clienti/${id}/check`}>Tutti i check</ArrowCTA>
          </>
        ) : (
          <EmptyState title="Nessun check" action={<LinkButton size="sm" href={`/staff/clienti/${id}/check/nuovo`}>Primo check</LinkButton>} />
        )}
      </Card>

      {bStatus ? (
        <Card className="flex flex-col gap-2">
          <Eyebrow>Pagamenti</Eyebrow>
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Dot tone={bStatus.state === "overdue" ? "accent" : bStatus.state === "due_soon" ? "deep" : "ink"} />
            {bStatus.label}
          </div>
          {b ? <p className="text-sm text-muted">{PLAN_LABELS[b.kind as PlanKind]} · {formatEuro(b.amount)}{bStatus.dueDate ? ` · saldato fino al ${formatShort(bStatus.dueDate, 0)}` : ""}</p> : <p className="text-sm text-muted">Imposta il piano per tenere d&apos;occhio le scadenze.</p>}
          <ArrowCTA href={`/staff/clienti/${id}/pagamenti`}>Gestisci</ArrowCTA>
        </Card>
      ) : null}

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between"><Eyebrow>Ultime sessioni PT</Eyebrow><Link href={`/staff/clienti/${id}/sessione-pt`} className="text-sm font-semibold underline">Aggiungi</Link></div>
        {ptCounter ? (
          <Link href={`/staff/clienti/${id}/pagamenti#sessioni-pt`} className="flex items-center justify-between gap-3 rounded-2xl bg-sand px-4 py-2.5 text-[15px] hover:bg-sand-deep/60">
            <span>
              <span className="font-semibold">
                {ptCounter.due > 0
                  ? `${ptCounter.due} ${ptCounter.due === 1 ? "sessione" : "sessioni"} da saldare${ptCounter.dueAmount !== null ? ` · ${formatEuro(ptCounter.dueAmount)}` : ""}`
                  : ptCounter.left > 0
                    ? `${ptCounter.left} ${ptCounter.left === 1 ? "sessione pagata" : "sessioni pagate"} da fare`
                    : "Sessioni PT in pari"}
              </span>
            </span>
            {ptCounter.due > 0 ? <Dot tone="accent" /> : null}
          </Link>
        ) : null}
        {sessions.data?.length ? (
          <ul className="flex flex-col gap-3">
            {sessions.data.map((s) => (
              <li key={s.id} className="text-[15px]">
                <div className="text-sm font-semibold">{formatShort(s.session_date, 0)}</div>
                <p className="line-clamp-3 whitespace-pre-line text-ink-soft" data-clamp-ok>{s.notes || <span className="text-muted">Nessuna nota</span>}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[15px] text-muted">Nessuna sessione registrata.</p>
        )}
      </Card>

      {dailyWeight ? (
        <Card className="flex flex-col gap-2" data-weight-overview>
          <div className="flex items-baseline justify-between gap-2"><Eyebrow>Peso giorno per giorno</Eyebrow><Link href={`/staff/clienti/${id}/check#peso`} className="text-sm font-semibold underline">Grafico e pesate</Link></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-muted">Media ultimi 7 giorni</div>
              <BigNumber value={fmtNum(dailyWeight.avg7, 1)} unit="kg" />
            </div>
            <div>
              <div className="text-xs text-muted">In 4 settimane</div>
              <BigNumber value={dailyWeight.change28 === null ? "–" : `${dailyWeight.change28 > 0 ? "+" : dailyWeight.change28 < 0 ? "−" : ""}${fmtNum(Math.abs(dailyWeight.change28), 1)}`} unit={dailyWeight.change28 === null ? undefined : "kg"} />
            </div>
          </div>
          <p className="text-sm text-muted">Ultima pesata {dailyWeight.last.date === today ? "oggi" : `il ${formatShort(dailyWeight.last.date)}`}: {fmtNum(dailyWeight.last.kg, 2)} kg{dailyWeight.stale ? " · non si pesa da più di 10 giorni" : ""}</p>
        </Card>
      ) : null}

      <ExerciseProgress series={exerciseSeries} selected={esercizio} />
      <StrengthTests series={strengthTestSeries(checkList)} title="Test di forza dei check" footer={<Link href={`/staff/clienti/${id}/check`} className="text-sm font-semibold underline">Tutti i check</Link>} />

      <Card className="flex flex-col gap-3 [grid-column:1/-1]">
        <div className="flex items-baseline justify-between gap-2"><Eyebrow>Allenamenti</Eyebrow><Link href={`/staff/clienti/${id}/allenamenti`} className="text-sm font-semibold underline">Tutto lo storico</Link></div>
        <TrainingSummaryView summary={training} />
        <div className="border-t border-sand-deep pt-1">
          <TrainingHistoryList sessions={history.slice(0, 5)} clientId={id} emptyText="Il cliente non ha ancora registrato allenamenti." />
        </div>
      </Card>

      {client.weekly_checkin ? (
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between"><Eyebrow>Ultimo diario</Eyebrow>{lastCheckin ? <span className="text-sm text-muted">sett. {formatShort(lastCheckin.week_start, 0)}</span> : null}</div>
          {lastCheckin ? (
            <>
              <div className="grid grid-cols-4 gap-2 text-center">
                {CHECKIN_QUESTIONS.map((q) => (
                  <div key={q.key}>
                    <div className={`text-[26px] font-light tabular ${lastCheckin[q.key] <= 2 ? "text-accent" : ""}`}>{lastCheckin[q.key]}</div>
                    <div className="text-xs text-muted">{q.short}</div>
                  </div>
                ))}
              </div>
              {lastCheckin.flagged && !lastCheckin.reviewed_at ? <p className="text-sm"><Dot tone="accent" className="mr-1.5" />Da guardare: {lastCheckin.flag_reasons.join(", ")}</p> : null}
              <ArrowCTA href={`/staff/clienti/${id}/diario`}>Storico</ArrowCTA>
            </>
          ) : (
            <p className="text-[15px] text-muted">Nessun diario compilato. Il cliente lo trova nell&apos;app da venerdì a domenica.</p>
          )}
        </Card>
      ) : null}

      <Card className="flex flex-col gap-3">
        <Eyebrow>Obiettivi e note</Eyebrow>
        <p className="whitespace-pre-line text-[15px] text-ink-soft">{client.goals || <span className="text-muted">Obiettivi non indicati.</span>}</p>
        {notes.data?.notes ? <p className="whitespace-pre-line border-t border-sand-deep pt-3 text-sm text-muted">{notes.data.notes}</p> : null}
        <ArrowCTA href={`/staff/clienti/${id}/profilo`}>Modifica i dati</ArrowCTA>
      </Card>
    </div>
  );
}
