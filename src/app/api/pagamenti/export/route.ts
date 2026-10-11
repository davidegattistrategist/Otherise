/**
 * Esporta i pagamenti di un anno in CSV (si apre con Excel o Numbers),
 * per il commercialista. Solo il titolare.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { METHOD_LABELS, PLAN_LABELS, type PaymentMethod, type PlanKind } from "@/lib/billing";

export const dynamic = "force-dynamic";

const cell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const it = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");
const euro = (n: number | string) => Number(n).toFixed(2).replace(".", ",");

export async function GET(req: NextRequest) {
  const me = await getMe();
  if (!me || me.role !== "owner") return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  const year = /^\d{4}$/.test(req.nextUrl.searchParams.get("anno") ?? "") ? req.nextUrl.searchParams.get("anno")! : new Date().getFullYear().toString();
  const supabase = await createClient();
  const { data } = await supabase
    .from("payments")
    .select("paid_on, amount, method, period_start, period_end, sessions, notes, clients!inner(first_name, last_name, email, free), payment_plans(kind)")
    .eq("clients.free", false)
    .gte("paid_on", `${year}-01-01`)
    .lte("paid_on", `${year}-12-31`)
    .order("paid_on");
  const header = ["Data", "Cliente", "Email", "Piano", "Importo (EUR)", "Metodo", "Periodo dal", "Periodo al", "Sessioni", "Note"];
  const lines = (data ?? []).map((p) => {
    const c = p.clients as unknown as { first_name: string; last_name: string; email: string | null } | null;
    const plan = p.payment_plans as unknown as { kind: PlanKind } | null;
    return [it(p.paid_on), c ? `${c.first_name} ${c.last_name}`.trim() : "", c?.email ?? "", plan ? PLAN_LABELS[plan.kind] : "", euro(p.amount), METHOD_LABELS[p.method as PaymentMethod] ?? p.method, it(p.period_start), it(p.period_end), p.sessions ?? "", p.notes]
      .map(cell)
      .join(";");
  });
  const total = (data ?? []).reduce((t, p) => t + Number(p.amount), 0);
  const csv = "﻿" + [header.join(";"), ...lines, "", `Totale;;;;${euro(total)}`].join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="pagamenti-${year}.csv"`,
      "cache-control": "no-store",
    },
  });
}
