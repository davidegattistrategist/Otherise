import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { getStaffClient } from "@/lib/data/client";
import { createClient } from "@/lib/supabase/server";
import { ageOn, todayISO } from "@/lib/dates";
import { Tabs } from "@/components/tabs";
import { LinkButton, Pill } from "@/components/ui";

export default async function ClientLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireStaff();
  const client = await getStaffClient(id);
  const supabase = await createClient();
  const { count: flagged } = await supabase
    .from("checkins")
    .select("id", { count: "exact", head: true })
    .eq("client_id", id)
    .eq("flagged", true)
    .is("reviewed_at", null);
  const base = `/staff/clienti/${id}`;
  const age = ageOn(client.birth_date, todayISO());
  const tabs = [
    { href: base, label: "Panoramica", exact: true },
    { href: `${base}/programma`, label: "Programma" },
    { href: `${base}/progetto`, label: "Progetto" },
    { href: `${base}/sessioni`, label: "Sessioni PT" },
    { href: `${base}/check`, label: "Check" },
    { href: `${base}/posturale`, label: "Posturale" },
    ...(me.role === "owner" ? [{ href: `${base}/pagamenti`, label: "Pagamenti" }] : []),
    { href: `${base}/checkup`, label: "Check-up", dot: (flagged ?? 0) > 0 },
    { href: `${base}/profilo`, label: "Scheda" },
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[13px] text-muted">
            <Link href="/staff/clienti" className="-my-2 inline-block py-2 pr-1 hover:underline">Clienti</Link> / scheda
          </div>
          <h1 className="mt-1.5 mb-3 text-[36px] leading-tight font-normal tracking-tight sm:text-[44px]">
            {client.first_name} {client.last_name}
          </h1>
          <div className="flex flex-wrap gap-2">
            {client.sex || age !== null ? <Pill>{[client.sex === "F" ? "Donna" : client.sex === "M" ? "Uomo" : "", age !== null ? `${age} anni` : ""].filter(Boolean).join(" · ")}</Pill> : null}
            {client.status !== "active" ? <Pill>{client.status === "paused" ? "In pausa" : "Percorso terminato"}</Pill> : null}
            {!client.user_id ? <Pill>Da invitare</Pill> : null}
            {client.free ? <Pill>Gratis</Pill> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <LinkButton href={`/staff/messaggi/${id}`} variant="secondary">Chat</LinkButton>
          <LinkButton href={`${base}/sessioni#nuova`} variant="secondary">Nota sessione PT</LinkButton>
          <LinkButton href={`${base}/check/nuovo`}>Nuovo check</LinkButton>
        </div>
      </div>
      <Tabs items={tabs} />
      {children}
    </div>
  );
}
