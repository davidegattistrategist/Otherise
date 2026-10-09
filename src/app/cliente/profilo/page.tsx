import type { Metadata } from "next";
import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getMyPrograms } from "@/lib/data/me";
import { diffDays, formatLong, formatShort, todayISO } from "@/lib/dates";
import { programEndDate } from "@/lib/program/schedule";
import { billingStatus, formatEuro, METHOD_LABELS, PLAN_LABELS, type BillingRow, type PaymentMethod, type PlanKind } from "@/lib/billing";
import { Card, Dot, Eyebrow, ProgressBar } from "@/components/ui";
import { PasswordForm } from "@/components/password-form";
import { IconLogout } from "@/components/icons";
import { signOut } from "@/app/login/actions";

export const metadata: Metadata = { title: "Percorso" };

export default async function ClientProfilePage() {
  const me = await requireClient();
  const supabase = await createClient();
  const today = todayISO();
  const [{ data: client }, { data: coach }, { data: billing }, { data: payments }, { current, upcoming, past }, { data: sessions }] = await Promise.all([
    supabase.from("clients").select("first_name, last_name, email, start_date, goals").eq("id", me.clientId).single(),
    supabase.rpc("my_coach_name"),
    supabase.rpc("client_billing", { cid: me.clientId }),
    supabase.from("payments").select("id, paid_on, amount, method, period_start, period_end, sessions").eq("client_id", me.clientId).order("paid_on", { ascending: false }).limit(12),
    getMyPrograms(me.clientId),
    supabase.rpc("my_pt_session_dates"),
  ]);
  const row = (billing as BillingRow[] | null)?.[0];
  const pay = row ? billingStatus({ ...row, kind: row.kind as PlanKind }, today, 7) : null;
  const phases = [current, upcoming, ...past].filter(Boolean).length;
  const months = client ? Math.max(0, Math.round(diffDays(client.start_date, today) / 30.44)) : 0;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[30px] leading-tight font-normal tracking-tight">Il tuo percorso</h1>

      <Card dark className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          <div><div className="text-xs text-muted-dark">Insieme da</div><div className="mt-1 text-[26px] font-light tabular">{months < 1 ? "poco" : months}</div><div className="text-xs text-muted-dark">{months === 1 ? "mese" : months < 1 ? "" : "mesi"}</div></div>
          <div><div className="text-xs text-muted-dark">Fasi</div><div className="mt-1 text-[26px] font-light tabular">{phases}</div><div className="text-xs text-muted-dark">programmi</div></div>
          <div><div className="text-xs text-muted-dark">Sessioni PT</div><div className="mt-1 text-[26px] font-light tabular">{sessions?.length ?? 0}</div><div className="text-xs text-muted-dark">in totale</div></div>
        </div>
        <p className="text-sm text-muted-dark">Ti segue {coach ?? "il tuo coach"} · dal {client ? formatLong(client.start_date) : "—"}</p>
      </Card>

      {current ? (
        <Card className="flex flex-col gap-2">
          <Eyebrow>Fase attuale</Eyebrow>
          <div className="text-lg font-semibold">{current.title}</div>
          <div className="text-sm text-muted">Dal {formatShort(current.start_date)} al {formatShort(programEndDate(current.start_date, current.weeks))} · settimana {current.week} di {current.weeks}</div>
          <ProgressBar value={(current.week / current.weeks) * 100} />
        </Card>
      ) : null}

      {pay && pay.state !== "none" && row ? (
        <Card className="flex flex-col gap-3">
          <Eyebrow>Abbonamento</Eyebrow>
          <div className="flex items-center gap-2 text-lg font-semibold">
            {pay.state === "overdue" || pay.state === "due_soon" ? <Dot tone="accent" /> : null}
            {pay.dueDate ? `${pay.clientLabel} ${formatLong(pay.dueDate)}` : pay.clientLabel}
          </div>
          <p className="text-sm text-muted">{PLAN_LABELS[row.kind as PlanKind]}{row.kind === "package" ? ` · ${row.sessions_used} sessioni fatte su ${row.sessions_bought}` : ""}. I pagamenti si fanno fuori dall&apos;app, come sempre.</p>
          {payments?.length ? (
            <ul className="flex flex-col border-t border-sand-deep pt-2">
              {payments.map((p) => (
                <li key={p.id} className="flex items-baseline justify-between gap-3 py-1.5 text-[15px]">
                  <span className="text-muted">{formatShort(p.paid_on)} · {METHOD_LABELS[p.method as PaymentMethod]}{p.period_end ? ` · fino al ${formatShort(p.period_end)}` : p.sessions ? ` · ${p.sessions} sessioni` : ""}</span>
                  <span className="font-semibold tabular">{formatEuro(p.amount)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

      {client?.goals ? (
        <Card className="flex flex-col gap-2">
          <Eyebrow>Obiettivi</Eyebrow>
          <p className="text-[15px] leading-relaxed whitespace-pre-line">{client.goals}</p>
        </Card>
      ) : null}

      <Card className="flex flex-col gap-3">
        <Eyebrow>Account</Eyebrow>
        <p className="text-sm text-muted">Entri con {client?.email}</p>
        <PasswordForm />
        <form action={signOut} className="border-t border-sand-deep pt-3">
          <button type="submit" className="flex min-h-11 items-center gap-2 text-[15px] font-semibold"><IconLogout size={18} /> Esci</button>
        </form>
      </Card>
      <p className="px-1 text-xs leading-relaxed text-muted">I tuoi dati sono visibili solo a te e a chi ti allena. Per correggerli o cancellarli chiedi a {coach ?? "il tuo coach"}.</p>
    </div>
  );
}
