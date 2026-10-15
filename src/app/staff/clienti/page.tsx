import { FilterSearch } from "@/components/filter-search";
import Link from "next/link";
import { checkDue } from "@/lib/check-due";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getClientsOverview } from "@/lib/data/staff";
import { formatShort, todayISO } from "@/lib/dates";
import { Dot, EmptyState, LinkButton, PageTitle, cx } from "@/components/ui";

export const metadata: Metadata = { title: "Clienti" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; archivio?: string }> }) {
  const me = await requireStaff();
  const { q = "", archivio } = await searchParams;
  const supabase = await createClient();
  const all = await getClientsOverview(supabase, me, { includeArchived: archivio === "1" });
  // la ricerca filtra nel browser (FilterSearch): qui arrivano tutti
  const clients = all.filter((c) => (archivio === "1" ? c.status === "archived" : c.status !== "archived"));
  const today = todayISO();
  // i clienti in pausa stanno in una sezione a parte, sotto gli attivi
  const active = archivio === "1" ? clients : clients.filter((c) => c.status !== "paused");
  const paused = archivio === "1" ? [] : clients.filter((c) => c.status === "paused");
  const year = Number(today.slice(0, 4));

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={archivio === "1" ? "Ex clienti" : "Clienti"} actions={<LinkButton href="/staff/clienti/nuovo">Nuovo cliente</LinkButton>} />
      <form className="flex flex-wrap items-center gap-3" role="search">
        <FilterSearch target="elenco-clienti" defaultValue={q} placeholder="Cerca per nome o email" label="Cerca cliente" />
        {archivio === "1" ? <input type="hidden" name="archivio" value="1" /> : null}
        <Link href={archivio === "1" ? "/staff/clienti" : "/staff/clienti?archivio=1"} className="text-sm font-semibold underline-offset-4 hover:underline">
          {archivio === "1" ? "Clienti attivi" : "Ex clienti"}
        </Link>
      </form>

      {clients.length === 0 ? (
        archivio === "1" ? (
          <EmptyState title="Nessun ex cliente">
            Qui finiscono i clienti con il percorso terminato (dalla loro scheda, Dati → Percorso).
          </EmptyState>
        ) : (
          <EmptyState title="Ancora nessun cliente" action={<LinkButton href="/staff/clienti/nuovo">Aggiungi il primo</LinkButton>}>
            Crea un cliente, poi invialo con un clic: riceverà un&apos;email per entrare.
          </EmptyState>
        )
      ) : (
        <div id="elenco-clienti" className="flex flex-col gap-6">
          <p data-search-empty hidden className="text-[15px] text-muted">Nessun cliente con questo nome: prova con un&apos;altra parola.</p>
          {active.length ? <div data-search-group><ClientList clients={active} me={me} year={year} today={today} /></div> : <p className="text-[15px] text-muted">Nessun cliente attivo.</p>}
          {paused.length ? (
            <section className="flex flex-col gap-3" aria-label="Clienti in pausa" data-search-group>
              <h2 className="text-[13px] font-bold tracking-wider text-muted uppercase">In pausa · {paused.length}</h2>
              <ClientList clients={paused} me={me} year={year} today={today} />
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

type Row = Awaited<ReturnType<typeof getClientsOverview>>[number];

/** Testo su cui cerca la casella: nome nei due ordini ed email. */
const searchText = (c: Row) => `${c.first_name} ${c.last_name} ${c.last_name} ${c.first_name} ${c.email ?? ""}`.toLowerCase();

/** I segnali di Oggi accanto al nome: l'elenco diventa una seconda pagina "Oggi". */
function signals(c: Row, today: string, owner: boolean): Array<{ text: string; tone: "accent" | "deep" }> {
  const out: Array<{ text: string; tone: "accent" | "deep" }> = [];
  if (owner && c.billing?.state === "overdue") out.push({ text: c.billing.label.toLowerCase().startsWith("scadut") ? "Scaduto" : "Da saldare", tone: "accent" });
  else if (owner && c.billing?.state === "due_soon") out.push({ text: "In scadenza", tone: "deep" });
  if (c.status === "active" && c.user_id && c.compliance && (c.compliance.daysSinceLast === null || c.compliance.daysSinceLast >= 7) && (c.compliance.expected ?? 0) > 0) out.push({ text: "Da sentire", tone: "accent" });
  if (c.status === "active" && checkDue(c, today)) out.push({ text: "Check da fare", tone: "deep" });
  return out;
}

function Signals({ c, today, owner }: { c: Row; today: string; owner: boolean }) {
  const list = signals(c, today, owner);
  if (!list.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {list.map((x) => (
        <span key={x.text} className={cx("rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap", x.tone === "accent" ? "bg-accent text-white" : "bg-accent-soft text-ink")}>{x.text}</span>
      ))}
    </span>
  );
}

function ClientList({ clients, me, year, today }: { clients: Row[]; me: { role: string }; year: number; today: string }) {
  const owner = me.role === "owner";
  return (
    <>
        {/* telefono: elenco compatto */}
        <ul className="flex flex-col overflow-hidden rounded-[24px] bg-card md:hidden">
          {clients.map((c) => (
            <li key={c.id} className="border-t border-sand-deep first:border-t-0" data-search={searchText(c)}>
              <Link href={`/staff/clienti/${c.id}`} className="flex flex-col gap-1 px-4 py-3 active:bg-white">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{c.fullName}</span>
                  <Signals c={c} today={today} owner={owner} />
                </span>
                <span className="text-sm text-muted">
                  {c.program ? (c.program.state === "running" ? `${c.program.title} · sett. ${c.program.week}/${c.program.weeks}` : c.program.state === "finished" ? "Programma finito" : "Programma in partenza") : c.draftCount ? "Bozza da pubblicare" : "Nessun programma"}
                  {c.compliance?.pct !== null && c.compliance?.pct !== undefined ? ` · costanza ${c.compliance.pct}%` : ""}
                  {c.status === "paused" ? " · in pausa" : ""}
                  {!c.user_id ? " · da invitare" : ""}
                  {c.free && me.role === "owner" ? " · gratis" : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="scroll-x hidden rounded-[24px] bg-card md:block">
          <table className="w-full min-w-[720px] border-collapse text-[15px]">
            <thead>
              <tr className="text-left text-xs tracking-wide text-muted uppercase">
                <th scope="col" className="px-5 pt-4 pb-2 font-semibold">Cliente</th>
                <th scope="col" className="px-3 pt-4 pb-2 font-semibold">Programma</th>
                <th scope="col" className="px-3 pt-4 pb-2 font-semibold">Allenamenti</th>
                <th scope="col" className="px-3 pt-4 pb-2 font-semibold">Ultimo check</th>
                {me.role === "owner" ? <th scope="col" className="px-5 pt-4 pb-2 font-semibold">Pagamenti</th> : null}
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-t border-sand-deep" data-search={searchText(c)}>
                  <td className="px-5 py-3">
                    <span className="flex flex-wrap items-center gap-2">
                      <Link href={`/staff/clienti/${c.id}`} className="font-semibold hover:underline">{c.fullName}</Link>
                      <Signals c={c} today={today} owner={owner} />
                    </span>
                    <div className="text-xs text-muted">
                      {c.status === "paused" ? "In pausa · " : ""}
                      {c.user_id ? "Account attivo" : "Da invitare"}
                      {c.coachName && me.role === "owner" ? ` · ${c.coachName}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {c.program ? (
                      <>
                        <div>{c.program.title}</div>
                        <div className="text-xs text-muted">
                          {c.program.state === "finished" ? "Finito" : c.program.state === "not_started" ? `Inizia` : `Settimana ${c.program.week} di ${c.program.weeks}`}
                        </div>
                      </>
                    ) : (
                      <span className="text-muted">{c.draftCount ? "Bozza da pubblicare" : "—"}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-muted">
                    <div>{c.lastLog ? `Ultimo ${formatShort(c.lastLog, year)}` : "—"}</div>
                    {c.compliance?.pct !== null && c.compliance?.pct !== undefined ? (
                      <div className={cx("text-xs", c.compliance.pct < 50 && "font-semibold text-accent-deep")}>Costanza {c.compliance.pct}% · 2 sett.</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-muted">{c.lastCheck ? formatShort(c.lastCheck, year) : "—"}</td>
                  {me.role === "owner" ? (
                    <td className="px-5 py-3">
                      {c.billing && c.billing.state !== "none" ? (
                        <span className={cx("inline-flex items-center gap-2 text-sm", c.billing.state === "overdue" && "font-semibold")}>
                          <Dot tone={c.billing.state === "ok" ? "ink" : c.billing.state === "overdue" ? "deep" : "accent"} />
                          {c.billing.label}
                        </span>
                      ) : (
                        <span className="text-sm text-muted">{c.status === "paused" ? "In pausa" : c.free ? "Gratis" : "Nessun piano"}</span>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
    </>
  );
}
