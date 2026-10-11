/**
 * Piani di pagamento, scadenze e sessioni rimaste.
 * Il pagamento avviene fuori dall'app: qui si tiene solo traccia di cosa
 * è saldato e di quando scade.
 */
import { addDays, addMonths, diffDays, type ISODate } from "./dates";

export const PLAN_KINDS = ["monthly", "six_weeks", "quarterly", "semiannual", "annual", "package", "single"] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

export const PLAN_LABELS: Record<PlanKind, string> = {
  monthly: "Mensile",
  six_weeks: "6 settimane",
  quarterly: "Trimestrale",
  semiannual: "Semestrale",
  annual: "Annuale",
  package: "Pacchetto di sessioni",
  single: "Sessione singola",
};

/** Come chiamare il periodo saldato nei testi per il cliente */
export const PERIOD_NOUN: Record<PlanKind, string> = {
  monthly: "Mese",
  six_weeks: "Blocco di 6 settimane",
  quarterly: "Trimestre",
  semiannual: "Semestre",
  annual: "Anno",
  package: "Pacchetto",
  single: "Sessione",
};

export const METHODS = ["transfer", "cash", "paypal", "card", "other"] as const;
export type PaymentMethod = (typeof METHODS)[number];
export const METHOD_LABELS: Record<PaymentMethod, string> = {
  transfer: "Bonifico",
  cash: "Contanti",
  paypal: "PayPal",
  card: "Carta / POS",
  other: "Altro",
};

export function isPeriodic(kind: PlanKind): boolean {
  return kind !== "package" && kind !== "single";
}

/** Ultimo giorno coperto da un pagamento che parte da `start`. */
export function periodEnd(kind: PlanKind, start: ISODate): ISODate | null {
  switch (kind) {
    case "monthly":
      return addDays(addMonths(start, 1), -1);
    case "six_weeks":
      return addDays(start, 41);
    case "quarterly":
      return addDays(addMonths(start, 3), -1);
    case "semiannual":
      return addDays(addMonths(start, 6), -1);
    case "annual":
      return addDays(addMonths(start, 12), -1);
    default:
      return null;
  }
}

/** Periodo proposto per il prossimo pagamento: riparte dal giorno dopo l'ultimo saldato. */
export function suggestNextPeriod(kind: PlanKind, planStart: ISODate, paidUntil: ISODate | null) {
  if (!isPeriodic(kind)) return null;
  const start = paidUntil ? addDays(paidUntil, 1) : planStart;
  return { start, end: periodEnd(kind, start)! };
}

export type BillingRow = {
  plan_id: string;
  kind: PlanKind;
  amount: number | string;
  paid_until: ISODate | null;
  sessions_bought: number;
  sessions_used: number;
};

export type BillingState = "ok" | "due_soon" | "overdue" | "none";

export type BillingStatus = {
  state: BillingState;
  /** Testo breve per lo staff: "In regola", "Scade tra 5 giorni"… */
  label: string;
  /** Testo per il cliente: "Trimestre saldato fino al 12 gen" */
  clientLabel: string;
  dueDate: ISODate | null;
  daysLeft: number | null;
  sessionsLeft: number | null;
};

export const SESSIONS_WARNING = 2;

