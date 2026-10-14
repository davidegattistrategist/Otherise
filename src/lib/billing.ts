/**
 * Piani di pagamento, scadenze e sessioni rimaste.
 * Il pagamento avviene fuori dall'app: qui si tiene solo traccia di cosa
 * è saldato e di quando scade.
 */
import { addDays, addMonths, diffDays, type ISODate } from "./dates";

export const PLAN_KINDS = ["monthly", "six_weeks", "quarterly", "semiannual", "annual", "package", "single"] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

/** Nomi dei piani: il "coaching" è l'abbonamento a periodo, il resto sono lezioni PT. */
export const PLAN_LABELS: Record<PlanKind, string> = {
  monthly: "Coaching mensile",
  six_weeks: "Coaching 6 settimane",
  quarterly: "Coaching trimestrale",
  semiannual: "Coaching semestrale",
  annual: "Coaching annuale",
  package: "Pacchetto di lezioni PT",
  single: "Lezione PT singola",
};

/** Solo la durata (per scegliere il coaching, dove "coaching" è già scritto sopra). */
export const PLAN_DURATION: Record<PlanKind, string> = {
  monthly: "Mensile",
  six_weeks: "6 settimane",
  quarterly: "Trimestrale",
  semiannual: "Semestrale",
  annual: "Annuale",
  package: "Pacchetto",
  single: "Singola",
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

/**
 * In coaching: piano a periodo (mensile, 6 settimane, trimestrale…). Chi ha un
 * pacchetto o lezioni singole fa lezioni PT; chi non ha un piano conta come
 * coaching solo se ha (o ha avuto) dei programmi.
 */
/**
 * Piani con credito: il coaching e i pacchetti di lezioni PT. Se paga più del
 * dovuto la differenza resta per il rinnovo dopo (o si aggiunge, se paga meno).
 */
export function usesCredit(kind: PlanKind): boolean {
  return isPeriodic(kind) || kind === "package";
}

export function isCoaching(planKind: PlanKind | null, hasPrograms: boolean): boolean {
  if (planKind) return isPeriodic(planKind);
  return hasPrograms;
}


/**
 * Ultimo giorno coperto da un pagamento che parte da `start` (dal 22 luglio al
 * 21 ottobre): il periodo dopo parte il giorno successivo, così ogni giorno è
 * saldato una volta sola.
 */
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
  /**
   * Coaching non ancora saldato: quanti periodi sono da saldare, compreso
   * quello in corso (1 = solo il periodo in corso, "da saldare"; 2 o più =
   * ne è finito almeno uno senza pagamento, "scaduto"). 0 negli altri casi.
   */
  unpaidPeriods: number;
  /** Scaduto: da quanti giorni è finito il primo periodo non pagato (1 = da ieri). */
  lateDays?: number;
};

export const SESSIONS_WARNING = 2;

