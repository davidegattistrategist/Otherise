import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { getStaffClient } from "@/lib/data/client";
import { createClient } from "@/lib/supabase/server";
import { formatShort } from "@/lib/dates";
import { CHECKIN_QUESTIONS, SCORE_LABELS } from "@/lib/checkin";
import { Card, Dot, EmptyState, Eyebrow, Notice, Textarea, cx } from "@/components/ui";
import { SubmitButton } from "@/components/form-bits";
import { reviewCheckin } from "./actions";
import { AiCheckinBrief } from "./ai-brief";
import { aiEnabled } from "@/lib/ai/claude";

export const metadata: Metadata = { title: "Check-up" };

const tone = (v: number) => (v <= 2 ? "bg-accent text-white" : v === 3 ? "bg-sand-deep text-ink" : v === 4 ? "bg-ink-soft text-card" : "bg-ink text-card");

export default async function CheckupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireStaff();
  const client = await getStaffClient(id);
  const supabase = await createClient();
  const { data } = await supabase
    .from("checkins")
    .select("id, week_start, training, sleep, stress, adherence, issues, request, flagged, flag_reasons, coach_reply, reviewed_at, submitted_at")
    .eq("client_id", id)
    .order("week_start", { ascending: false })
    .limit(26);
  const list = data ?? [];
  const grid = [...list].slice(0, 12).reverse();

  return (
    <div className="flex flex-col gap-4">
      {!client.weekly_checkin ? (
        <Notice>Il check-up settimanale è spento per questo cliente. Lo attivi dalla <a className="font-semibold underline" href={`/staff/clienti/${id}/profilo`}>scheda</a>: il cliente lo compila in 3 minuti da venerdì a domenica e tu ricevi un avviso solo se qualcosa non va.</Notice>
      ) : null}
      {list.length === 0 ? (
        <EmptyState title="Ancora nessun check-up" />
      ) : (
        <>
          {aiEnabled() ? <AiCheckinBrief clientId={id} replyTargetId={list[0] ? `r-${list[0].id}` : null} /> : null}
          <Card className="relative overflow-x-auto">
            <Eyebrow className="mb-3">Ultime settimane</Eyebrow>
            <table className="border-separate border-spacing-1 text-sm">
              <thead>
                <tr>
                  <th />
                  {grid.map((c) => <th key={c.id} className="px-1 text-center text-xs font-normal whitespace-nowrap text-muted">{formatShort(c.week_start)}</th>)}
                </tr>
              </thead>
              <tbody>
                {CHECKIN_QUESTIONS.map((q) => (
                  <tr key={q.key}>
                    <th className="pr-3 text-left font-semibold whitespace-nowrap">{q.short}</th>
                    {grid.map((c) => (
                      <td key={c.id} title={SCORE_LABELS[c[q.key]]} className={cx("h-9 min-w-9 rounded-lg text-center font-semibold tabular", tone(c[q.key]))}>{c[q.key]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted">1 = male · 5 = benissimo. In arancio i voti da 1 o 2.</p>
          </Card>

          {list.map((c) => (
            <Card key={c.id} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-lg font-semibold">Settimana del {formatShort(c.week_start, 0)}</span>
                {c.flagged ? (
                  <span className={cx("inline-flex items-center gap-1.5 text-sm font-semibold", c.reviewed_at ? "text-muted" : "text-accent-deep")}>
                    <Dot tone={c.reviewed_at ? "muted" : "accent"} />
                    {c.flag_reasons.join(", ")}{c.reviewed_at ? " · visto" : ""}
                  </span>
                ) : (
                  <span className="text-sm text-muted">Tutto tranquillo</span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-[15px]">
                {CHECKIN_QUESTIONS.map((q) => (
                  <span key={q.key}>{q.short} <strong className={cx("tabular", c[q.key] <= 2 && "text-accent-deep")}>{c[q.key]}</strong></span>
                ))}
              </div>
              {c.issues ? <p className="text-[15px] text-ink-soft"><span className="font-semibold">Problemi:</span> {c.issues}</p> : null}
              {c.request ? <p className="rounded-2xl bg-accent-soft px-4 py-3 text-[15px]"><span className="font-semibold">Richiesta:</span> {c.request}</p> : null}
              <form action={reviewCheckin.bind(null, id, c.id)} className="flex flex-col gap-2">
                <label htmlFor={`r-${c.id}`} className="text-sm font-semibold">Risposta al cliente <span className="font-normal text-muted">(facoltativa, la vede nell&apos;app)</span></label>
                <Textarea id={`r-${c.id}`} name="coach_reply" rows={2} defaultValue={c.coach_reply} placeholder="Es. Grazie, giovedì alleggeriamo le gambe." className="min-h-16" />
                <div className="flex flex-wrap items-center gap-3">
                  <SubmitButton size="sm" variant={c.reviewed_at ? "secondary" : "primary"}>{c.reviewed_at ? "Aggiorna risposta" : "Segna come visto"}</SubmitButton>
                  {c.reviewed_at ? <span className="text-sm text-muted">Visto il {formatShort(c.reviewed_at.slice(0, 10), 0)}</span> : null}
                </div>
              </form>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
