import { DailyQuote } from "@/components/daily-quote";
import { getBusinessName } from "@/lib/data/shared";
import { dedicationOfDay, quoteOfDay } from "@/lib/quotes";
import Link from "next/link";
import { listName } from "@/lib/names";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildTodayList, getClientsOverview, type TodayItem } from "@/lib/data/staff";
import { rpcOr } from "@/lib/data/rpc";
import { startCheckMode } from "@/app/check/actions";
import { ageOn, formatHeading, formatShort, isBirthday, todayISO } from "@/lib/dates";
import { Card, Dot, Eyebrow, LinkButton, Notice, PageTitle, cx } from "@/components/ui";
import { getBillingLines } from "@/lib/data/billing";
import { myOpenJobs } from "@/lib/ai/program-jobs";
import { QuickPay } from "@/components/quick-pay";
import { markDiscomfortSeen, markNoteSeen, snoozeChatSilence } from "./today-actions";
import { CHAT_SNOOZE_DAYS, chatSilence, romeDay } from "@/lib/chat-silence";
import { FirstSteps } from "./first-steps";
import { ClearParams } from "@/components/clear-param";
import { PushPrompt } from "@/components/push";

export const metadata: Metadata = { title: "Oggi" };

const actionClass = "flex min-h-9 shrink-0 items-center rounded-full px-3 text-sm font-semibold ring-1 ring-sand-deep hover:bg-sand";

