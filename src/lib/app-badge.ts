/**
 * Numerino rosso sull'icona dell'app (app sulla Home: iPhone con iOS 16.4 o
 * successivo e notifiche attive; computer con l'app installata da Chrome o
 * Edge; su Android il pallino lo decide il telefono dalle notifiche).
 * È lo stesso numero del pallino su Messaggi: per lo staff le chat a cui
 * rispondere, per il cliente i messaggi non letti. Dove non è supportato non
 * fa niente.
 */
export function showAppBadge(count: number) {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (count > 0 && nav.setAppBadge) void nav.setAppBadge(count).catch(() => undefined);
    else if (count <= 0 && nav.clearAppBadge) void nav.clearAppBadge().catch(() => undefined);
  } catch {
    // browser che non lo permette: nessun numerino, niente errori
  }
}
