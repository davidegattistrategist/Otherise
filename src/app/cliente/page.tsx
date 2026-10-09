import Link from "next/link";
import type { Metadata } from "next";
import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getMyLogs, getMyPrograms } from "@/lib/data/me";
import { diffDays, formatHeading, formatLong, formatShort, todayISO } from "@/lib/dates";
import { completedCount, nextDay, programEndDate, timeProgress } from "@/lib/program/schedule";
import { blockSummary, BLOCK_KIND_LABELS } from "@/lib/program/types";
import { billingStatus, type BillingRow, type PlanKind } from "@/lib/billing";
import { checkinWeekFor } from "@/lib/checkin";
import { LineChart } from "@/components/line-chart";
import { ArrowCTA, BigNumber, Card, Dot, Eyebrow, LinkButton, Notice, ProgressBar, Ring, fmtNum } from "@/components/ui";
import { IconPlay } from "@/components/icons";

export const metadata: Metadata = { title: "Oggi" };

export default async function ClientHome({ searchParams }: { searchParams: Promise<{ fatto?: string }> }) {
  const { fatto } = await searchParams;
  const me = await requireClient();
  const supabase = await createClient();
  const today = todayISO();
  const [{ current, upcoming }, { data: client }, { data: billing }, { data: checks }, { data: coach }, { data: lastReply }] = await Promise.all([
    getMyPrograms(me.clientId),
    supabase.from("clients").select("first_name, weekly_checkin").eq("id", me.clientId).single(),
    supabase.rpc("client_billing", { cid: me.clientId }),
    supabase.rpc("my_checks"),
    supabase.rpc("my_coach_name"),
    supabase.from("checkins").select("week_start, coach_reply, reviewed_at").eq("client_id", me.clientId).neq("coach_reply", "").order("week_start", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const logs = current ? await getMyLogs(current.id) : [];
  const checkinWeek = client?.weekly_checkin ? checkinWeekFor(today) : null;
  const { data: thisCheckin } = checkinWeek
    ? await supabase.from("checkins").select("id").eq("client_id", me.clientId).eq("week_start", checkinWeek).maybeSingle()
    : { data: null };

  const row = (billing as BillingRow[] | null)?.[0];
  const pay = row ? billingStatus({ ...row, kind: row.kind as PlanKind }, today, 7) : null;
  const bf = (checks ?? []).filter((c) => c.body_fat_pct !== null).map((c) => ({ date: c.check_date, value: Number(c.body_fat_pct) }));
  const weight = (checks ?? []).filter((c) => c.weight_kg !== null).map((c) => ({ date: c.check_date, value: Number(c.weight_kg) }));
  const lastCheck = checks?.length ? checks[checks.length - 1] : null;
  const firstCheck = checks?.length ? checks[0] : null;

  let next: ReturnType<typeof nextDay> = null;
  let done = 0;
  let total = 0;
  if (current) {
    next = current.position.state === "running" ? nextDay(current.content, current.week, logs) : null;
    done = completedCount(current.content, logs, current.weeks);
    total = current.content.days.length * current.weeks;
  }
  const end = current ? programEndDate(current.start_date, current.weeks) : null;
  const daysLeft = end ? diffDays(today, end) : null;
  const inProgress = current && next ? logs.find((l) => l.week === current.week && l.day_id === next!.day.id && !l.completed) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="pb-1">
        <div className="text-[13px] text-muted capitalize">{formatHeading(today)}</div>
        <h1 className="mt-1 text-[34px] leading-tight font-normal tracking-tight">Ciao {client?.first_name}</h1>
      </div>

      {fatto ? <Notice tone="success">Allenamento registrato. Ottimo lavoro!</Notice> : null}

      {checkinWeek && !thisCheckin ? (
        <Link href="/cliente/checkup" className="flex items-center gap-3 rounded-[24px] bg-accent px-5 py-4 text-white">
          <span className="flex-1">
            <span className="block font-semibold">Check-up della settimana</span>
            <span className="block text-sm opacity-90">4 domande, 3 minuti. Si compila entro domenica.</span>
          </span>
          <span aria-hidden="true" className="text-2xl">→</span>
        </Link>
      ) : null}

      {current ? (
        <Card dark className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Eyebrow dark>{next ? (inProgress ? "Da finire" : "Prossima sessione") : current.position.state === "not_started" ? "Si parte presto" : current.position.state === "finished" ? "Fase conclusa" : "Settimana completata"}</Eyebrow>
              <div className="mt-2 text-[26px] leading-tight font-semibold">
                {next ? next.day.title : current.position.state === "not_started" ? `Il ${formatLong(current.start_date)}` : current.position.state === "finished" ? "Ottimo lavoro" : "Riposo meritato"}
              </div>
              <div className="mt-1 text-sm text-muted-dark">
                {next
                  ? next.day.blocks.filter((b) => b.kind !== "text").slice(0, 4).map((b) => (b.kind === "single" ? b.items[0]?.name : `${BLOCK_KIND_LABELS[b.kind]} ${blockSummary(b)}`.trim())).filter(Boolean).join(" · ")
                  : current.position.state === "finished" ? `${coach ?? "Il tuo coach"} sta preparando la prossima fase.` : current.position.state === "not_started" ? current.title : "La prossima sessione arriva lunedì con la nuova settimana."}
              </div>
            </div>
          </div>
          {next ? (
            <LinkButton href={`/cliente/sessione/${current.id}/${current.week}/${next.day.id}`} variant="light" className="w-full justify-center sm:w-auto">
              <IconPlay size={18} /> {inProgress ? "Riprendi l'allenamento" : "Inizia l'allenamento"}
            </LinkButton>
          ) : (
            <ArrowCTA href="/cliente/programma" dark>Vedi il programma</ArrowCTA>
          )}
        </Card>
      ) : (
        <Card dark className="flex flex-col gap-2">
          <Eyebrow dark>Programma</Eyebrow>
          <div className="text-[24px] leading-tight font-semibold">In preparazione</div>
          <p className="text-sm text-muted-dark">{coach ?? "Il tuo coach"} sta preparando il tuo programma: ti arriva una notifica appena è pronto.</p>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {current && current.position.state !== "not_started" ? (
          <Card className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <Ring value={timeProgress(current.start_date, current.weeks, today)} label={`${current.week}/${current.weeks}`} />
              <div className="min-w-0">
                <Eyebrow>La fase</Eyebrow>
                <div className="mt-1 truncate text-lg font-semibold">{current.title}</div>
                <div className="text-sm text-muted">
                  {current.position.state === "finished" ? `Conclusa il ${formatShort(end!)}` : daysLeft === 0 ? "Ultimo giorno" : `Mancano ${daysLeft} giorni`}
                </div>
              </div>
            </div>
            <div>
              <div className="mb-1.5 flex justify-between text-sm text-muted"><span>Allenamenti fatti</span><span className="tabular">{done} di {total}</span></div>
              <ProgressBar value={total ? (done / total) * 100 : 0} />
            </div>
            {upcoming ? <p className="text-sm text-muted">Prossima fase dal {formatShort(upcoming.start_date)}: {upcoming.title}</p> : null}
          </Card>
        ) : null}

        {lastCheck ? (
          <Card className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between"><Eyebrow>Composizione corporea</Eyebrow><span className="text-xs text-muted">{formatShort(lastCheck.check_date)}</span></div>
            <div className="flex gap-6">
              <div><div className="text-xs text-muted">Massa grassa</div><BigNumber value={fmtNum(lastCheck.body_fat_pct)} unit="%" /></div>
              <div><div className="text-xs text-muted">Massa magra</div><BigNumber value={fmtNum(lastCheck.lean_mass_kg)} unit="kg" /></div>
            </div>
            {bf.length > 1 ? <LineChart label="Massa grassa" unit="%" height={100} points={bf} /> : weight.length > 1 ? <LineChart label="Peso" unit="kg" height={100} points={weight} /> : null}
            {firstCheck && firstCheck !== lastCheck && firstCheck.body_fat_pct !== null && lastCheck.body_fat_pct !== null ? (
              <p className="text-sm text-muted">Dal {formatShort(firstCheck.check_date)}: {Number(lastCheck.body_fat_pct) <= Number(firstCheck.body_fat_pct) ? "−" : "+"}{fmtNum(Math.abs(Number(lastCheck.body_fat_pct) - Number(firstCheck.body_fat_pct)))} punti di massa grassa</p>
            ) : null}
            <ArrowCTA href="/cliente/progressi">Tutti i progressi</ArrowCTA>
          </Card>
        ) : null}

        {pay && pay.state !== "none" ? (
          <Card className="flex flex-col gap-2">
            <Eyebrow>Percorso</Eyebrow>
            <div className="flex items-center gap-2 text-lg font-semibold">
              {pay.state === "overdue" || pay.state === "due_soon" ? <Dot tone="accent" /> : null}
              {pay.dueDate ? `${pay.clientLabel} ${formatShort(pay.dueDate)}` : pay.clientLabel}
            </div>
            {pay.state === "due_soon" || pay.state === "overdue" ? <p className="text-sm text-muted">È il momento di rinnovare: parlane con {coach ?? "il tuo coach"}.</p> : null}
            <ArrowCTA href="/cliente/profilo">Dettagli</ArrowCTA>
          </Card>
        ) : null}

        {lastReply?.coach_reply ? (
          <Card className="flex flex-col gap-2">
            <Eyebrow>{coach ?? "Il coach"} ti ha risposto</Eyebrow>
            <p className="text-[15px] leading-relaxed whitespace-pre-line">{lastReply.coach_reply}</p>
            <span className="text-xs text-muted">Check-up della settimana del {formatShort(lastReply.week_start)}</span>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