export function billingStatus(row: BillingRow | null | undefined, today: ISODate, reminderDays = 7): BillingStatus {
  if (!row) {
    return { state: "none", label: "Nessun piano", clientLabel: "", dueDate: null, daysLeft: null, sessionsLeft: null, unpaidPeriods: 0 };
  }
  const kind = row.kind;
  if (kind === "package") {
    const left = row.sessions_bought - row.sessions_used;
    if (row.sessions_bought <= 0) {
      return { state: "overdue", label: "Pacchetto da saldare", clientLabel: "Pacchetto da saldare", dueDate: null, daysLeft: null, sessionsLeft: 0, unpaidPeriods: 0 };
    }
    const state: BillingState = left <= 0 ? "overdue" : left <= SESSIONS_WARNING ? "due_soon" : "ok";
    const word = (n: number) => (n === 1 ? "sessione" : "sessioni");
    const label = left <= 0
      ? left === 0 ? "Pacchetto finito" : `Pacchetto finito (${-left} ${word(-left)} in più)`
      : `${left} ${word(left)} ${left === 1 ? "rimasta" : "rimaste"}`;
    return { state, label, clientLabel: label, dueDate: null, daysLeft: null, sessionsLeft: left, unpaidPeriods: 0 };
  }
  if (kind === "single") {
    return { state: "ok", label: "Paga a sessione", clientLabel: "Paghi a sessione", dueDate: null, daysLeft: null, sessionsLeft: null, unpaidPeriods: 0 };
  }
  if (!row.paid_until) {
    return { state: "overdue", label: "Primo pagamento da registrare", clientLabel: "Pagamento da saldare", dueDate: null, daysLeft: null, sessionsLeft: null, unpaidPeriods: 0 };
  }
  const daysLeft = diffDays(today, row.paid_until);
  const noun = PERIOD_NOUN[kind];
  if (daysLeft < 0) {
    // Il periodo in corso non ancora pagato è "da saldare", non scaduto: è
    // scaduto solo quando ne è finito uno intero senza pagamento.
    let unpaidPeriods = 1;
    let end = periodEnd(kind, addDays(row.paid_until, 1))!;
    while (end < today && unpaidPeriods < 60) {
      unpaidPeriods++;
      end = periodEnd(kind, addDays(end, 1))!;
    }
    if (unpaidPeriods === 1) {
      return { state: "overdue", label: `${noun} da saldare`, clientLabel: `${noun} da saldare`, dueDate: row.paid_until, daysLeft, sessionsLeft: null, unpaidPeriods };
    }
    // giorni dalla fine del primo periodo non pagato
    const late = diffDays(periodEnd(kind, addDays(row.paid_until, 1))!, today);
    return {
      state: "overdue",
      label: `Scaduto da ${late} ${late === 1 ? "giorno" : "giorni"}`,
      clientLabel: "Periodo scaduto",
      dueDate: row.paid_until,
      daysLeft,
      sessionsLeft: null,
      unpaidPeriods,
      lateDays: late,
    };
  }
  const state: BillingState = daysLeft <= reminderDays ? "due_soon" : "ok";
  const label = state === "ok"
    ? "In regola"
    : daysLeft === 0 ? "Scade oggi" : `Scade tra ${daysLeft} ${daysLeft === 1 ? "giorno" : "giorni"}`;
  return { state, label, clientLabel: `${noun} saldato fino al`, dueDate: row.paid_until, daysLeft, sessionsLeft: null, unpaidPeriods: 0 };
}

/**
 * Fino a quanti periodi da saldare (compreso quello in corso) il cliente vede
 * l'avviso: il periodo in corso ("da saldare") e uno rimasto indietro
 * ("scaduto"). Oltre (di solito un dato vecchio, per esempio dallo storico
 * importato) se ne occupa il trainer di persona.
 */
export const CLIENT_UNPAID_PERIODS_LIMIT = 2;

/**
 * Lo stato dei pagamenti da far vedere al cliente: in regola, in scadenza,
 * periodo in corso da saldare o scaduto da un periodo. Un ritardo più lungo
 * non si mostra e non manda promemoria: lo vede il trainer.
 */
