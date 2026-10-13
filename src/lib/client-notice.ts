/**
 * Avviso gentile al cliente quando c'è qualcosa da sistemare con i pagamenti:
 * un nuovo periodo di coaching che sta per iniziare o è iniziato da poco,
 * un pacchetto di lezioni PT arrivato in fondo, sessioni PT fatte e non
 * ancora coperte. Mai "devi pagare": tono calmo, nessuna fretta, un invito
 * a scrivere al coach. Funzioni pure (testate in lib.test.ts).
 */
import { addDays, type ISODate } from "./dates";
import { formatEuro, isPeriodic, PERIOD_NOUN, type BillingStatus, type PlanKind } from "./billing";

/** Oltre quante sessioni scoperte il cliente non vede l'avviso (se ne occupa il trainer di persona). */
export const CLIENT_PT_LIMIT = 4;

export type ClientNotice = {
  /** "renew" = rinnovo del coaching o del pacchetto, "sessions" = sessioni PT scoperte, "covered" = già coperto dal credito */
  kind: "renew" | "sessions" | "covered";
  title: string;
  text: string;
  /** Riga con la cifra, scritta con calma ("Per il prossimo periodo: 100 €"). */
  amount: string | null;
};

type Input = {
  /** Stato già filtrato con `clientFacingStatus` (null = niente da mostrare). */
  status: BillingStatus | null;
  kind: PlanKind | null;
  planAmount: number;
  credit: number;
  /** Contatore delle sessioni PT (pagate e fatte), se c'è. */
  pt: { bought: number; used: number } | null;
  ptPrice: number | null;
  /** Nome di chi lo segue ("Davide"). */
  coach: string;
  formatDate: (d: ISODate) => string;
};

const sessions = (n: number) => (n === 1 ? "1 sessione" : `${n} sessioni`);

