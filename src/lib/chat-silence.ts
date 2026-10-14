/**
 * "Non senti X da N giorni": dopo 10 giorni senza messaggi in chat (solo se la
 * chat è già iniziata) il cliente compare in Oggi e arriva UNA notifica.
 * Da Oggi il trainer può rimandare di 5 giorni: sparisce dalla card e, se nel
 * frattempo non vi siete scritti, torna con una nuova notifica.
 * Funzioni pure (testate in lib.test.ts).
 */
import { addDays, diffDays, type ISODate } from "./dates";

export const CHAT_SILENCE_DAYS = 10;
export const CHAT_SNOOZE_DAYS = 5;
/** Se il controllo del mattino salta un giorno, l'avviso parte nei giorni subito dopo. */
const GRACE_DAYS = 2;

/** Il giorno (ora italiana) di un istante, AAAA-MM-GG. */
export function romeDay(at: string): ISODate {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
}

export type Silence = { days: number; lastDay: ISODate };

/**
 * Il silenzio in corso, se c'è e non è rimandato. `snoozedUntil` vale solo per
 * il silenzio in cui è stato deciso (dopo l'ultimo messaggio).
 */
export function chatSilence(lastDay: ISODate | null, today: ISODate, snoozedUntil: ISODate | null): Silence | null {
  if (!lastDay) return null;
  const days = diffDays(lastDay, today);
  if (days <= CHAT_SILENCE_DAYS) return null;
  if (snoozedUntil && snoozedUntil > lastDay && today < snoozedUntil) return null;
  return { days, lastDay };
}

/** La notifica da mandare oggi (chiave per non ripeterla), oppure null. */
export function chatSilenceAlert(clientId: string, lastDay: ISODate | null, today: ISODate, snoozedUntil: ISODate | null): { key: string; days: number } | null {
  const s = chatSilence(lastDay, today, snoozedUntil);
  if (!s) return null;
  if (snoozedUntil && snoozedUntil > s.lastDay) {
    // rimandato e non vi siete scritti: un nuovo avviso il giorno in cui scade il rimando
    return diffDays(snoozedUntil, today) <= GRACE_DAYS ? { key: `silence:${clientId}:${s.lastDay}:rimandato:${snoozedUntil}`, days: s.days } : null;
  }
  // la prima volta che passano i 10 giorni
  return s.days - CHAT_SILENCE_DAYS <= 1 + GRACE_DAYS ? { key: `silence:${clientId}:${s.lastDay}`, days: s.days } : null;
}

export function snoozeUntil(today: ISODate): ISODate {
  return addDays(today, CHAT_SNOOZE_DAYS);
}
