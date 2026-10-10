/**
 * Privacy: versione dell'informativa e dati del titolare.
 * Se cambi in modo sostanziale il testo di `components/privacy-notice.tsx`,
 * aggiorna PRIVACY_VERSION: ai clienti verrà chiesto di rileggerla.
 */
export const PRIVACY_VERSION = "2026-10-11";

export type PrivacyOwner = {
  businessName: string;
  legalName: string;
  legalAddress: string;
  legalTaxId: string;
  privacyEmail: string;
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

/** Testo del consenso esplicito per i dati relativi alla salute (art. 9 GDPR). */
export function healthConsentText(owner: Pick<PrivacyOwner, "legalName" | "businessName">): string {
  const who = owner.legalName.trim() || owner.businessName || "il titolare";
  return `Acconsento al trattamento dei miei dati relativi alla salute (misure corporee, pliche, valutazioni posturali, test, dolori o fastidi, sonno e stress, foto e video che invio) da parte di ${who} e dei collaboratori che mi seguono, per programmare e seguire il mio percorso di allenamento, anche con l'aiuto dell'assistente AI senza il mio nome e i miei contatti, come descritto nell'informativa. So che posso revocare il consenso in qualsiasi momento.`;
}
