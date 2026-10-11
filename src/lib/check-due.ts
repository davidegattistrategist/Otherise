import { addDays, diffDays, type ISODate } from "./dates";

/**
 * Check da fare: solo per chi fa i check nell'app (almeno uno registrato lì) e
 * ha una fase in corso. Compare dall'ultima settimana della fase finché non
 * c'è un check fatto verso la fine della fase (dalle ultime 2 settimane in poi).
 */
export function checkDue(
  c: { checksInApp: boolean; lastCheck: ISODate | null; program: { endDate: ISODate; state: string } | null },
  today: ISODate,
): { text: string; late: boolean } | null {
  if (!c.checksInApp || !c.program || c.program.state === "not_started") return null;
  const left = diffDays(today, c.program.endDate);
  if (left > 7) return null;
  if (c.lastCheck && c.lastCheck >= addDays(c.program.endDate, -14)) return null;
  if (left > 0) return { text: left === 1 ? "La fase finisce domani" : `La fase finisce tra ${left} giorni`, late: false };
  if (left === 0) return { text: "La fase finisce oggi", late: false };
  return { text: -left === 1 ? "Fase finita ieri" : `Fase finita da ${-left} giorni`, late: true };
}

