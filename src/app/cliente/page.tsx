import Link from "next/link";
import { getBusinessName } from "@/lib/data/shared";
import { DailyQuote } from "@/components/daily-quote";
import { dedicationOfDay, quoteOfDay } from "@/lib/quotes";
import type { Metadata } from "next";
import { requireActiveClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getMyLogs, getMyPaymentNotices, getMyPrograms } from "@/lib/data/me";
import { PaymentNotices } from "@/components/payment-notice";
import { diffDays, formatHeading, formatLong, formatShort, todayISO } from "@/lib/dates";
import { completedCount, nextWorkout, programEndDate, timeProgress } from "@/lib/program/schedule";
import { blockHeading } from "@/lib/program/types";
import { type BillingRow } from "@/lib/billing";
import { checkinWeekFor } from "@/lib/checkin";
import { LineChart } from "@/components/line-chart";
import { ArrowCTA, BigNumber, Card, Eyebrow, LinkButton, Notice, ProgressBar, Ring, fmtNum } from "@/components/ui";
import { IconPlay } from "@/components/icons";
import { ClearParams } from "@/components/clear-param";
import { PushPrompt } from "@/components/push";
import { SubmitButton } from "@/components/form-bits";
import { freeKindLabel } from "@/lib/free-workout";
import { repeatFreeWorkout } from "./allenamento-libero/actions";

export const metadata: Metadata = { title: "Oggi" };

