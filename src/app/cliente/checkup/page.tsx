import type { Metadata } from "next";
import { requireActiveClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatShort, isoWeekday, todayISO } from "@/lib/dates";
import { CHECKIN_OPENS_ON, CHECKIN_QUESTIONS, checkinWeekFor } from "@/lib/checkin";
import { Card, EmptyState, Eyebrow, Notice } from "@/components/ui";
import { CheckinForm } from "./checkin-form";

export const metadata: Metadata = { title: "Check-up" };

export default async function ClientCheckupPage({ searchParams }: { searchParams: Promise<{ inviato?: string }> }) {
  const { inviato } = await searchParams;
  const me = await requireActiveClient();
  const supabase = await createClient();
  const today = todayISO();
  const week = checkinWeekFor(today);
  const [{ data: client }, { data: coach }, { data: history }] = await Promise.all([
    supabase.from("clients").select("weekly_checkin").eq("id", me.clientId).single(),
    supabase.rpc("my_coach_name"),
    supabase.from("checkins").select("id, week_start, training, sleep, stress, adherence, issues, request, coach_reply").eq("client_id", me.clientId).order("week_start", { ascending: false }).limit(12),
  ]);
  const coachName = coach ?? "il tuo coach";
  const current = week ? history?.find((h) => h.week_start === week) : undefined;
  const opensIn = (CHECKIN_OPENS_ON - isoWeekday(today) + 7) % 7;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[30px] leading-tight font-normal tracking-tight">Check-up settimanale</h1>
        <p className="mt-1 text-[15px] text-muted">Quattro domande per capire come va. Se qualcosa non va, {coachName} lo vede subito.</p>
      </div>
      {inviato ? <Notice tone="success">Grazie! Check-up inviato.</Notice> : null}
      {!client?.weekly_checkin ? (
        <EmptyState title="Il check-up non è attivo">Se ti va di usarlo, chiedi a {coachName} di attivarlo.</EmptyState>
      ) : week ? (
        <Card className="flex flex-col gap-4">
          <Eyebrow>Settimana dal {formatShort(week)} · entro {formatShort(addDays(week, 6))}</Eyebrow>
          <CheckinForm coach={coachName} values={current ?? undefined} />
        </Card>
      ) : (
        <Card className="flex flex-col gap-1">
          <Eyebrow>Prossimo check-up</Eyebrow>
          <p className="text-lg font-semibold">Si apre {opensIn === 1 ? "domani" : `tra ${opensIn} giorni`}, venerdì {formatShort(addDays(today, opensIn))}</p>
          <p className="text-sm text-muted">Ti arriva un promemoria.</p>
        </Card>
      )}

      {history?.filter((h) => h.id !== current?.id).length ? (
        <div className="flex flex-col gap-3">
          <Eyebrow className="px-1">Settimane precedenti</Eyebrow>
          {history.filter((h) => h.id !== current?.id).map((h) => (
            <Card key={h.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">Settimana del {formatShort(h.week_start)}</span>
                <span className="text-sm text-muted tabular">{CHECKIN_QUESTIONS.map((q) => `${q.short} ${h[q.key]}`).join(" · ")}</span>
              </div>
              {h.request ? <p className="text-sm text-ink-soft">Hai chiesto: {h.request}</p> : null}
              {h.coach_reply ? <p className="rounded-2xl bg-sand-deep/50 px-4 py-3 text-[15px]"><span className="font-semibold">{coachName}:</span> {h.coach_reply}</p> : null}
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
