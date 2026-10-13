"use client";

/**
 * Nuovo pagamento in tre passi: chi paga → cosa paga → controlla e salva.
 * L'app propone importo, metodo e periodo dal piano del cliente; il riepilogo
 * in fondo dice in parole semplici cosa verrà registrato.
 */
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { registerPayment, type NewPaymentState } from "../actions";
import { CreditHint } from "@/components/credit-hint";
import { dueAmount, formatEuro, isPeriodic, usesCredit, METHOD_LABELS, METHODS, periodEnd, PLAN_DURATION, PLAN_LABELS, type PlanKind } from "@/lib/billing";
import { addDays, formatLong, formatShort, isISODate } from "@/lib/dates";
import { Card, Eyebrow, Field, Input, Select, buttonClass, cx } from "@/components/ui";
import { SubmitButton } from "@/components/form-bits";
import { IconCheck, IconPlus } from "@/components/icons";

export type PayClient = {
  id: string;
  /** "Cognome Nome" per l'elenco */
  name: string;
  /** "Nome Cognome" per le frasi */
  fullName: string;
  paused: boolean;
  plan: { kind: PlanKind; amount: number; method: string; packageSessions: number | null } | null;
  proposal: { amount: number; method: string; period_start: string | null; period_end: string | null; sessions: number | null } | null;
  paidUntil: string | null;
  /** inizio del percorso: allinea i periodi di chi non ha ancora pagamenti */
  startDate: string | null;
  ptPrice: number | null;
  method: string;
  /** Credito (positivo) o importo da recuperare (negativo) del piano (coaching, o lezioni per i pacchetti) */
  credit: number;
  /** Credito sulle lezioni PT (separato da quello del coaching) */
  lessonsCredit: number;
};

export type Type = "renew" | "plan" | "lessons" | "other";
const SUBSCRIPTIONS: PlanKind[] = ["monthly", "six_weeks", "quarterly", "semiannual", "annual"];
const OTHER_PRESETS = ["Valutazione posturale", "Consulenza", "Programma online", "Check corporeo"];