export default async function ClientHome({ searchParams }: { searchParams: Promise<{ fatto?: string; fastidio?: string; libero?: string }> }) {
  const { fatto, fastidio, libero } = await searchParams;
  const me = await requireActiveClient();
  const supabase = await createClient();
  const today = todayISO();
  const [{ current, upcoming }, { data: client }, { data: billing }, { data: checks }, { data: coach }, { data: lastReply }, { data: brand }, { data: lastFree }] = await Promise.all([
    getMyPrograms(me.clientId),
    supabase.from("clients").select("first_name, weekly_checkin").eq("id", me.clientId).single(),
    supabase.rpc("client_billing", { cid: me.clientId }),
    supabase.rpc("my_checks"),
    supabase.rpc("my_coach_name"),
    supabase.from("checkins").select("week_start, coach_reply, reviewed_at").eq("client_id", me.clientId).neq("coach_reply", "").order("week_start", { ascending: false }).limit(1).maybeSingle(),
    getBusinessName().then((data) => ({ data })),
    supabase.from("free_workouts").select("id, kind, minutes, effort, performed_on").eq("client_id", me.clientId).order("performed_on", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const quote = quoteOfDay(today);
  const row = (billing as BillingRow[] | null)?.[0];
  const coachFirst = coach?.split(" ")[0] || "il tuo coach";
  const checkinWeek = client?.weekly_checkin ? checkinWeekFor(today) : null;
  const [logs, { notices, pay }, { data: thisCheckin }] = await Promise.all([
    current ? getMyLogs(current.id) : Promise.resolve([]),
    getMyPaymentNotices({ clientId: me.clientId, clientStatus: me.clientStatus, row, coach: coachFirst }),
    checkinWeek ? supabase.from("checkins").select("id").eq("client_id", me.clientId).eq("week_start", checkinWeek).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const bf = (checks ?? []).filter((c) => c.body_fat_pct !== null).map((c) => ({ date: c.check_date, value: Number(c.body_fat_pct) }));
  const weight = (checks ?? []).filter((c) => c.weight_kg !== null).map((c) => ({ date: c.check_date, value: Number(c.weight_kg) }));
  const lastCheck = checks?.length ? checks[checks.length - 1] : null;
  const firstCheck = checks?.length ? checks[0] : null;

  let next: ReturnType<typeof nextWorkout> = null;
  let done = 0;
  let total = 0;
  if (current) {
    // in sequenza: se ha saltato un allenamento riparte da quello
    next = current.position.state !== "not_started" ? nextWorkout(current.content, current.weeks, logs) : null;
    done = completedCount(current.content, logs, current.weeks);
    total = current.content.days.length * current.weeks;
  }
  const end = current ? programEndDate(current.start_date, current.weeks) : null;
  const daysLeft = end ? diffDays(today, end) : null;
  const inProgress = current && next ? logs.find((l) => l.week === next!.week && l.day_id === next!.day.id && !l.completed) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="pb-1">
        <div className="text-[13px] text-muted capitalize">{formatHeading(today)}</div>
        <h1 className="mt-1 text-[34px] leading-tight font-normal tracking-tight">Ciao {client?.first_name}</h1>
      </div>

      {fatto ? <><ClearParams names={["fatto", "fastidio"]} /><Notice tone="success">Allenamento registrato. Ottimo lavoro!{fastidio ? " Il tuo coach è stato avvisato del fastidio che hai segnalato: ti scrive lui come procedere." : ""}</Notice></> : null}

      {libero ? <><ClearParams names={["libero"]} /><Notice tone="success">Segnato! Il tuo coach lo vede insieme agli altri allenamenti.</Notice></> : null}

      <PushPrompt text="Ti avviso quando ti arriva un messaggio, un nuovo programma o la risposta al diario." />

      {checkinWeek && !thisCheckin ? (
        <Link href="/cliente/diario" className="flex items-center gap-3 rounded-[24px] bg-accent px-5 py-4 text-white">
          <span className="flex-1">
            <span className="block font-semibold">Diario della settimana</span>
            <span className="block text-sm opacity-90">4 domande, 3 minuti. Si compila entro domenica.</span>
          </span>
          <span aria-hidden="true" className="text-2xl">→</span>
        </Link>
      ) : null}

      {current ? (
        <Card dark className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Eyebrow dark>{next ? (inProgress ? `Da finire · settimana ${next.week}` : `Prossimo allenamento · settimana ${next.week}`) : current.position.state === "not_started" ? "Si parte presto" : "Fase completata"}</Eyebrow>
              <div className="mt-2 text-[26px] leading-tight font-semibold">
                {next ? next.day.title : current.position.state === "not_started" ? `Il ${formatLong(current.start_date)}` : "Ottimo lavoro"}
              </div>
              <div className="mt-1 text-sm text-muted-dark">
                {next
                  ? next.day.blocks.filter((b) => b.kind !== "text").slice(0, 4).map((b) => (b.kind === "single" ? b.items[0]?.name : `${blockHeading(b).title} ${blockHeading(b).detail}`.trim())).filter(Boolean).join(" · ")
                  : current.position.state === "not_started" ? current.title : `Hai fatto tutti gli allenamenti della fase. ${coach ?? "Il tuo coach"} sta preparando la prossima.`}
              </div>
            </div>
          </div>
          {next ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
              <LinkButton href={`/cliente/sessione/${current.id}/${next.week}/${next.day.id}`} variant="light" className="w-full justify-center sm:w-auto">
                <IconPlay size={18} /> {inProgress ? "Riprendi l'allenamento" : "Inizia l'allenamento"}
              </LinkButton>
              <Link href={`/cliente/programma?settimana=${next.week}`} className="flex min-h-12 items-center justify-center rounded-full px-5 text-[15px] font-semibold text-card ring-1 ring-line-dark">Oggi non puoi? Scegline un altro</Link>
            </div>
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

      {/* allenamento fuori dal programma: si segna in pochi secondi; quello di sempre con un tocco */}
      <div className="flex flex-col gap-3 rounded-[24px] bg-card px-5 py-4">
        <Link href="/cliente/allenamento-libero" className="flex items-center gap-3">
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Hai fatto altro?</span>
            <span className="block text-sm text-muted">Pesi, spinning, corsa, una partita: segnalo in 5 secondi</span>
          </span>
          <span aria-hidden="true" className="text-2xl">+</span>
        </Link>
        {lastFree && lastFree.performed_on !== today ? (
          <form action={repeatFreeWorkout.bind(null, lastFree.id)}>
            <SubmitButton variant="secondary" pendingText="Segno…" className="w-full justify-center">
              Rifai {[freeKindLabel(lastFree.kind).toLowerCase(), lastFree.minutes ? `${lastFree.minutes} min` : ""].filter(Boolean).join(" ")} oggi
            </SubmitButton>
          </form>
        ) : null}
      </div>

      {/* prima le cose da fare: la risposta del coach e gli avvisi */}
      {lastReply?.coach_reply && diffDays((lastReply.reviewed_at ?? lastReply.week_start).slice(0, 10), today) <= 14 ? (
        <Card className="flex flex-col gap-2">
          <Eyebrow>{coach ?? "Il coach"} ti ha risposto</Eyebrow>
          <p className="text-[15px] leading-relaxed whitespace-pre-line">{lastReply.coach_reply}</p>
          <span className="text-xs text-muted">Diario della settimana del {formatShort(lastReply.week_start)}</span>
        </Card>
      ) : null}
      {notices.length ? <PaymentNotices notices={notices} coach={coachFirst} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {current && current.position.state !== "not_started" ? (
          <Card className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <Ring value={timeProgress(current.start_date, current.weeks, today)} label={`${current.week}/${current.weeks}`} />
              <div className="min-w-0">
                <Eyebrow>La fase</Eyebrow>
                <div className="mt-1 text-lg font-semibold break-words">{current.title}</div>
                <div className="text-sm text-muted">
                  {current.position.state === "finished" ? `Conclusa il ${formatShort(end!)}` : daysLeft === 0 ? "Ultimo giorno" : daysLeft === 1 ? "Manca 1 giorno" : `Mancano ${daysLeft} giorni`}
                </div>
              </div>
            </div>
            <div>
              <div className="mb-1.5 flex justify-between text-sm text-muted"><span>Allenamenti fatti</span><span className="tabular">{done} di {total}</span></div>
              <ProgressBar value={total ? (done / total) * 100 : 0} />
            </div>
            {upcoming ? (
              <p className="text-sm text-muted">Prossima fase dal {formatShort(upcoming.start_date)}: {upcoming.title}</p>
            ) : current.position.state !== "finished" && daysLeft !== null && daysLeft <= 3 ? (
              <p className="text-sm text-muted">La fase sta per finire: {coach ?? "il tuo coach"} prepara la prossima. Intanto continua con gli allenamenti in ordine{done < total ? ", anche se non riesci a farli tutti" : ""}.</p>
            ) : null}
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

        {!notices.length && pay && pay.state === "ok" && pay.clientLabel ? (
          <Card className="flex flex-col gap-2">
            <Eyebrow>Percorso</Eyebrow>
            <div className="text-lg font-semibold">{pay.dueDate ? `${pay.clientLabel} ${formatShort(pay.dueDate)}` : pay.clientLabel}</div>
            <ArrowCTA href="/cliente/profilo">Dettagli</ArrowCTA>
          </Card>
        ) : null}
      </div>
      {/* la frase del giorno: a tutto schermo alla prima apertura, poi qui in fondo */}
      <DailyQuote quote={quote} dedication={dedicationOfDay(today, client?.first_name)} today={today} dateLabel={formatHeading(today)} brand={brand ?? "Otherise"} />
    </div>
  );
}
