import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildTodayList, getClientsOverview, type TodayItem } from "@/lib/data/staff";
import { formatHeading, todayISO } from "@/lib/dates";
import { Card, Dot, Eyebrow, LinkButton, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Oggi" };

function List({ items, empty }: { items: TodayItem[]; empty: string }) {
  if (items.length === 0) return <p className="text-[15px] text-muted">{empty}</p>;
  return (
    <ul className="flex flex-col">
      {items.map((it, i) => (
        <li key={it.clientId + i} className="border-t border-sand-deep first:border-t-0">
          <Link href={it.href} className="flex min-h-12 items-center gap-3 py-2.5 hover:opacity-70">
            <Dot tone={it.tone === "accent" ? "accent" : "ink"} />
            <span className="font-semibold">{it.clientName}</span>
            <span className="ml-auto text-right text-sm text-muted">{it.text}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function StaffToday() {
  const me = await requireStaff();
  const supabase = await createClient();
  const today = todayISO();
  const [clients, { data: checkins }] = await Promise.all([
    getClientsOverview(supabase, me),
    supabase
      .from("checkins")
      .select("id, client_id, week_start, flag_reasons, request, clients(first_name, last_name)")
      .eq("flagged", true)
      .is("reviewed_at", null)
      .order("submitted_at", { ascending: false })
      .limit(20),
  ]);
  const { payments, programs, checks } = buildTodayList(clients, today);
  const active = clients.filter((c) => c.status === "active").length;

  return (
    <div className="flex flex-col gap-6">
      <PageTitle eyebrow={formatHeading(today)} title={`Ciao, ${me.fullName.split(" ")[0] || "coach"}`} actions={<LinkButton href="/staff/clienti/nuovo">Nuovo cliente</LinkButton>}>
        <p className="text-[15px] text-muted">{active} clienti attivi</p>
      </PageTitle>

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        <Card>
          <div className="mb-3 flex items-center gap-2"><Dot tone="accent" /><Eyebrow>Check-up da guardare</Eyebrow></div>
          {checkins && checkins.length > 0 ? (
            <ul className="flex flex-col">
              {checkins.map((c) => {
                const cl = c.clients as unknown as { first_name: string; last_name: string } | null;
                return (
                  <li key={c.id} className="border-t border-sand-deep first:border-t-0">
                    <Link href={`/staff/clienti/${c.client_id}/checkup`} className="flex min-h-12 flex-col justify-center py-2.5 hover:opacity-70">
                      <span className="font-semibold">{cl ? `${cl.first_name} ${cl.last_name}` : "Cliente"}</span>
                      <span className="text-sm text-muted">{c.flag_reasons.join(", ")}{c.request ? ` · “${c.request.slice(0, 80)}”` : ""}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[15px] text-muted">Nessun check-up con problemi. Gli altri restano nella scheda dei clienti.</p>
          )}
        </Card>

        <Card>
          <div className="mb-3"><Eyebrow>Programmi</Eyebrow></div>
          <List items={programs} empty="Tutti i clienti hanno un programma in corso." />
        </Card>

        {me.role === "owner" ? (
          <Card>
            <div className="mb-3"><Eyebrow>Pagamenti</Eyebrow></div>
            <List items={payments} empty="Nessuna scadenza nei prossimi giorni." />
          </Card>
        ) : null}

        <Card>
          <div className="mb-3"><Eyebrow>Check da fare</Eyebrow></div>
          <List items={checks} empty="Tutti i clienti hanno un check nelle ultime 5 settimane." />
        </Card>
      </div>
    </div>
  );
}
