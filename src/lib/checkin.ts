/**
 * Check-up settimanale: domande, finestra di compilazione e soglie.
 * Le soglie che fanno scattare l'avviso sono nel database (funzione
 * flag_checkin): voto 1–2, calo di 2 punti rispetto alla settimana
 * prima, oppure una richiesta scritta.
 */
import { addDays, isoWeekday, mondayOf, type ISODate } from "./dates";

export const CHECKIN_QUESTIONS = [
  { key: "training", label: "Come sono andati gli allenamenti questa settimana?", short: "Allenamenti" },
  { key: "sleep", label: "Come sono andati sonno e recupero?", short: "Sonno" },
  { key: "stress", label: "Come hai gestito stress e impegni?", short: "Stress" },
  { key: "adherence", label: "Come è andata con il percorso (alimentazione, abitudini)?", short: "Percorso" },
] as const;

export type CheckinKey = (typeof CHECKIN_QUESTIONS)[number]["key"];

export const SCORE_LABELS: Record<number, string> = {
  1: "Male",
  2: "Non bene",
  3: "Così così",
  4: "Bene",
  5: "Benissimo",
};

/** Da venerdì a domenica si compila il check-up della settimana in corso. */
export const CHECKIN_OPENS_ON = 5;

/** Settimana a cui si riferisce il check-up compilabile oggi (null se oggi non è il momento). */
export function checkinWeekFor(today: ISODate): ISODate | null {
  return isoWeekday(today) >= CHECKIN_OPENS_ON ? mondayOf(today) : null;
}

export function checkinDeadline(weekStart: ISODate): ISODate {
  return addDays(weekStart, 6);
}