/** Righe di Oggi: chi e cosa, e accanto il pulsante per farlo subito. */
function List({ items, empty }: { items: TodayItem[]; empty: string }) {
  if (items.length === 0) return <p className="text-[15px] text-muted">{empty}</p>;
  return (
    <ul className="flex flex-col">
      {items.map((it, i) => (
        <li key={it.clientId + i} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-sand-deep py-2.5 first:border-t-0">
          <Link href={it.href} className="flex min-w-0 items-center gap-3 hover:opacity-70">
            <Dot tone={it.tone === "accent" ? "accent" : "ink"} />
            <span className="min-w-0">
              <span className="block font-semibold">{it.clientName}</span>
              <span className="block text-sm text-muted">{it.text}</span>
            </span>
          </Link>
          {it.action === "check" ? (
            <form action={startCheckMode.bind(null, it.clientId, null)} className="ml-auto">
              <button type="submit" className={actionClass}>Inizia il check</button>
            </form>
          ) : it.action ? (
            <Link href={it.action.href} className={cx(actionClass, "ml-auto")}>{it.action.label}</Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Titolo della card con quante cose ci sono dentro ("Allenamenti · 3"). */
function CardTitle({ title, count, tone }: { title: string; count?: number; tone?: "accent" | "deep" }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {tone ? <Dot tone={tone} /> : null}
      <Eyebrow>{title}{count ? ` · ${count}` : ""}</Eyebrow>
    </div>
  );
}

export default async function StaffToday({ searchParams }: { searchParams: Promise<{ "solo-titolare"?: string }> }) {
  const sp = await searchParams;
  const me = await requireStaff();
  const supabase = await createClient();
  const today = todayISO();
  // tutto in parallelo: ogni attesa in fila allunga l'apertura di Oggi
  const [clients, { data: checkins }, { data: pains }, { data: brand }, { data: clientNotes }, { data: lastMessages }, { data: snoozes }, jobs, billingAll] = await Promise.all([
    getClientsOverview(supabase, me),
    supabase
      .from("checkins")
      .select("id, client_id, week_start, flag_reasons, request, clients(first_name, last_name)")
      .eq("flagged", true)
      .is("reviewed_at", null)
      .order("submitted_at", { ascending: false })
      .limit(20),
    supabase
      .from("workout_logs")
      .select("id, client_id, week, performed_on, discomfort, clients(first_name, last_name)")
      .neq("discomfort", "")
      .is("discomfort_seen_at", null)
      .order("updated_at", { ascending: false })
      .limit(20),
    getBusinessName().then((data) => ({ data })),
    // note finali dei clienti che l'AI ha giudicato da leggere
    supabase
      .from("workout_logs")
      .select("id, client_id, week, performed_on, notes, note_reason, clients(first_name, last_name)")
      .eq("note_flag", true)
      .is("note_seen_at", null)
      .order("updated_at", { ascending: false })
      .limit(20),
    // ultimo messaggio di ogni chat (per "Non lo senti da un po'"), calcolato dal database
    rpcOr<Array<{ client_id: string; created_at: string }>>(supabase.rpc("last_messages", { include_deleted: false }), async () =>
      (await supabase.from("messages").select("client_id, created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(1000)).data ?? [],
    ).then((data) => ({ data })),
    supabase.from("chat_snoozes").select("client_id, until"),
    // bozze AI in coda: in Programmi si vede a che punto sono (e si va dritti all'editor)
    myOpenJobs(supabase, me.id).catch(() => []),
    me.role === "owner" ? getBillingLines(supabase) : Promise.resolve(null),
  ]);
  const { programs: todayPrograms, checks, training } = buildTodayList(clients, today);
  const jobByClient = new Map(jobs.map((j) => [j.clientId, j]));
  const programs: TodayItem[] = todayPrograms.map((p) => {
    const j = jobByClient.get(p.clientId);
    if (!j) return p;
    const href = `/staff/programmi/${j.programId}?ai=1`;
    if (j.status === "working") return { ...p, text: "Bozza AI in preparazione", tone: "ink", href, action: { label: "Apri", href } };
    if (j.status === "questions") return { ...p, text: "L'AI ha qualche domanda sulla bozza", tone: "accent", href, action: { label: "Rispondi", href } };
    if (j.status === "ready") return { ...p, text: "Bozza AI pronta da rivedere", tone: "accent", href, action: { label: "Rivedi", href } };
    return { ...p, text: "Bozza AI non riuscita: riprova", tone: "accent", href, action: { label: "Riprova", href } };
  });
  const billing = billingAll ? billingAll.lines.filter((l) => !l.paused && (l.status.state === "overdue" || l.status.state === "due_soon")) : [];
  const active = clients.filter((c) => c.status === "active").length;
  const birthdays = clients.filter((c) => c.status === "active" && isBirthday(c.birth_date, today));
  const noBirth = clients.filter((c) => c.status === "active" && !c.birth_date);
  const lastMsgDay = new Map<string, string>();
  for (const m of lastMessages ?? []) if (!lastMsgDay.has(m.client_id)) lastMsgDay.set(m.client_id, romeDay(m.created_at));
  const snoozedBy = new Map((snoozes ?? []).map((z) => [z.client_id, z.until]));
  const silent = clients
    .filter((c) => c.status === "active" && c.user_id)
    .map((c) => ({ c, s: chatSilence(lastMsgDay.get(c.id) ?? null, today, snoozedBy.get(c.id) ?? null) }))
    .filter((x): x is { c: (typeof clients)[number]; s: NonNullable<typeof x.s> } => x.s !== null)
    .sort((a, b) => b.s.days - a.s.days);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle eyebrow={formatHeading(today)} title={`Ciao, ${me.fullName.split(" ")[0] || "coach"}`} actions={<LinkButton href="/staff/clienti/nuovo">Nuovo cliente</LinkButton>}>
        <p className="text-[15px] text-muted">{active === 1 ? "1 cliente attivo" : `${active} clienti attivi`}</p>
      </PageTitle>

      {sp["solo-titolare"] ? <><ClearParams names={["solo-titolare"]} /><Notice>Quella pagina la vede solo il titolare: pagamenti, impostazioni e collaboratori sono gestiti da lui.</Notice></> : null}
      <FirstSteps supabase={supabase} me={me} />
      <PushPrompt text="Ti avviso quando un cliente ti scrive, segnala un dolore o compila il diario." />

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
        <Card>
          <CardTitle title="Diari da guardare" count={checkins?.length} tone="accent" />
          {checkins && checkins.length > 0 ? (
            <ul className="flex flex-col">
              {checkins.map((c) => {
                const cl = c.clients as unknown as { first_name: string; last_name: string } | null;
                return (
                  <li key={c.id} className="border-t border-sand-deep first:border-t-0">
                    <Link href={`/staff/clienti/${c.client_id}/diario`} className="flex min-h-12 flex-col justify-center py-2.5 hover:opacity-70">
                      <span className="font-semibold">{cl ? listName(cl) : "Cliente"}</span>
                      <span className="text-sm text-muted">{c.flag_reasons.join(", ")}{c.request ? ` · “${c.request.slice(0, 80)}”` : ""}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[15px] text-muted">Nessun diario con problemi. Gli altri restano nella scheda dei clienti.</p>
          )}
        </Card>

        {birthdays.length > 0 ? (
          <Card>
            <CardTitle title="Compleanni di oggi" tone="accent" />
            <ul className="flex flex-col">
              {birthdays.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-sand-deep py-2.5 first:border-t-0">
                  <Link href={`/staff/clienti/${c.id}`} className="min-w-0 hover:opacity-70">
                    <span className="block font-semibold">{c.fullName}</span>
                    <span className="block text-sm text-muted">Compie {ageOn(c.birth_date, today)} anni</span>
                  </Link>
                  <Link href={`/staff/messaggi/${c.id}?promemoria=compleanno`} className="min-h-9 rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ring-sand-deep hover:bg-sand">Fagli gli auguri in chat</Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {pains && pains.length > 0 ? (
          <Card>
            <CardTitle title="Dolori e fastidi" count={pains.length} tone="accent" />
            <ul className="flex flex-col">
              {pains.map((p) => {
                const cl = p.clients as unknown as { first_name: string; last_name: string } | null;
                return (
                  <li key={p.id} className="flex items-start gap-3 border-t border-sand-deep py-2.5 first:border-t-0">
                    <Link href={`/staff/clienti/${p.client_id}`} className="min-w-0 flex-1 hover:opacity-70">
                      <span className="block font-semibold">{cl ? listName(cl) : "Cliente"}</span>
                      <span className="block text-sm text-muted">{formatShort(p.performed_on)} · settimana {p.week} · “{p.discomfort.slice(0, 140)}”</span>
                    </Link>
                    <form action={markDiscomfortSeen.bind(null, p.id)}>
                      <button type="submit" className="min-h-9 rounded-full px-3 text-sm font-semibold ring-1 ring-sand-deep hover:bg-sand">Visto</button>
                    </form>
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : null}

        {clientNotes && clientNotes.length > 0 ? (
          <Card>
            <CardTitle title="Note dei clienti da leggere" count={clientNotes.length} tone="deep" />
            <ul className="flex flex-col">
              {clientNotes.map((n) => {
                const cl = n.clients as unknown as { first_name: string; last_name: string } | null;
                return (
                  <li key={n.id} className="flex items-start gap-3 border-t border-sand-deep py-2.5 first:border-t-0">
                    <Link href={`/staff/clienti/${n.client_id}/note?vista=cliente`} className="min-w-0 flex-1 hover:opacity-70">
                      <span className="block font-semibold">{cl ? listName(cl) : "Cliente"}{n.note_reason ? <span className="font-normal text-ink-soft"> · {n.note_reason}</span> : null}</span>
                      <span className="block text-sm text-muted">{formatShort(n.performed_on)} · settimana {n.week} · “{n.notes.slice(0, 160)}{n.notes.length > 160 ? "…" : ""}”</span>
                    </Link>
                    <form action={markNoteSeen.bind(null, n.id)}>
                      <button type="submit" className="min-h-9 rounded-full px-3 text-sm font-semibold ring-1 ring-sand-deep hover:bg-sand">Letta</button>
                    </form>
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : null}

        {silent.length > 0 ? (
          <Card>
            <CardTitle title="Da sentire in chat" count={silent.length} tone="deep" />
            <ul className="flex flex-col">
              {silent.map(({ c, s }) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-sand-deep py-2.5 first:border-t-0">
                  <Link href={`/staff/clienti/${c.id}`} className="min-w-0 hover:opacity-70">
                    <span className="block font-semibold">{c.fullName}</span>
                    <span className="block text-sm text-muted">Nessun messaggio da {s.days} giorni</span>
                  </Link>
                  <span className="ml-auto flex shrink-0 items-center gap-2">
                    <form action={snoozeChatSilence.bind(null, c.id)}>
                      <button type="submit" className="min-h-9 rounded-full px-3 text-sm font-semibold ring-1 ring-sand-deep hover:bg-sand" aria-label={`Rimanda di ${CHAT_SNOOZE_DAYS} giorni: ${c.fullName}`}>Rimanda {CHAT_SNOOZE_DAYS} giorni</button>
                    </form>
                    <Link href={`/staff/messaggi/${c.id}?promemoria=saluto`} className="flex min-h-9 items-center rounded-full bg-ink px-3 text-sm font-semibold text-card hover:opacity-90">Scrivi</Link>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card id="programmi" className="scroll-mt-6">
          <CardTitle title="Programmi" count={programs.length} />
          <List items={programs} empty="Nessun programma da preparare: qui compaiono le bozze e i programmi che finiscono entro 7 giorni." />
        </Card>

        {me.role === "owner" ? (
          <Card>
            <CardTitle title="Pagamenti" count={billing.length} />
            {billing.length === 0 ? (
              <p className="text-[15px] text-muted">Nessuna scadenza nei prossimi giorni.</p>
            ) : (
              <ul className="flex flex-col">
                {billing.map((l) => (
                  <li key={l.clientId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-sand-deep py-2.5 first:border-t-0">
                    <Link href={`/staff/clienti/${l.clientId}/pagamenti`} className="flex min-w-0 items-center gap-3 hover:opacity-70">
                      <Dot tone={l.status.state === "overdue" ? "accent" : "ink"} />
                      <span className="min-w-0">
                        <span className="block font-semibold">{l.name}</span>
                        <span className="block text-sm text-muted">{l.status.label}</span>
                      </span>
                    </Link>
                    <QuickPay clientId={l.clientId} name={l.name} proposal={l.proposal} reminder={l.reminder} compact />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}

        <Card>
          <CardTitle title="Allenamenti" count={training.length} />
          <List items={training} empty="Tutti i clienti con un programma in corso si stanno allenando." />
        </Card>

        <Card>
          <CardTitle title="Check da fare" count={checks.length} />
          <List items={checks} empty="Nessun check in scadenza. Qui compare chi fa i check con l'app, nell'ultima settimana della fase." />
        </Card>

        {noBirth.length > 0 ? (
          <Card>
            <div className="mb-1"><Eyebrow>Da fare: chiedi la data di nascita</Eyebrow></div>
            <p className="mb-2 text-sm text-muted">Serve per la massa grassa e per ricordarti il compleanno. Aggiungila nella scheda.</p>
            <List items={noBirth.map((c) => ({ clientId: c.id, clientName: c.fullName, text: "Dati", href: `/staff/clienti/${c.id}/profilo`, tone: "ink" as const }))} empty="" />
          </Card>
        ) : null}
      </div>

      {/* la stessa frase che vedono oggi i clienti nella loro home (con la dedica al posto del nome) */}
      <DailyQuote quote={quoteOfDay(today)} dedication={dedicationOfDay(today, "[nome]")} today={today} dateLabel={formatHeading(today)} brand={brand ?? "Otherise"} label="La frase di oggi dei tuoi clienti" autoOpen={false} />
    </div>
  );
}