function renewNotice(i: Input): ClientNotice | null {
  const st = i.status;
  if (!st || !i.kind || (st.state !== "due_soon" && st.state !== "overdue")) return null;
  const write = `Quando ti è comodo ne parliamo: basta un messaggio a ${i.coach}.`;

  if (i.kind === "package") {
    const left = st.sessionsLeft ?? 0;
    if (left > 0) {
      return {
        kind: "renew",
        title: left === 1 ? "Ti resta l'ultima sessione del pacchetto" : `Ti restano ${sessions(left)} del pacchetto`,
        text: `Se vuoi continuare senza pause, pensiamo insieme al prossimo pacchetto. ${write}`,
        amount: null,
      };
    }
    const extra = -left;
    return {
      kind: "renew",
      title: "Il tuo pacchetto è arrivato in fondo",
      text: `${extra > 0 ? `Abbiamo usato tutte le sessioni del pacchetto, più ${sessions(extra)} fatte insieme dopo. ` : "Abbiamo usato tutte le sessioni del pacchetto. "}Grazie per la costanza! Quando vuoi prepariamo il prossimo: basta un messaggio a ${i.coach}.`,
      amount: extra > 0 && i.ptPrice ? `Le sessioni in più: ${formatEuro(extra * i.ptPrice)}` : null,
    };
  }

  if (!isPeriodic(i.kind)) return null;
  const due = Math.max(0, Math.round((i.planAmount - i.credit) * 100) / 100);
  const amount = i.planAmount > 0
    ? i.credit > 0
      ? `Per il prossimo periodo: ${formatEuro(due)} (${formatEuro(Math.min(i.credit, i.planAmount))} li hai già messi da parte)`
      : i.credit < 0
        ? `Per il prossimo periodo: ${formatEuro(due)} (${formatEuro(i.planAmount)} più ${formatEuro(-i.credit)} rimasti dalla volta scorsa)`
        : `Per il prossimo periodo: ${formatEuro(due)}`
    : null;

  // il credito copre tutto il prossimo periodo: niente da fare
  if (i.planAmount > 0 && due === 0) {
    return {
      kind: "covered",
      title: "Il prossimo periodo è già coperto",
      text: `Con quello che hai versato in anticipo il rinnovo è già a posto: non devi fare niente.`,
      amount: null,
    };
  }

  const noun = PERIOD_NOUN[i.kind].toLowerCase();
  if (!st.dueDate) {
    return {
      kind: "renew",
      title: "Benvenuto nel tuo percorso",
      text: `Quando ti è comodo sistemiamo insieme il primo pagamento, senza fretta. Basta un messaggio a ${i.coach}.`,
      amount,
    };
  }
  const start = addDays(st.dueDate, 1);
  if (st.state === "overdue" && st.unpaidPeriods > 1) {
    // un periodo intero è finito senza pagamento: "scaduto", ma detto con calma
    const owed = Math.max(0, Math.round((i.planAmount * st.unpaidPeriods - i.credit) * 100) / 100);
    return {
      kind: "renew",
      title: "C'è un periodo scaduto da sistemare",
      text: `Il ${noun} iniziato il ${i.formatDate(start)} non risulta ancora saldato, e nel frattempo è partito anche quello nuovo. Capita, nessun problema: quando ti è comodo sistemiamo tutto insieme con ${i.coach}.`,
      amount: i.planAmount > 0 ? `In tutto: ${formatEuro(owed)} (${st.unpaidPeriods} periodi)` : null,
    };
  }
  if (st.state === "overdue") {
    return {
      kind: "renew",
      title: "Il tuo nuovo periodo è iniziato",
      text: `Dal ${i.formatDate(start)} è partito il periodo successivo e stiamo già lavorando insieme. Quando ti è comodo sistemiamo il rinnovo, nessuna fretta: basta un messaggio a ${i.coach}.`,
      amount: amount?.replace("Per il prossimo periodo", "Per questo periodo") ?? null,
    };
  }
  return {
    kind: "renew",
    title: st.daysLeft === 0 ? `Oggi si chiude il tuo ${noun}` : "Sta per iniziare il tuo nuovo periodo",
    text: `Il ${noun} in corso arriva fino al ${i.formatDate(st.dueDate)} e dal ${i.formatDate(start)} si riparte. Quando ti è comodo sistemiamo insieme il rinnovo, così continuiamo senza pensieri.`,
    amount,
  };
}

function sessionsNotice(i: Input): ClientNotice | null {
  // con un pacchetto le sessioni sono già nell'avviso del pacchetto
  if (!i.pt || i.kind === "package") return null;
  const uncovered = i.pt.used - i.pt.bought;
  if (uncovered <= 0 || uncovered > CLIENT_PT_LIMIT) return null;
  return {
    kind: "sessions",
    title: uncovered === 1 ? "C'è una sessione PT da sistemare" : `Ci sono ${uncovered} sessioni PT da sistemare`,
    text: `Abbiamo fatto ${uncovered === 1 ? "una sessione insieme che non è ancora stata saldata" : `${uncovered} sessioni insieme che non sono ancora state saldate`}. Nessuna fretta: quando ti è comodo ne parliamo con ${i.coach}.`,
    amount: i.ptPrice ? `In tutto: ${formatEuro(uncovered * i.ptPrice)}` : null,
  };
}

/** Gli avvisi da mostrare al cliente (al massimo due: rinnovo e sessioni PT). */
export function clientNotices(i: Input): ClientNotice[] {
  return [renewNotice(i), sessionsNotice(i)].filter((n): n is ClientNotice => n !== null);
}

/** Sessioni PT ancora da fare (pagate e non fatte), fuori dai pacchetti: per "Ti restano N sessioni PT". */
export function ptLeft(pt: { bought: number; used: number } | null, kind: PlanKind | null): number | null {
  if (!pt || kind === "package") return null;
  const left = pt.bought - pt.used;
  return left > 0 ? left : null;
}
