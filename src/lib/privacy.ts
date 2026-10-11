/**
 * Privacy: versione dell'informativa e dati del titolare.
 * Se cambi in modo sostanziale il testo di `components/privacy-notice.tsx`,
 * aggiorna PRIVACY_VERSION: ai clienti verrà chiesto di rileggerla.
 */
export const PRIVACY_VERSION = "2026-10-12";

export type PrivacyOwner = {
  businessName: string;
  legalName: string;
  legalAddress: string;
  legalTaxId: string;
  privacyEmail: string;
  /** PEC (facoltativa) per le richieste privacy */
  privacyPec?: string;
};

export type ConsentState = {
  privacy_accepted_at: string | null;
  privacy_version: string | null;
  health_consent_at: string | null;
};

/** Il cliente deve (ri)confermare informativa e consenso? */
export function needsConsent(c: ConsentState | null | undefined): boolean {
  if (!c) return true;
  return !c.privacy_accepted_at || !c.health_consent_at || c.privacy_version !== PRIVACY_VERSION;
}

const ownerName = (owner: Pick<PrivacyOwner, "legalName" | "businessName">) => owner.legalName.trim() || owner.businessName || "il titolare";

/**
 * Il consenso unico che si dà all'accesso (obbligatorio per usare l'app):
 * informativa letta, dati relativi alla salute (art. 9 GDPR) e foto e video
 * fatti durante gli allenamenti, solo per il servizio.
 */
export function healthConsentText(owner: Pick<PrivacyOwner, "legalName" | "businessName">): string {
  const who = ownerName(owner);
  return `Ho letto l'informativa e acconsento al trattamento dei miei dati relativi alla salute (misure corporee, pliche, valutazioni posturali, test, dolori o fastidi, sonno e stress) da parte di ${who} e dei collaboratori che mi seguono, per programmare e seguire il mio percorso di allenamento, anche con l'aiuto di strumenti di intelligenza artificiale, a cui non vengono comunicati il mio nome, il mio cognome e i miei contatti. Autorizzo inoltre foto e video che mi riguardano, fatti durante gli allenamenti o inviati da me in chat, usati solo per il servizio (correggere la tecnica, seguire i progressi) e mai pubblicati senza il mio permesso. So che posso revocare il consenso in qualsiasi momento.`;
}

/** Permesso facoltativo, a parte: pubblicare su Instagram video delle sedute insieme. */
export function instagramConsentText(owner: Pick<PrivacyOwner, "legalName" | "businessName">): string {
  const who = ownerName(owner);
  return `Facoltativo: autorizzo ${who} a pubblicare gratuitamente, nelle storie e nei contenuti Instagram (e sugli altri social del brand), alcuni video e foto degli allenamenti fatti insieme durante le sedute di personal training, per promuovere l'attività. Posso revocare il permesso quando voglio: vale per il futuro, quello che è già stato pubblicato resta.`;
}
