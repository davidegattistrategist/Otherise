import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getStaffClient } from "@/lib/data/client";
import { foldContext, previousCheck, staffBodyData } from "@/lib/data/checks";
import { getCheckMode } from "@/lib/check-mode";
import { getBillingLines } from "@/lib/data/billing";
import { displayWeek } from "@/lib/program/schedule";
import { parseContent } from "@/lib/program/types";
import { formatLong, formatShort, todayISO } from "@/lib/dates";
import { formatEuro, METHOD_LABELS, type PaymentMethod } from "@/lib/billing";
import type { Sex } from "@/lib/body/skinfolds";
import { Card, Eyebrow, buttonClass, fmtNum } from "@/components/ui";
import { ProgramDayView } from "@/components/program-day";
import { QuickPay } from "@/components/quick-pay";
import type { CheckValues } from "@/app/staff/clienti/[id]/check/check-form";
import { saveCheck } from "@/app/staff/clienti/[id]/check/actions";
import { pauseCheckMode, startCheckMode } from "../actions";
import { CheckModeView } from "./check-mode-view";

export const metadata: Metadata = { title: "Modalità check" };

type Test = { exercise?: string; load?: number | null; reps?: number | null; e1rm?: number | null };

export default async function CheckModePage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const me = await requireStaff();
  const client = await getStaffClient(clientId);
  const supabase = await createClient();

  // la pagina non cambia niente da sola (il browser la può precaricare):
  // la modalità si accende o si riprende solo con i pulsanti
  const mode = await getCheckMode(supabase, me.id);
  if (!mode || mode.clientId !== clientId || mode.paused) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 py-10">
        <h1 className="text-[28px] leading-tight font-normal tracking-tight">{client.first_name} {client.last_name}</h1>
        <p className="text-[15px] text-muted">
          {mode && mode.clientId !== clientId && !mode.paused
            ? `C'è già un check in corso con ${mode.clientName}.`
            : mode?.paused && mode.clientId === clientId
              ? "Il check è in pausa: riprendilo da dove eri rimasto."
              : "Modalità check non attiva."}
        </p>
        <form action={startCheckMode.bind(null, clientId, mode?.clientId === clientId ? mode.checkId : null)}>
          <button type="submit" className={buttonClass("primary")}>{mode?.clientId === clientId ? "Riprendi il check" : "Inizia il check"}</button>
        </form>
      </div>
    );
  }
  const checkId = mode.checkId;

  const today = todayISO();
  const [{ data: checks }, existing, previous, folds, { data: programs }, billing, { data: payments }] = await Promise.all([
    supabase
      .from("checks")
      .select("id, check_date, sequence, created_at, order_hint, age_years, skinfolds, weight_kg, body_fat_pct, fat_mass_kg, lean_mass_kg, circumferences, strength_tests, tests_text")
      .eq("client_id", clientId),
    checkId ? supabase.from("checks").select("*").eq("id", checkId).eq("client_id", clientId).maybeSingle().then((r) => r.data) : Promise.resolve(null),
    previousCheck(supabase, clientId, checkId),
    client.sex ? foldContext(supabase, { ...client, sex: client.sex }, checkId ?? undefined) : Promise.resolve({ ref: null, lastMissing: [] }),
    supabase.from("programs").select("id, title, weeks, start_date, content").eq("client_id", clientId).eq("status", "published").order("start_date", { ascending: false }),
    me.role === "owner" ? getBillingLines(supabase) : Promise.resolve(null),
    me.role === "owner" ? supabase.from("payments").select("id, paid_on, amount, method, period_start, period_end, sessions").eq("client_id", clientId).eq("unpaid", false).order("paid_on", { ascending: false }).limit(4) : Promise.resolve({ data: null }),
  ]);
  if (checkId && !existing) notFound();
  const sex = (client.sex ?? null) as Sex | null;

  // confronti: grafici, confronto tra check, test
  const others = (checks ?? []).filter((c) => c.id !== checkId);
  const body = sex ? staffBodyData(others, sex, client.birth_date, client.skinfold_formula) : null;
  const tests = new Map<string, Array<{ date: string; text: string }>>();
  for (const c of body?.list ?? []) {
    for (const t of ((c.strength_tests as Test[] | null) ?? [])) {
      if (!t.exercise) continue;
      const arr = tests.get(t.exercise) ?? [];
      arr.push({ date: c.check_date ? formatShort(c.check_date, Number(today.slice(0, 4))) : "senza data", text: t.e1rm ? `≈ ${fmtNum(t.e1rm)} kg` : `${fmtNum(t.load)} × ${t.reps ?? "?"}` });
      tests.set(t.exercise, arr);
    }
  }
  const freeTests = (body?.list ?? []).filter((c) => c.tests_text).slice(-3).reverse();

  // il programma in corso (o l'ultimo)
  const current = (programs ?? []).find((p) => p.start_date && p.start_date <= today) ?? (programs ?? [])[0] ?? null;
  const content = current ? parseContent(current.content) : null;
  const week = current ? displayWeek(current.start_date, current.weeks, today) : 1;

  const line = billing?.lines.find((l) => l.clientId === clientId) ?? null;

  const values: CheckValues = existing
    ? {
        check_date: existing.check_date ?? "",
        weight_kg: existing.weight_kg === null ? null : Number(existing.weight_kg),
        skinfolds: (existing.skinfolds ?? {}) as CheckValues["skinfolds"],
        circumferences: (existing.circumferences ?? {}) as Record<string, number>,
        strength_tests: (existing.strength_tests ?? []) as CheckValues["strength_tests"],
        tests_text: existing.tests_text,
        notes_next_phase: existing.notes_next_phase,
        visible_to_client: existing.visible_to_client,
      }
    : { check_date: today, weight_kg: null, skinfolds: {}, circumferences: {}, strength_tests: [], tests_text: "", notes_next_phase: "", visible_to_client: true };

  const leave = (to: string, label: string) => (
    <form action={pauseCheckMode.bind(null, to)}>
      <button type="submit" className={buttonClass("secondary", "sm")}>{label}</button>
    </form>
  );

  return (
    <CheckModeView
      clientId={clientId}
      clientName={`${client.first_name} ${client.last_name}`.trim()}
      checkId={checkId}
      sex={sex}
      birthDate={client.birth_date}
      formula={folds.ref?.id ?? null}
      manual={Boolean(client.skinfold_formula)}
      lastMissing={folds.lastMissing}
      previous={previous}
      values={values}
      action={saveCheck.bind(null, clientId, checkId)}
      points={body?.points ?? []}
      formulas={body?.formulas ?? []}
      sumSites={body?.sumSites ?? []}
      testsPanel={
        tests.size || freeTests.length ? (
          <Card className="flex flex-col gap-3">
            <Eyebrow>Test dei check precedenti</Eyebrow>
            {[...tests.entries()].map(([name, list]) => (
              <div key={name} className="border-t border-sand-deep pt-2.5 first:border-t-0 first:pt-0">
                <div className="font-semibold">{name}</div>
                <div className="text-sm text-muted tabular">{list.map((x) => `${x.date}: ${x.text}`).join(" · ")}</div>
              </div>
            ))}
            {freeTests.map((c) => (
              <div key={c.id} className="border-t border-sand-deep pt-2.5 text-[15px]">
                <div className="text-sm text-muted">{c.check_date ? formatShort(c.check_date) : "Senza data"}</div>
                <p className="whitespace-pre-line">{c.tests_text}</p>
              </div>
            ))}
          </Card>
        ) : null
      }
      programPanel={
        current && content ? (
          <div className="flex flex-col gap-4">
            <Card className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <Eyebrow>Programma in corso</Eyebrow>
                <div className="mt-1 text-xl font-semibold">{current.title}</div>
                <div className="text-sm text-muted">Settimana {week} di {current.weeks}{current.start_date ? ` · dal ${formatLong(current.start_date)}` : ""}</div>
              </div>
              {leave(`/staff/programmi/${current.id}`, "Apri nell'editor")}
            </Card>
            {content.days.map((d) => (
              <Card key={d.id}>
                <Eyebrow className="mb-3">{d.title}</Eyebrow>
                <ProgramDayView day={d} week={week} videos={{}} compact />
              </Card>
            ))}
          </div>
        ) : (
          <Card><p className="text-[15px] text-muted">Nessun programma pubblicato.</p></Card>
        )
      }
      paymentsPanel={
        me.role !== "owner" ? null : (
          <div className="flex flex-col gap-4">
            <Card className="flex flex-col gap-3">
              <Eyebrow>Pagamenti</Eyebrow>
              {line ? (
                <>
                  <div>
                    <div className="font-semibold">{line.planLabel}</div>
                    <div className="text-sm text-muted">{line.status.label}{line.status.dueDate ? ` · saldato fino al ${formatShort(line.status.dueDate)}` : ""}</div>
                  </div>
                  {line.proposal ? (
                    <div className="flex items-center justify-between gap-3 border-t border-sand-deep pt-3">
                      <span className="min-w-0 text-[15px] tabular">{line.proposal}</span>
                      <QuickPay clientId={clientId} name={line.name} proposal={line.proposal} reminder={null} label={line.status.state === "ok" ? "Registra" : "Pagato"} />
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-[15px] text-muted">Nessun piano di pagamento.</p>
              )}
              <div className="flex flex-wrap gap-2 border-t border-sand-deep pt-3">
                {leave(`/staff/pagamenti/nuovo?cliente=${clientId}`, "Nuovo pagamento")}
                {leave(`/staff/clienti/${clientId}/pagamenti`, "Scheda pagamenti")}
              </div>
              <p className="text-xs text-muted">Questi due escono dalla modalità check: la riprendi con &quot;Riprendi&quot; in basso.</p>
            </Card>
            {payments?.length ? (
              <Card className="flex flex-col gap-1">
                <Eyebrow className="mb-1">Ultimi pagamenti</Eyebrow>
                {payments.map((p) => (
                  <div key={p.id} className="flex items-baseline justify-between gap-3 border-t border-sand-deep py-2 first:border-t-0">
                    <span className="min-w-0 text-[15px]">{formatShort(p.paid_on)} <span className="text-sm text-muted">· {p.period_start && p.period_end ? `${formatShort(p.period_start)} – ${formatShort(p.period_end)}` : p.sessions ? `${p.sessions} sessioni` : "pagamento"} · {METHOD_LABELS[p.method as PaymentMethod]}</span></span>
                    <span className="shrink-0 font-semibold tabular">{formatEuro(p.amount)}</span>
                  </div>
                ))}
              </Card>
            ) : null}
          </div>
        )
      }
      sexMissing={
        !sex ? (
          <Card className="flex flex-col gap-3">
            <p className="text-[15px]">Per le pliche serve sapere se è uomo o donna.</p>
            {leave(`/staff/clienti/${clientId}/check/nuovo`, "Indicalo")}
          </Card>
        ) : null
      }
    />
  );
}