export function billingStatus(row: BillingRow | null | undefined, today: ISODate, reminderDays = 7): BillingStatus {
  if (!row) {
    return { state: "none", label: "Nessun piano", clientLabel: "", dueDate: null, daysLeft: null, sessionsLeft: null };
  }
  const kind = row.kind;
  if (kind === "package") {
    const left = row.sessions_bought - row.sessions_used;
    if (row.sessions_bought <= 0) {
      return { state: "overdue", label: "Pacchetto da saldare", clientLabel: "Pacchetto da saldare", dueDate: null, daysLeft: null, sessionsLeft: 0 };
    }
    const state: BillingState = left <= 0 ? "overdue" : left <= SESSIONS_WARNING ? "due_soon" : "ok";
    const word = (n: number) => (n === 1 ? "sessione" : "sessioni");
    const label = left <= 0
      ? left === 0 ? "Pacchetto finito" : `Pacchetto finito (${-left} ${word(-left)} in più)`
      : `${left} ${word(left)} ${left === 1 ? "rimasta" : "rimaste"}`;
    return { state, label, clientLabel: label, dueDate: null, daysLeft: null, sessionsLeft: left };
  }
  if (kind === "single") {
    return { state: "ok", label: "Paga a sessione", clientLabel: "Paghi a sessione", dueDate: null, daysLeft: null, sessionsLeft: null };
  }
  if (!row.paid_until) {
    return { state: "overdue", label: "Primo pagamento da registrare", clientLabel: "Pagamento da saldare", dueDate: null, daysLeft: null, sessionsLeft: null };
  }
  const daysLeft = diffDays(today, row.paid_until);
  const noun = PERIOD_NOUN[kind];
  if (daysLeft < 0) {
    return {
      state: "overdue",
      label: `Scaduto da ${-daysLeft} ${-daysLeft === 1 ? "giorno" : "giorni"}`,
      clientLabel: "Rinnovo da saldare",
      dueDate: row.paid_until,
      daysLeft,
      sessionsLeft: null,
    };
  }
  const state: BillingState = daysLeft <= reminderDays ? "due_soon" : "ok";
  const label = state === "ok"
    ? "In regola"
    : daysLeft === 0 ? "Scade oggi" : `Scade tra ${daysLeft} ${daysLeft === 1 ? "giorno" : "giorni"}`;
  return { state, label, clientLabel: `${noun} saldato fino al`, dueDate: row.paid_until, daysLeft, sessionsLeft: null };
}

/** Oltre quanti giorni di ritardo il cliente non vede più avvisi di rinnovo (se ne occupa il trainer di persona). */
export const CLIENT_OVERDUE_LIMIT = 10;

/**
 * Lo stato dei pagamenti da far vedere al cliente: in regola, in scadenza o
 * scaduto da poco. Un ritardo lungo (o un dato vecchio, per esempio dallo
 * storico importato) non si mostra e non manda promemoria: lo vede il trainer.
 */
export function clientFacingStatus(st: BillingStatus): BillingStatus | null {
  if (st.state !== "overdue") return st;
  if (st.daysLeft !== null) return -st.daysLeft <= CLIENT_OVERDUE_LIMIT ? st : null;
  // pacchetto finito: avviso solo se ha sforato di poco
  if (st.sessionsLeft !== null && st.sessionsLeft < 0 && st.sessionsLeft >= -2) return st;
  return st.sessionsLeft === 0 ? st : null;
}

export function formatEuro(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : n ?? 0;
  // "always": in italiano senza questa opzione 5550 € resterebbe senza punto delle migliaia
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: Number.isInteger(v) ? 0 : 2, useGrouping: "always" } as Intl.NumberFormatOptions).format(v);
}

/** "il tuo trimestre è saldato fino al 13 ottobre", "ti restano 2 sessioni nel pacchetto"… per i promemoria. */
export function situationText(status: BillingStatus, kind: PlanKind, formatDate: (d: ISODate) => string): string {
  if (status.sessionsLeft !== null) {
    return status.sessionsLeft <= 0 ? "il tuo pacchetto di sessioni è terminato" : `ti ${status.sessionsLeft === 1 ? "resta 1 sessione" : `restano ${status.sessionsLeft} sessioni`} nel pacchetto`;
  }
  if (status.dueDate) {
    const what = PERIOD_NOUN[kind].toLowerCase();
    return status.daysLeft !== null && status.daysLeft < 0 ? `il periodo saldato (${what}) è terminato il ${formatDate(status.dueDate)}` : `il periodo saldato (${what}) termina il ${formatDate(status.dueDate)}`;
  }
  return "c'è un pagamento da saldare";
}

/** Prossimo pagamento proposto per un piano: importo, periodo o sessioni. */
export function nextPaymentProposal(plan: { kind: PlanKind; amount: number | string; method: string; start_date: ISODate; package_sessions: number | null }, paidUntil: ISODate | null) {
  const period = suggestNextPeriod(plan.kind, plan.start_date, paidUntil);
  return {
    amount: Number(plan.amount),
    method: plan.method,
    period_start: period?.start ?? null,
    period_end: period?.end ?? null,
    sessions: plan.kind === "package" ? plan.package_sessions ?? 1 : plan.kind === "single" ? 1 : null,
  };
}

/** Quanto vale un piano in un mese (per le stime delle entrate ricorrenti) */
export const MONTHLY_FACTOR: Partial<Record<PlanKind, number>> = { monthly: 1, six_weeks: 30.44 / 42, quarterly: 1 / 3, semiannual: 1 / 6, annual: 1 / 12 };