const euro = (s: string) => {
  const n = Number(s.trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const num = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

export function NewPayment({ clients, today, initialClient, initialType = null, initialSessions = null }: { clients: PayClient[]; today: string; initialClient: string | null; initialType?: Type | null; initialSessions?: number | null }) {
  const [round, setRound] = useState(0);
  return <Wizard key={round} clients={clients} today={today} initialClient={round === 0 ? initialClient : null} initialType={round === 0 ? initialType : null} initialSessions={round === 0 ? initialSessions : null} onAgain={() => setRound((r) => r + 1)} />;
}

/**
 * Da quando parte un coaching nuovo: dal giorno dopo l'ultimo periodo
 * saldato (se ha già pagato fino a dopo oggi, è il periodo successivo),
 * altrimenti dall'inizio del percorso. Se quel giorno è lontano, si va avanti
 * di periodo in periodo fino a quello che sta facendo adesso: il trimestre
 * non parte dal giorno del pagamento, ma dal suo ciclo.
 */
export function planStart(kind: PlanKind, c: { paidUntil: string | null; startDate: string | null }, today: string): string {
  let start = c.paidUntil ? addDays(c.paidUntil, 1) : c.startDate ?? today;
  if (start > today) return start;
  for (let i = 0; i < 400; i++) {
    const end = periodEnd(kind, start);
    if (!end || end >= today) return start;
    start = addDays(end, 1);
  }
  return today;
}

function defaultsFor(c: PayClient | null, type: Type | null, today: string, sessions: number | null = null) {
  const method = c?.method ?? "cash";
  if (!c || !type) return { amount: "", method, start: today, end: "", sessions: "" };
  if (type === "renew" && c.plan && c.proposal) {
    return { amount: num(c.proposal.amount), method: c.plan.method, start: c.proposal.period_start ?? today, end: c.proposal.period_end ?? "", sessions: num(c.proposal.sessions) };
  }
  if (type === "plan") {
    const start = planStart("quarterly", c, today);
    return { amount: "", method, start, end: periodEnd("quarterly", start) ?? "", sessions: "" };
  }
  if (type === "lessons") {
    const n = sessions && sessions > 0 ? sessions : 1;
    return { amount: c.ptPrice ? num(dueAmount(Math.round(n * c.ptPrice * 100) / 100, c.lessonsCredit)) : "", method, start: today, end: "", sessions: String(n) };
  }
  return { amount: "", method, start: today, end: "", sessions: "" };
}

function Wizard({ clients, today, initialClient, initialType, initialSessions, onAgain }: { clients: PayClient[]; today: string; initialClient: string | null; initialType: Type | null; initialSessions: number | null; onAgain: () => void }) {
  const [state, action] = useActionState<NewPaymentState, FormData>(registerPayment, null);
  const [clientId, setClientId] = useState<string | null>(initialClient);
  const [isNew, setIsNew] = useState(false);
  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");
  const [query, setQuery] = useState("");
  const client = clients.find((c) => c.id === clientId) ?? null;
  const [type, setType] = useState<Type | null>(client && initialType ? initialType : client?.plan ? "renew" : null);
  const d0 = defaultsFor(client, type, today, initialSessions);
  const [amount, setAmount] = useState(d0.amount);
  const [amountTouched, setAmountTouched] = useState(false);
  const [method, setMethod] = useState(d0.method);
  const [paidOn, setPaidOn] = useState(today);
  const [kind, setKind] = useState<PlanKind>("quarterly");
  const [start, setStart] = useState(d0.start);
  const [end, setEnd] = useState(d0.end);
  const [sessions, setSessions] = useState(d0.sessions);
  const [notes, setNotes] = useState("");
  const [reactivate, setReactivate] = useState(true);
  const [keep, setKeep] = useState(true);
  const [price, setPrice] = useState(client?.ptPrice ? num(client.ptPrice) : "");

  /** Cambia cliente o tipo: riparte dalle proposte dell'app */
  const reset = (c: PayClient | null, t: Type | null) => {
    const d = defaultsFor(c, t, today);
    setAmount(d.amount);
    setAmountTouched(false);
    setMethod(d.method);
    setStart(d.start);
    setEnd(d.end);
    setSessions(d.sessions);
    setKind("quarterly");
    setNotes("");
    setPrice(c?.ptPrice ? num(c.ptPrice) : "");
  };
  const pickClient = (c: PayClient | null) => {
    setClientId(c?.id ?? null);
    setIsNew(false);
    const t: Type | null = c?.plan ? "renew" : null;
    setType(t);
    reset(c, t);
  };
  const pickType = (t: Type) => {
    setType(t);
    reset(client, t);
  };

  const matches = useMemo(() => {
    const n = query.trim().toLowerCase();
    const list = n ? clients.filter((c) => c.name.toLowerCase().includes(n) || c.fullName.toLowerCase().includes(n)) : clients;
    return list.slice(0, 40);
  }, [clients, query]);

  const who = isNew ? `${newFirst} ${newLast}`.trim() : client?.fullName ?? "";
  const hasWho = isNew ? Boolean(newFirst.trim()) : Boolean(client);
  const renewKind = client?.plan?.kind ?? null;
  const periodic = (type === "renew" && renewKind && isPeriodic(renewKind)) || type === "plan";
  const needsSessions = (type === "renew" && renewKind === "package") || type === "lessons";
  const sessionsN = Number(sessions);
  const amountN = euro(amount);
  // credito: rinnovo del coaching o del pacchetto, oppure un pacchetto intero di lezioni sul piano a pacchetto
  // lezioni: con il prezzo a lezione l'importo segue il numero, tolto il credito sulle lezioni (finché non lo scrivi tu)
  const priceN = euro(price);
  const lessonsDue = (n: number, p: number | null) => {
    if (!Number.isInteger(n) || n <= 0) return null;
    if (p && p > 0) return Math.round(n * p * 100) / 100;
    if (client?.plan?.kind === "package" && n === client.plan.packageSessions) return client.plan.amount;
    return null;
  };
  const planCreditDue: number | null = !client?.plan
    ? null
    : type === "renew" && usesCredit(client.plan.kind) && client.proposal && (client.plan.kind !== "package" || sessionsN === client.plan.packageSessions)
      ? client.proposal.amount
      : null;
  // lezioni PT: quanto costano (prezzo a lezione o pacchetto) e quanto deve, tolto il credito sulle lezioni
  const lessonsFull = type === "lessons" ? lessonsDue(sessionsN, priceN) : null;
  const lessonsDueNow = lessonsFull !== null ? dueAmount(lessonsFull, client?.lessonsCredit ?? 0) : null;
  const creditDue = type === "lessons" ? lessonsDueNow : planCreditDue;
  // credito che conta qui: delle lezioni (lezioni e pacchetti) o del coaching
  const lessonsScope = type === "lessons" || client?.plan?.kind === "package";
  const creditNow = client ? (type === "lessons" ? client.lessonsCredit : client.credit) : 0;
  const fullPrice = type === "lessons" ? lessonsFull : client?.plan?.amount ?? null;
  const creditExtra = (() => {
    if (creditDue === null || fullPrice === null || amountN === null || Math.abs(amountN - creditDue) < 0.005) return "";
    const after = keep ? Math.round((creditNow + amountN - fullPrice) * 100) / 100 : 0;
    const next = lessonsScope ? "le prossime lezioni" : "il rinnovo dopo";
    return after > 0 ? ` Restano ${formatEuro(after)} di credito per ${next}.` : after < 0 ? ` ${formatEuro(-after)} si aggiungono ${lessonsScope ? "alle prossime lezioni" : "al rinnovo dopo"}.` : " Il pagamento è saldato così.";
  })();

  const setLessons = (v: string, p: number | null = priceN) => {
    setSessions(v);
    const due = lessonsDue(Number(v), p);
    if (type === "lessons" && !amountTouched && due !== null) setAmount(num(dueAmount(due, client?.lessonsCredit ?? 0)));
  };

  const summary = (() => {
    if (!hasWho || !type || !amountN) return null;
    const how: Record<string, string> = { cash: " in contanti", transfer: " con bonifico", paypal: " con PayPal", card: " con carta", other: "" };
    const pay = `${who} paga ${formatEuro(amountN)}${how[method] ?? ""} ${paidOn === today ? "oggi" : `il ${formatLong(paidOn)}`}`;
    if (periodic && isISODate(start) && isISODate(end)) {
      const what = type === "plan" ? `nuovo ${PLAN_LABELS[kind].toLowerCase()}` : `rinnovo ${PLAN_LABELS[renewKind!].toLowerCase()}`;
      return `${pay} per il ${what}: vale dal ${formatLong(start)} al ${formatLong(end)}.${creditExtra}`;
    }
    if (needsSessions && Number.isInteger(sessionsN) && sessionsN > 0) {
      return `${pay} per ${sessionsN} ${sessionsN === 1 ? "lezione" : "lezioni"} PT${type === "renew" ? " del pacchetto" : ""}${sessionsN > 1 ? ` (${formatEuro(Math.round((amountN / sessionsN) * 100) / 100)} a lezione)` : ""}.${creditExtra}`;
    }
    if (type === "renew" && renewKind === "single") return `${pay} per una sessione.`;
    if (type === "other" && notes.trim()) return `${pay} per: ${notes.trim()}.`;
    return null;
  })();

  if (state?.ok) {
    return (
      <Card className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-card"><IconCheck size={20} /></span>
          <div>
            <h2 className="text-[20px] font-semibold">Pagamento registrato</h2>
            <p className="mt-1 text-[15px] leading-relaxed">{state.message}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onAgain} className={buttonClass("primary")}>Registra un altro pagamento</button>
          {state.clientId ? <Link href={`/staff/clienti/${state.clientId}/pagamenti`} className={buttonClass("secondary")}>Apri la scheda pagamenti</Link> : null}
          <Link href="/staff/pagamenti" className={buttonClass("ghost")}>Torna a Pagamenti</Link>
        </div>
      </Card>
    );
  }

  const choice = (active: boolean) =>
    cx("flex min-h-14 flex-col items-start justify-center rounded-2xl px-4 py-2.5 text-left ring-1 transition-colors", active ? "bg-ink text-card ring-ink" : "bg-card ring-sand-deep hover:ring-ink-soft");
  const chip = (active: boolean) => cx("min-h-10 rounded-full px-3.5 text-sm font-semibold ring-1", active ? "bg-ink text-card ring-ink" : "bg-card ring-sand-deep");

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="client_id" value={isNew ? "new" : clientId ?? ""} />
      <input type="hidden" name="type" value={type ?? ""} />
      {type === "plan" ? <input type="hidden" name="kind" value={kind} /> : null}

      {/* 1. Chi paga */}
      <Card className="flex flex-col gap-3">
        <Eyebrow>1 · Chi paga</Eyebrow>
        {hasWho && !isNew && client ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[17px] font-semibold">{client.fullName}</div>
              <div className="text-sm text-muted">
                {client.plan ? `${PLAN_LABELS[client.plan.kind]} · ${formatEuro(client.plan.amount)}` : "Nessun piano"}
                {client.paidUntil && client.plan && isPeriodic(client.plan.kind) ? ` · a posto fino al ${formatShort(client.paidUntil)}` : ""}
                {client.paused ? " · in pausa" : ""}
              </div>
            </div>
            <button type="button" onClick={() => pickClient(null)} className="min-h-10 px-2 text-sm font-semibold underline">Cambia</button>
          </div>
        ) : isNew ? (
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome"><Input name="new_first_name" value={newFirst} onChange={(e) => setNewFirst(e.target.value)} autoComplete="off" autoFocus /></Field>
              <Field label="Cognome" hint="facoltativo"><Input name="new_last_name" value={newLast} onChange={(e) => setNewLast(e.target.value)} autoComplete="off" /></Field>
            </div>
            <p className="text-sm text-muted">Il cliente viene creato con il solo nome: il resto lo completi quando vuoi dalla sua scheda.</p>
            <button type="button" onClick={() => setIsNew(false)} className="min-h-10 self-start px-1 text-sm font-semibold underline">Scegli un cliente che c&apos;è già</button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label htmlFor="pay-search" className="sr-only">Cerca il cliente</label>
            <Input id="pay-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca per nome o cognome" autoComplete="off" />
            <ul className="flex max-h-72 flex-col overflow-y-auto rounded-2xl bg-sand/60" aria-label="Clienti">
              {matches.map((c) => (
                <li key={c.id} className="border-t border-sand-deep first:border-t-0">
                  <button type="button" onClick={() => pickClient(c)} className="flex min-h-12 w-full items-center justify-between gap-3 px-3.5 py-2 text-left hover:bg-white/70">
                    <span className="font-semibold">{c.name}</span>
                    <span className="shrink-0 text-xs text-muted">{c.plan ? PLAN_LABELS[c.plan.kind] : "nessun piano"}{c.paused ? " · in pausa" : ""}</span>
                  </button>
                </li>
              ))}
              {!matches.length ? <li className="px-3.5 py-3 text-sm text-muted">Nessun cliente con questo nome.</li> : null}
            </ul>
            <button
              type="button"
              onClick={() => {
                setIsNew(true);
                setClientId(null);
                setNewFirst(query.trim().split(/\s+/)[0] ?? "");
                setNewLast(query.trim().split(/\s+/).slice(1).join(" "));
                setType(null);
                reset(null, null);
              }}
              className="inline-flex min-h-11 items-center gap-1.5 self-start px-1 text-sm font-semibold"
            >
              <IconPlus size={16} /> Cliente nuovo (cliente spot, prima lezione…)
            </button>
          </div>
        )}
      </Card>

      {/* 2. Cosa paga */}
      {hasWho ? (
        <Card className="flex flex-col gap-3">
          <Eyebrow>2 · Cosa paga</Eyebrow>
          <div className="grid gap-2 sm:grid-cols-2">
            {client?.plan ? (
              <button type="button" onClick={() => pickType("renew")} className={choice(type === "renew")} aria-pressed={type === "renew"}>
                <span className="font-semibold">Rinnovo</span>
                <span className={cx("text-sm", type === "renew" ? "text-muted-dark" : "text-muted")}>
                  {PLAN_LABELS[client.plan.kind]} · {formatEuro(client.plan.amount)}
                  {client.proposal?.period_start && client.proposal.period_end ? ` · ${formatShort(client.proposal.period_start)} – ${formatShort(client.proposal.period_end)}` : ""}
                </span>
              </button>
            ) : null}
            <button type="button" onClick={() => pickType("plan")} className={choice(type === "plan")} aria-pressed={type === "plan"}>
              <span className="font-semibold">{client?.plan ? "Nuovo coaching" : "Coaching"}</span>
              <span className={cx("text-sm", type === "plan" ? "text-muted-dark" : "text-muted")}>mensile, trimestrale, semestrale…</span>
            </button>
            <button type="button" onClick={() => pickType("lessons")} className={choice(type === "lessons")} aria-pressed={type === "lessons"}>
              <span className="font-semibold">Lezioni PT</span>
              <span className={cx("text-sm", type === "lessons" ? "text-muted-dark" : "text-muted")}>un pacchetto o lezioni singole</span>
            </button>
            <button type="button" onClick={() => pickType("other")} className={choice(type === "other")} aria-pressed={type === "other"}>
              <span className="font-semibold">Altro</span>
              <span className={cx("text-sm", type === "other" ? "text-muted-dark" : "text-muted")}>valutazione posturale, consulenza…</span>
            </button>
          </div>
        </Card>
      ) : null}

      {/* 3. Dettagli */}
      {hasWho && type ? (
        <Card className="flex flex-col gap-4">
          <Eyebrow>3 · Quanto e quando</Eyebrow>

          {type === "plan" ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">Durata</span>
              <div className="flex flex-wrap gap-2">
                {SUBSCRIPTIONS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={kind === k}
                    onClick={() => {
                      setKind(k);
                      // il ciclo dipende dalla durata: ricalcolo inizio e fine
                      const st = client ? planStart(k, client, today) : start;
                      setStart(st);
                      setEnd(periodEnd(k, st) ?? "");
                    }}
                    className={chip(kind === k)}
                  >
                    {PLAN_DURATION[k]}
                  </button>
                ))}
              </div>
              {client?.plan && client.plan.kind !== kind ? <p className="text-sm text-muted">Diventa il suo piano da ora in poi: quello di prima ({PLAN_LABELS[client.plan.kind].toLowerCase()}) resta nello storico.</p> : null}
            </div>
          ) : null}

          {type === "other" ? (
            <div className="flex flex-col gap-2">
              <Field label="Per cosa">
                <Input name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Es. Valutazione posturale" required />
              </Field>
              <div className="flex flex-wrap gap-2">
                {OTHER_PRESETS.map((p) => (
                  <button key={p} type="button" onClick={() => setNotes(p)} className={chip(notes === p)}>{p}</button>
                ))}
              </div>
            </div>
          ) : null}

          {needsSessions ? (
            <div className="flex flex-col gap-2">
              <Field label={type === "lessons" ? "Quante lezioni" : "Sessioni del pacchetto"}>
                <Input name="sessions" type="number" inputMode="numeric" min={1} value={sessions} onChange={(e) => setLessons(e.target.value)} required className="max-w-32" />
              </Field>
              {type === "lessons" ? (
                <div className="flex flex-wrap gap-2">
                  {[1, 5, 10, 20].map((n) => (
                    <button key={n} type="button" onClick={() => setLessons(String(n))} className={chip(sessions === String(n))}>{n === 1 ? "1 lezione" : `${n} lezioni`}</button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {type === "lessons" ? (
            <div className="flex flex-col gap-1.5">
              <Field label="Prezzo a lezione" hint={client?.ptPrice ? "il suo prezzo (cambialo solo se è diverso)" : "si salva nella sua scheda per le prossime volte"}>
                <Input
                  name="pt_price"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => {
                    setPrice(e.target.value);
                    setLessons(sessions, euro(e.target.value));
                  }}
                  placeholder="Es. 63"
                  className="max-w-32"
                />
              </Field>
              {lessonsFull !== null && Number.isInteger(sessionsN) && sessionsN > 0 ? (
                <p className="text-sm text-muted" data-testid="lessons-due">
                  {sessionsN} {sessionsN === 1 ? "lezione" : "lezioni"}{priceN ? ` × ${formatEuro(priceN)}` : ""} = {formatEuro(lessonsFull)}
                  {client && Math.abs(client.lessonsCredit) >= 0.005 ? (client.lessonsCredit > 0 ? ` − ${formatEuro(client.lessonsCredit)} di credito = ${formatEuro(lessonsDueNow ?? 0)}` : ` + ${formatEuro(-client.lessonsCredit)} da recuperare = ${formatEuro(lessonsDueNow ?? 0)}`) : ""}
                </p>
              ) : null}
            </div>
          ) : null}
          {creditDue !== null && fullPrice !== null && Math.abs(creditNow) >= 0.005 && type !== "lessons" ? (
            <p className="text-sm text-muted">
              {creditNow > 0 ? `Ha un credito di ${formatEuro(creditNow)}` : `Ha ${formatEuro(-creditNow)} da recuperare`}: per {lessonsScope ? "questo pacchetto" : "questo rinnovo"} deve {formatEuro(creditDue)} invece di {formatEuro(fullPrice)}.
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Importo" hint="€">
              <Input name="amount" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setAmountTouched(true); }} placeholder="Es. 300" required />
            </Field>
            <Field label="Metodo">
              <Select name="method" value={method} onChange={(e) => setMethod(e.target.value)}>
                {METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
              </Select>
            </Field>
            <Field label="Pagato il">
              <Input name="paid_on" type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} required />
            </Field>
          </div>
          {creditDue !== null ? <CreditHint paid={amountN ?? NaN} due={creditDue} keep={keep} onKeep={setKeep} lessons={lessonsScope} /> : null}

          {periodic ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Vale dal">
                <Input
                  name="period_start"
                  type="date"
                  value={start}
                  onChange={(e) => {
                    setStart(e.target.value);
                    const k = type === "plan" ? kind : renewKind;
                    if (k && isISODate(e.target.value)) setEnd(periodEnd(k, e.target.value) ?? "");
                  }}
                  required
                />
              </Field>
              <Field label="Al" hint="calcolato da solo, puoi cambiarlo">
                <Input name="period_end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} required />
              </Field>
            </div>
          ) : null}

          {type !== "other" ? (
            <Field label="Nota" hint="facoltativa">
              <Input name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Es. pagato metà, il resto a fine mese" />
            </Field>
          ) : null}

          {client?.paused && type !== "other" ? (
            <label className="flex min-h-11 items-center gap-3 text-[15px]">
              <input type="checkbox" name="reactivate" checked={reactivate} onChange={(e) => setReactivate(e.target.checked)} className="h-5 w-5 accent-[var(--color-accent)]" />
              {client.fullName} era in pausa: riattivalo
            </label>
          ) : null}
        </Card>
      ) : null}

      {/* 4. Riepilogo */}
      {hasWho && type ? (
        <Card dark className="flex flex-col gap-3">
          <Eyebrow dark>Controlla e salva</Eyebrow>
          <p className="text-[16px] leading-relaxed text-card" aria-live="polite" data-testid="payment-summary">{summary ?? "Completa importo e dettagli: qui ti scrivo cosa verrà registrato."}</p>
          {state?.error ? <p role="alert" className="rounded-xl bg-accent-soft px-3 py-2 text-sm text-ink">{state.error}</p> : null}
          <div>
            {summary ? (
              <SubmitButton variant="light" pendingText="Salvo…">Salva il pagamento</SubmitButton>
            ) : (
              <button type="button" disabled className={buttonClass("light")}>Salva il pagamento</button>
            )}
          </div>
        </Card>
      ) : null}
    </form>
  );
}
