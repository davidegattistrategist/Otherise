import Link from "next/link";
import { getBillingOverview } from "@/lib/data/shared";
import type { Metadata } from "next";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import { bySurname, listName } from "@/lib/names";
import { nextPaymentProposal, type PlanKind } from "@/lib/billing";
import { getCredits } from "@/lib/data/billing";
import { PageTitle } from "@/components/ui";
import { IconArrowLeft } from "@/components/icons";
import { NewPayment, type PayClient } from "./new-payment";

export const metadata: Metadata = { title: "Nuovo pagamento" };

export default async function NewPaymentPage({ searchParams }: { searchParams: Promise<{ cliente?: string; tipo?: string }> }) {
  await requireOwner();
  const { cliente, tipo } = await searchParams;
  const supabase = await createClient();
  const [{ data: clients }, { data: plans }, { data: billing }, { data: lastPays }] = await Promise.all([
    supabase.from("clients").select("id, first_name, last_name, status, start_date, pt_session_price").neq("status", "archived").eq("free", false),
    supabase.from("payment_plans").select("id, client_id, kind, amount, method, start_date, package_sessions").eq("active", true),
    getBillingOverview().then((data) => ({ data })),
    supabase.from("payments").select("client_id, method, paid_on").order("paid_on", { ascending: false }).limit(500),
  ]);
  const credits = await getCredits(supabase);
  const planBy = new Map((plans ?? []).map((p) => [p.client_id, p]));
  const paidUntilBy = new Map((billing ?? []).map((b) => [b.client_id, b.paid_until as string | null]));
  const lastMethod = new Map<string, string>();
  for (const p of lastPays ?? []) if (!lastMethod.has(p.client_id)) lastMethod.set(p.client_id, p.method);

  const list: PayClient[] = [...(clients ?? [])].sort(bySurname).map((c) => {
    const plan = planBy.get(c.id);
    const paidUntil = paidUntilBy.get(c.id) ?? null;
    const credit = credits.get(c.id) ?? 0;
    const proposal = plan ? nextPaymentProposal({ ...plan, kind: plan.kind as PlanKind }, paidUntil, credit) : null;
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
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <Link href="/staff/pagamenti" className="flex min-h-10 items-center gap-1.5 self-start text-sm font-semibold text-muted hover:text-ink">
        <IconArrowLeft size={16} /> Pagamenti
      </Link>
      <PageTitle title="Nuovo pagamento">
        <p className="max-w-2xl text-[15px] text-muted">Scegli chi paga e cosa: l&apos;app propone importo e periodo, tu controlli e salvi.</p>
      </PageTitle>
      <NewPayment clients={list} today={todayISO()} initialClient={list.some((c) => c.id === cliente) ? cliente! : null} initialType={tipo === "lezioni" ? "lessons" : null} />
    </div>
  );
}
