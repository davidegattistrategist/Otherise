/**
 * Previsione degli incassi dei prossimi mesi.
 * - Abbonamenti (mensile, 6 settimane, trimestrale…): rinnovo alla scadenza, stesso importo.
 * - Pacchetti: quando finiscono le sessioni, al ritmo con cui il cliente le fa; poi un
 *   nuovo pacchetto allo stesso prezzo, e così via.
 * - Sessione singola: le sessioni al mese al suo ritmo, per il prezzo della sessione.
 * Scenario prudente: ogni rinnovo successivo è un po' meno probabile, in base a quanti
 * clienti hanno rinnovato davvero negli ultimi mesi.
 */
import { periodEnd, type PlanKind } from "./billing";
import { addDays, addMonths, diffDays, type ISODate } from "./dates";

export type ForecastPlan = {
  clientId: string;
  name: string;
  kind: PlanKind;
  amount: number;
  paidUntil: ISODate | null;
  packageSessions: number | null;
  sessionsLeft: number | null;
  /** date delle sessioni PT che contano nel pacchetto, ultime 12 settimane */
  recentSessions: ISODate[];
};

export type ForecastEvent = {
  date: ISODate;
  clientId: string;
  name: string;
  amount: number;
  kind: "recurring" | "package" | "single";
  label: string;
  /** probabilità nello scenario prudente (0-1) */
  probability: number;
  /** era già da pagare (scaduto) */
  overdue?: boolean;
};

export type ForecastMonth = { key: string; recurring: number; packages: number; single: number; total: number; prudent: number };

/** Sessioni a settimana: ultime 8 settimane, altrimenti 12 (null se nessuna). */
export function weeklyPace(dates: ISODate[], today: ISODate): number | null {
  const in8 = dates.filter((d) => diffDays(d, today) <= 56 && d <= today).length;
  if (in8) return in8 / 8;
  const in12 = dates.filter((d) => diffDays(d, today) <= 84 && d <= today).length;
  return in12 ? in12 / 12 : null;
}

const fmtPace = (p: number) => (Math.round(p * 10) / 10).toString().replace(".", ",");

export function buildForecast(plans: ForecastPlan[], today: ISODate, months: number, renewalRate: number) {
  const start = `${today.slice(0, 7)}-01` as ISODate;
  const end = addMonths(start, months); // escluso
  const events: ForecastEvent[] = [];
  const push = (e: Omit<ForecastEvent, "date"> & { date: ISODate }) => {
    if (e.date < end) events.push({ ...e, date: e.date < today ? today : e.date, overdue: e.date < today });
  };

  for (const p of plans) {
    if (p.amount <= 0) continue;
    if (p.kind === "package") {
      const pace = weeklyPace(p.recentSessions, today);
      const rate = pace ?? 1;
      const size = Math.max(1, p.packageSessions ?? 10);
      const left = p.sessionsLeft ?? 0;
      let date = addDays(today, left > 0 ? Math.round((left / rate) * 7) : 0);
      let n = 1;
      while (date < end && n < 60) {
        push({
          date, clientId: p.clientId, name: p.name, amount: p.amount, kind: "package", probability: Math.pow(renewalRate, n),
          label: n === 1
            ? `Nuovo pacchetto: ${left > 0 ? `finisce le ${left} sessioni rimaste` : "pacchetto finito"} (${pace ? `${fmtPace(pace)} a settimana` : "stima 1 a settimana"})`
            : "Pacchetto successivo",
        });
        date = addDays(date, Math.max(7, Math.round((size / rate) * 7)));
        n++;
      }
      continue;
    }
    if (p.kind === "single") {
      const pace = weeklyPace(p.recentSessions, today);
      if (!pace) continue;
      for (let i = 0; i < months; i++) {
        const mStart = addMonths(start, i);
        const perMonth = (pace * 30.44) / 7;
        push({ date: addDays(mStart, 14), clientId: p.clientId, name: p.name, amount: Math.round(perMonth * p.amount), kind: "single", probability: Math.pow(renewalRate, i + 1), label: `A sessione: circa ${Math.round(perMonth)} al mese` });
      }
      continue;
    }
    // abbonamenti: si rinnova dal giorno dopo l'ultimo periodo saldato
    let next = p.paidUntil ? addDays(p.paidUntil, 1) : today;
    let n = 1;
    while (next < end && n < 60) {
      push({ date: next, clientId: p.clientId, name: p.name, amount: p.amount, kind: "recurring", probability: Math.pow(renewalRate, n), label: n === 1 && next <= today ? "Rinnovo da saldare" : "Rinnovo" });
      const pe = periodEnd(p.kind, next);
      if (!pe) break;
      next = addDays(pe, 1);
      n++;
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  const monthsOut: ForecastMonth[] = Array.from({ length: months }, (_, i) => ({ key: addMonths(start, i).slice(0, 7), recurring: 0, packages: 0, single: 0, total: 0, prudent: 0 }));
  for (const e of events) {
    const m = monthsOut.find((x) => x.key === e.date.slice(0, 7));
    if (!m) continue;
    if (e.kind === "recurring") m.recurring += e.amount;
    else if (e.kind === "package") m.packages += e.amount;
    else m.single += e.amount;
    m.total += e.amount;
    m.prudent += e.amount * e.probability;
  }
  for (const m of monthsOut) m.prudent = Math.round(m.prudent);
  // prossimi 30 giorni: solo il primo rinnovo di ogni cliente, come nella pagina Pagamenti
  // (un secondo rinnovo nello stesso mese vale solo se il primo è stato pagato)
  const seen = new Set<string>();
  const first30 = events
    .filter((e) => e.date <= addDays(today, 30))
    .filter((e) => (seen.has(e.clientId) ? false : (seen.add(e.clientId), true)));
  const next30 = first30.reduce((t, e) => t + e.amount, 0);
  const overdue30 = first30.filter((e) => e.overdue).reduce((t, e) => t + e.amount, 0);
  const total = monthsOut.reduce((t, m) => t + m.total, 0);
  const prudent = monthsOut.reduce((t, m) => t + m.prudent, 0);
  return { months: monthsOut, events, next30, overdue30, total, prudent };
}

/**
 * Quota di rinnovi andati a buon fine: per ogni periodo saldato scaduto negli ultimi
 * 12 mesi (tranne l'ultimo), c'è stato un pagamento dello stesso cliente entro 45 giorni?
 * Con meno di 3 casi si usa 0,85.
 */
export function renewalRateFrom(payments: Array<{ client_id: string; paid_on: ISODate; period_end: ISODate | null }>, today: ISODate) {
  const due = payments.filter((p) => p.period_end && p.period_end >= addDays(today, -365) && p.period_end <= addDays(today, -30));
  if (due.length < 3) return { rate: 0.85, measured: false, cases: due.length };
  const renewed = due.filter((d) =>
    payments.some((p) => p.client_id === d.client_id && p !== d && p.paid_on > addDays(d.period_end!, -20) && p.paid_on <= addDays(d.period_end!, 45)),
  ).length;
  return { rate: Math.max(0.3, Math.min(1, renewed / due.length)), measured: true, cases: due.length };
}
