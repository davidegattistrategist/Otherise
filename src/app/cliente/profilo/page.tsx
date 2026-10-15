import type { Metadata } from "next";
import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getMyPaymentNotices, getMyPrograms } from "@/lib/data/me";
import { PaymentNotices } from "@/components/payment-notice";
import { diffDays, formatLong, formatShort, todayISO } from "@/lib/dates";
import { programEndDate } from "@/lib/program/schedule";
import { formatEuro, METHOD_LABELS, PLAN_LABELS, type BillingRow, type PaymentMethod, type PlanKind } from "@/lib/billing";
import { Card, Dot, Eyebrow, ProgressBar } from "@/components/ui";
import { PasswordForm } from "@/components/password-form";
import { IconArrowRight, IconBook, IconLogout } from "@/components/icons";
import Link from "next/link";
import { checkinWeekFor } from "@/lib/checkin";
import { signOut } from "@/app/login/actions";
import { PrivacyCard } from "./privacy-card";
import { ProjectTimeline } from "@/components/project-timeline";
import { isProjectEmpty, parseProject } from "@/lib/project";

export const metadata: Metadata = { title: "Il tuo percorso" };

export default async function ClientProfilePage() {
  const me = await requireClient();
  const supabase = await createClient();
  const today = todayISO();
  const [{ data: client }, { data: coach }, { data: billing }, { data: payments }, { current, upcoming, past }, { data: sessions }, { data: projectRow }] = await Promise.all([
    supabase.from("clients").select("first_name, last_name, email, start_date, goals, health_consent_at, consent_source, instagram_consent_at, weekly_checkin").eq("id", me.clientId).single(),
    supabase.rpc("my_coach_name"),
    supabase.rpc("client_billing", { cid: me.clientId }),
    supabase.from("payments").select("id, paid_on, amount, method, period_start, period_end, sessions").eq("client_id", me.clientId).eq("unpaid", false).order("paid_on", { ascending: false }).limit(12),
    getMyPrograms(me.clientId),
    supabase.rpc("my_pt_session_dates"),
    supabase.from("client_projects").select("data").eq("client_id", me.clientId).maybeSingle(),
  ]);
  const saved = parseProject(projectRow?.data);
  // un progetto lasciato vuoto non si mostra
  const project = saved && !isProjectEmpty(saved) ? saved : null;
  const row = (billing as BillingRow[] | null)?.[0];
  const ended = me.clientStatus === "archived";
  const coachFirst = coach?.split(" ")[0] || "il tuo coach";
  const { notices, ptLeft, pay } = await getMyPaymentNotices({ clientId: me.clientId, clientStatus: me.clientStatus, row, coach: coachFirst });
  const phases = [current, upcoming, ...past].filter(Boolean).length;
  const months = client ? Math.max(0, Math.round(diffDays(client.start_date, today) / 30.44)) : 0;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[30px] leading-tight font-normal tracking-tight">{ended ? "Il tuo account" : "Il tuo percorso"}</h1>

      {ended ? (
        <Card className="flex flex-col gap-2">
          <p className="text-[15px] leading-relaxed">Il percorso con {coach ?? "il tuo coach"} è terminato. Puoi sempre scrivergli in chat, per chiedere un dato o per ripartire insieme.</p>
        </Card>
      ) : null}

      {!ended ? (
      <Card dark className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          <div><div className="text-xs text-muted-dark">Insieme da</div><div className="mt-1 text-[26px] font-light tabular">{months < 1 ? "poco" : months}</div><div className="text-xs text-muted-dark">{months === 1 ? "mese" : months < 1 ? "" : "mesi"}</div></div>
          <div><div className="text-xs text-muted-dark">Fasi</div><div className="mt-1 text-[26px] font-light tabular">{phases}</div><div className="text-xs text-muted-dark">programmi</div></div>
          <div><div className="text-xs text-muted-dark">Sessioni PT</div><div className="mt-1 text-[26px] font-light tabular">{sessions?.length ?? 0}</div><div className="text-xs text-muted-dark">in totale</div></div>
        </div>
        <p className="text-sm text-muted-dark">Ti segue {coach ?? "il tuo coach"} · dal {client ? formatLong(client.start_date) : "—"}</p>
      </Card>
      ) : null}

      {project && !ended ? (
        <Card id="progetto" className="flex scroll-mt-6 flex-col gap-3">
          <Eyebrow>Il tuo progetto</Eyebrow>
          {project.goal.trim() ? <p className="text-lg leading-snug font-semibold">{project.goal}</p> : null}
          <p className="text-sm text-muted">Come si susseguiranno le fasi nei prossimi mesi e su cosa lavoreremo di più. Il mese in corso è evidenziato.</p>
          <ProjectTimeline project={project} today={today} />
        </Card>
      ) : null}

      {current ? (
        <Card className="flex flex-col gap-2">
          <Eyebrow>Fase attuale</Eyebrow>
          <div className="text-lg font-semibold">{current.title}</div>
          <div className="text-sm text-muted">Dal {formatShort(current.start_date)} al {formatShort(programEndDate(current.start_date, current.weeks))} · settimana {current.week} di {current.weeks}</div>
          <ProgressBar value={(current.week / current.weeks) * 100} />
        </Card>
      ) : null}

      {client?.weekly_checkin && !ended ? (
        <Link href="/cliente/diario" className="flex min-h-16 items-center justify-between gap-3 rounded-[24px] bg-card px-5 py-4">
          <span className="flex items-center gap-3">
            <IconBook size={20} />
            <span>
              <span className="block font-semibold">Il tuo diario</span>
              <span className="block text-sm text-muted">{checkinWeekFor(today) ? "È aperto: compilalo entro domenica" : "Si apre il venerdì · qui trovi anche le settimane passate e le risposte"}</span>
            </span>
          </span>
          <IconArrowRight size={18} className="shrink-0 text-muted" />
        </Link>
      ) : null}

      {!ended ? <PaymentNotices notices={notices} coach={coachFirst} /> : null}

      {pay && pay.state !== "none" && row ? (
        <Card className="flex flex-col gap-3">
          <Eyebrow>Il tuo piano</Eyebrow>
          <div className="flex items-center gap-2 text-lg font-semibold">
            {pay.state === "overdue" || pay.state === "due_soon" ? <Dot tone="accent" /> : null}
            {pay.state === "overdue" ? pay.clientLabel : pay.dueDate ? `${pay.clientLabel} ${formatLong(pay.dueDate)}` : pay.clientLabel}
          </div>
          {ptLeft ? <p className="text-[15px]">{ptLeft === 1 ? "Ti resta 1 sessione PT" : `Ti restano ${ptLeft} sessioni PT`} già saldate.</p> : null}
          <p className="text-sm text-muted">{PLAN_LABELS[row.kind as PlanKind]}{row.kind === "package" ? (row.sessions_bought - row.sessions_used > 0 ? ` · ${row.sessions_bought - row.sessions_used === 1 ? "ti resta 1 sessione" : `ti restano ${row.sessions_bought - row.sessions_used} sessioni`}` : " · sessioni del pacchetto finite") : ""}.</p>
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

      {client?.goals && !ended ? (
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
      <PrivacyCard
        instagramSince={client?.instagram_consent_at ? formatLong(client.instagram_consent_at.slice(0, 10)) : null}
        consentLabel={client?.health_consent_at ? `Consenso sui dati relativi alla salute dato il ${formatLong(client.health_consent_at.slice(0, 10))}${client.consent_source === "paper" ? " (su carta)" : ""}.` : "Consenso non ancora dato."}
      />
      <p className="px-1 text-xs leading-relaxed text-muted">I tuoi dati sono visibili solo a te e a chi ti allena. Per correggerli chiedi a {coach ?? "il tuo coach"}.</p>
    </div>
  );
}
