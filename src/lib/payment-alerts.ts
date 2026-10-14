/**
 * Avvisi automatici dei pagamenti (controlli del mattino, daily-checks.ts).
 * Pochi e una volta sola, come ha deciso il titolare:
 * - al trainer: 7 giorni prima della scadenza (giorni in Impostazioni), quando
 *   è passato un periodo intero senza pagamento, e nei pacchetti di lezioni
 *   quando resta 1 sola sessione;
 * - al cliente: 7 giorni prima del rinnovo (molto morbido), il giorno del
 *   rinnovo (morbido) e, se è passato un periodo intero scoperto, una volta.
 * Ogni avviso ha una chiave: la stessa chiave non manda due notifiche.
 * Funzioni pure (testate in lib.test.ts).
 */
import { addDays, formatDayMonth, type ISODate } from "./dates";
import { PERIOD_NOUN, type BillingStatus, type PlanKind } from "./billing";

/**
 * Se il controllo del mattino salta un giorno, l'avviso parte lo stesso nei
 * giorni subito dopo. Oltre no: una situazione vecchia la vedi in Oggi e in
 * Pagamenti, senza notifiche arretrate.
 */
export const ALERT_GRACE_DAYS = 2;

/**
 * Nota aggiunta all'avviso del giorno del rinnovo (la scrive il titolare).
 * Vuota = solo il testo di base.
 */
export const RENEWAL_DAY_NOTE = "";

export type PaymentEvent =
  /** mancano `daysLeft` giorni alla fine del periodo pagato */
  | { type: "soon"; key: string; daysLeft: number; dueDate: ISODate }
  /** oggi (o da poco) è iniziato il periodo nuovo, non ancora pagato */
  | { type: "renewal"; key: string; start: ISODate; daysAgo: number }
  /** è appena finito un periodo intero senza pagamento */
  | { type: "uncovered"; key: string; since: ISODate }
  /** pacchetto di lezioni: resta 1 sessione */
  | { type: "last_session"; key: string };

/** Quale avviso dei pagamenti scatta oggi per questo cliente (al massimo uno). */
export function paymentEvent(st: BillingStatus, today: ISODate, reminderDays: number, sessionsBought = 0): PaymentEvent | null {
  // pacchetto di lezioni: si conta per sessioni, non per date
  if (st.sessionsLeft !== null && st.dueDate === null) {
    return st.sessionsLeft === 1 ? { type: "last_session", key: `last:s${sessionsBought}` } : null;
  }
  if (!st.dueDate || st.daysLeft === null) return null;
  if (st.state === "due_soon" && st.daysLeft <= reminderDays && st.daysLeft >= reminderDays - ALERT_GRACE_DAYS) {
    return { type: "soon", key: `soon:${st.dueDate}`, daysLeft: st.daysLeft, dueDate: st.dueDate };
  }
  if (st.state !== "overdue") return null;
  if (st.unpaidPeriods >= 2 && st.lateDays !== undefined) {
    if (st.lateDays < 1 || st.lateDays > 1 + ALERT_GRACE_DAYS) return null;
    const since = addDays(today, 1 - st.lateDays);
    return { type: "uncovered", key: `uncovered:${since}`, since };
  }
  if (st.unpaidPeriods === 1 && st.daysLeft <= -1 && st.daysLeft >= -1 - ALERT_GRACE_DAYS) {
    const start = addDays(st.dueDate, 1);
    return { type: "renewal", key: `renewal:${start}`, start, daysAgo: -1 - st.daysLeft };
  }
  return null;
}

type Text = { title: string; body: string };

const noun = (kind: PlanKind) => PERIOD_NOUN[kind].toLowerCase();

/** Avviso al trainer, oppure null (il giorno del rinnovo il trainer non riceve niente: lo vede in Oggi). */
export function staffPaymentText(ev: PaymentEvent, name: string): Text | null {
  switch (ev.type) {
    case "soon":
      return { title: `Pagamento: ${name}`, body: ev.daysLeft === 0 ? "Il periodo pagato finisce oggi." : `Il periodo pagato finisce tra ${ev.daysLeft} ${ev.daysLeft === 1 ? "giorno" : "giorni"}, il ${formatDayMonth(ev.dueDate)}.` };
    case "uncovered":
      return { title: `Pagamento scaduto: ${name}`, body: "È passato un periodo intero senza pagamento. Lo trovi in Pagamenti, con il promemoria già pronto." };
    case "last_session":
      return { title: `Pacchetto: ${name}`, body: "Gli resta 1 sola sessione nel pacchetto." };
    default:
      return null;
  }
}

/** Avviso al cliente, sempre gentile; null per i pacchetti di lezioni (ne parla il trainer). */
export function clientPaymentText(ev: PaymentEvent, kind: PlanKind): Text | null {
  const n = noun(kind);
  switch (ev.type) {
    case "soon":
      return {
        title: `Il tuo nuovo ${n} inizia il ${formatDayMonth(addDays(ev.dueDate, 1))}`,
        body: `Il ${n} in corso arriva fino al ${formatDayMonth(ev.dueDate)}. Te lo diciamo per tempo, così ti organizzi con calma.`,
      };
    case "renewal":
      return {
        title: ev.daysAgo === 0 ? `Oggi inizia il tuo nuovo ${n}` : `È iniziato il tuo nuovo ${n}`,
        body: [`${ev.daysAgo === 0 ? "Da oggi" : `Dal ${formatDayMonth(ev.start)}`} parte il tuo nuovo ${n} di percorso: quando ti è comodo, sistemiamo il rinnovo.`, RENEWAL_DAY_NOTE].filter(Boolean).join(" "),
      };
    case "uncovered":
      return {
        title: `Un ${n} da sistemare`,
        body: `Un ${n} del tuo percorso è finito senza rinnovo. Nessun problema: quando ti è comodo ne parliamo e lo sistemiamo insieme.`,
      };
    default:
      return null;
  }
}
