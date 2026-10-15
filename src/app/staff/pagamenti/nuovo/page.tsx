import Link from "next/link";
import { getBillingOverview } from "@/lib/data/shared";
import type { Metadata } from "next";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import { bySurname, listName } from "@/lib/names";
import { billingStatus, nextPaymentProposal, type BillingRow, type PlanKind } from "@/lib/billing";
import { getCredits } from "@/lib/data/billing";
import { PageTitle } from "@/components/ui";
import { IconArrowLeft } from "@/components/icons";
import { NewPayment, type PayClient } from "./new-payment";

export const metadata: Metadata = { title: "Nuovo pagamento" };

export default async function NewPaymentPage({ searchParams }: { searchParams: Promise<{ cliente?: string; tipo?: string; sessioni?: string }> }) {
  await requireOwner();
  const { cliente, tipo, sessioni } = await searchParams;
  const supabase = await createClient();
  const [{ data: clients }, { data: plans }, { data: billing }, { data: lastPays }, { data: settings }] = await Promise.all([
    supabase.from("clients").select("id, first_name, last_name, status, start_date, pt_session_price").neq("status", "archived").eq("free", false),
    supabase.from("payment_plans").select("id, client_id, kind, amount, method, start_date, package_sessions").eq("active", true),
    getBillingOverview().then((data) => ({ data })),
    supabase.from("payments").select("client_id, method, paid_on").order("paid_on", { ascending: false }).limit(500),
    supabase.from("app_settings").select("reminder_days").maybeSingle(),
  ]);
  const today = todayISO();
  const billingBy = new Map((billing ?? []).map((b) => [b.client_id, b]));
  const [credits, lessonCredits] = await Promise.all([getCredits(supabase), getCredits(supabase, undefined, "lessons")]);
  const planBy = new Map((plans ?? []).map((p) => [p.client_id, p]));
  const paidUntilBy = new Map((billing ?? []).map((b) => [b.client_id, b.paid_until as string | null]));
  const lastMethod = new Map<string, string>();
  for (const p of lastPays ?? []) if (!lastMethod.has(p.client_id)) lastMethod.set(p.client_id, p.method);

  const list: PayClient[] = [...(clients ?? [])].sort(bySurname).map((c) => {
    const plan = planBy.get(c.id);
    const paidUntil = paidUntilBy.get(c.id) ?? null;
    const lessonsCredit = lessonCredits.get(c.id) ?? 0;
    // credito del piano: delle lezioni per i pacchetti, del coaching per i periodi
    const credit = plan?.kind === "package" ? lessonsCredit : credits.get(c.id) ?? 0;
    const proposal = plan ? nextPaymentProposal({ ...plan, kind: plan.kind as PlanKind }, paidUntil, credit) : null;
    const b = billingBy.get(c.id);
    const st = b && c.status !== "paused" ? billingStatus({ ...b, kind: b.kind as PlanKind } as BillingRow, today, settings?.reminder_days ?? 7) : null;
    return {
      id: c.id,
      name: listName(c),
      fullName: `${c.first_name} ${c.last_name}`.trim(),
      paused: c.status === "paused",
      plan: plan ? { kind: plan.kind as PlanKind, amount: Number(plan.amount), method: plan.method, packageSessions: plan.package_sessions } : null,
      proposal,
      paidUntil,
      startDate: c.start_date,
      ptPrice: c.pt_session_price !== null ? Number(c.pt_session_price) : null,
      method: lastMethod.get(c.id) ?? plan?.method ?? "cash",
      credit,
      lessonsCredit,
      due: st && (st.state === "overdue" || st.state === "due_soon") ? st.label : null,
    };
  });

  const fromClient = list.find((c) => c.id === cliente) ?? null;
  return (
    <div className="flex flex-col gap-5">
      {fromClient ? (
        <Link href={`/staff/clienti/${fromClient.id}/pagamenti`} className="flex min-h-10 items-center gap-1.5 self-start text-sm font-semibold text-muted hover:text-ink">
          <IconArrowLeft size={16} /> Pagamenti di {fromClient.fullName}
        </Link>
      ) : (
        <Link href="/staff/pagamenti" className="flex min-h-10 items-center gap-1.5 self-start text-sm font-semibold text-muted hover:text-ink">
          <IconArrowLeft size={16} /> Pagamenti
        </Link>
      )}
      <PageTitle title="Nuovo pagamento">
        <p className="max-w-2xl text-[15px] text-muted">Scegli chi paga e cosa: l&apos;app propone importo e periodo, tu controlli e salvi.</p>
      </PageTitle>
      <NewPayment clients={list} today={today} initialClient={list.some((c) => c.id === cliente) ? cliente! : null} initialType={tipo === "lezioni" ? "lessons" : tipo === "altro" ? "other" : tipo === "coaching" ? "plan" : null} initialSessions={/^\d{1,3}$/.test(sessioni ?? "") ? Number(sessioni) : null} />
    </div>
  );
}