export function clientFacingStatus(st: BillingStatus): BillingStatus | null {
  if (st.state !== "overdue") return st;
  if (st.daysLeft !== null) return st.unpaidPeriods <= CLIENT_UNPAID_PERIODS_LIMIT ? st : null;
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

/**
 * Credito del cliente (coaching). Se paga più del dovuto la differenza resta
 * come credito e il rinnovo dopo costa meno; se paga meno, la differenza si
 * aggiunge al rinnovo dopo (credito negativo).
 */
const cents = (n: number) => Math.round(n * 100) / 100 || 0;
/** Quanto deve pagare per il prossimo periodo: prezzo del piano meno il credito (mai sotto zero). */
export function dueAmount(planAmount: number, credit: number): number {
  return Math.max(0, cents(planAmount - credit));
}
/**
 * Di quanto cambia il credito con un pagamento di un periodo.
 * `keep`: la differenza rispetto al dovuto resta (credito o da recuperare);
 * altrimenti il periodo è saldato così (il credito di prima si usa tutto).
 */
export function creditChange(input: { planAmount: number; credit: number; paid: number; keep: boolean }): number {
  return input.keep ? cents(input.paid - input.planAmount) : cents(-input.credit);
}
/** Testo breve del credito: "Credito 200 €" / "Da recuperare 50 €". */
export function creditLabel(credit: number): string | null {
  if (Math.abs(credit) < 0.005) return null;
  return credit > 0 ? `Credito ${formatEuro(credit)}` : `Da recuperare ${formatEuro(-credit)}`;
}

/** Prossimo pagamento proposto per un piano: importo (meno l'eventuale credito), periodo o sessioni. */
export function nextPaymentProposal(plan: { kind: PlanKind; amount: number | string; method: string; start_date: ISODate; package_sessions: number | null }, paidUntil: ISODate | null, credit = 0) {
  const period = suggestNextPeriod(plan.kind, plan.start_date, paidUntil);
  return {
    amount: usesCredit(plan.kind) ? dueAmount(Number(plan.amount), credit) : Number(plan.amount),
    method: plan.method,
    period_start: period?.start ?? null,
    period_end: period?.end ?? null,
    sessions: plan.kind === "package" ? plan.package_sessions ?? 1 : plan.kind === "single" ? 1 : null,
  };
}

/**
 * Coaching rimasto indietro: i periodi ancora da pagare fino a quello in corso,
 * dal più vecchio. Il primo costa il prezzo meno il credito, gli altri il prezzo
 * pieno. `late` = periodo già finito (scaduto). Vuoto se non c'è nulla da pagare.
 */
export function unpaidPeriods(
  plan: { kind: PlanKind; amount: number | string; start_date: ISODate },
  paidUntil: ISODate | null,
  today: ISODate,
  credit = 0,
  max = 6,
): Array<{ start: ISODate; end: ISODate; amount: number; late: boolean }> {
  if (!isPeriodic(plan.kind)) return [];
  const out: Array<{ start: ISODate; end: ISODate; amount: number; late: boolean }> = [];
  let next = suggestNextPeriod(plan.kind, plan.start_date, paidUntil);
  while (next && next.start <= today && out.length < max) {
    out.push({ start: next.start, end: next.end, amount: out.length === 0 ? dueAmount(Number(plan.amount), credit) : Number(plan.amount), late: next.end < today });
    next = suggestNextPeriod(plan.kind, plan.start_date, next.end);
  }
  return out;
}

/** Periodo di coaching rimasto "da saldare" nel registro (riga con `unpaid`). */
export type UnpaidRow = { id: string; period_start: ISODate; period_end: ISODate };

/**
 * Stato del coaching tenendo conto delle righe "da saldare": un periodo
 * saltato resta scaduto anche se dopo ne ha pagato un altro.
 */
export function withUnpaidRows(st: BillingStatus, rows: UnpaidRow[], today: ISODate): BillingStatus {
  if (!rows.length || st.state === "none") return st;
  const oldest = [...rows].sort((a, b) => a.period_end.localeCompare(b.period_end))[0];
  const chain = st.state === "overdue" && st.daysLeft !== null ? st.unpaidPeriods : 0;
  if (oldest.period_end >= today) {
    return { ...st, state: "overdue", label: "Periodo da saldare", clientLabel: "Periodo da saldare", unpaidPeriods: Math.max(1, rows.length + chain) };
  }
  const late = diffDays(oldest.period_end, today);
  return { ...st, state: "overdue", label: `Scaduto da ${late} ${late === 1 ? "giorno" : "giorni"}`, clientLabel: "Periodo scaduto", unpaidPeriods: Math.max(2, rows.length + chain), lateDays: late };
}

/** Quanto vale un piano in un mese (per le stime delle entrate ricorrenti) */
export const MONTHLY_FACTOR: Partial<Record<PlanKind, number>> = { monthly: 1, six_weeks: 30.44 / 42, quarterly: 1 / 3, semiannual: 1 / 6, annual: 1 / 12 };

export type PtCounter = {
  /** sessioni pagate (pacchetti, lezioni a parte, saldi; con la correzione: quelle che restavano + pagate dopo) */
  bought: number;
  /** sessioni fatte che contano */
  used: number;
  /** pagate ancora da fare (negativo = fatte e non ancora pagate) */
  left: number;
  /** sessioni fatte e non ancora saldate */
  due: number;
  /** prezzo di una sessione, se impostato */
  price: number | null;
  /** quanto c'è da saldare (solo con il prezzo) */
  dueAmount: number | null;
  /** da quando si conta */
  since: ISODate;
  /** il conteggio riparte da una correzione a mano ("oggi gliene restano N") */
  corrected: boolean;
};

/**
 * Contatore unico delle sessioni PT di un cliente (calcolato nel database da
 * pt_counters()): rimaste = pagate − fatte. Le sessioni fatte senza copertura
 * si scalano dal pacchetto successivo; quelle pagate in più restano da fare.
 */
export function ptCounterView(row: { since: ISODate; baseline_at: string | null; bought: number; used: number } | null, price: number | null = null): PtCounter | null {
  if (!row) return null;
  const left = row.bought - row.used;
  const due = Math.max(0, -left);
  return { bought: row.bought, used: row.used, left, due, price, dueAmount: price !== null ? Math.round(due * price * 100) / 100 : null, since: row.since, corrected: Boolean(row.baseline_at) };
}
