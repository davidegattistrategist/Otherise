import { formatLong } from "@/lib/dates";
import { Card, Dot, Eyebrow, buttonClass } from "@/components/ui";
import { ConfirmButton } from "@/components/form-bits";
import { IconDownload } from "@/components/icons";
import { recordPaperConsent } from "./privacy-actions";

type Props = {
  clientId: string;
  isOwner: boolean;
  consent: { health_consent_at: string | null; consent_source: string | null; ai_opt_out: boolean };
};

export function PrivacyStaffCard({ clientId, isOwner, consent }: Props) {
  const ok = Boolean(consent.health_consent_at);
  return (
    <Card className="flex flex-col gap-3">
      <Eyebrow>Privacy</Eyebrow>
      <div className="flex items-center gap-2 text-[15px] font-semibold">
        <Dot tone={ok ? "ink" : "accent"} />
        {ok
          ? `Consenso dati salute: ${formatLong(consent.health_consent_at!.slice(0, 10))}${consent.consent_source === "paper" ? " (su carta)" : " (nell'app)"}`
          : "Consenso sui dati di salute non ancora dato"}
      </div>
      {consent.ai_opt_out ? <p className="text-sm text-muted">Il cliente ha chiesto di non usare l&apos;assistente AI con i suoi dati: per lui l&apos;AI è disattivata.</p> : null}
      {!ok ? (
        <>
          <p className="text-sm leading-relaxed text-muted">
            Il cliente lo conferma al primo accesso nell&apos;app. Se raccogli dati prima (per esempio al primo check), fagli firmare il modulo su carta e segnalo qui.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href="/privacy/modulo" target="_blank" className={buttonClass("secondary", "sm")}>Modulo da stampare</a>
            <form action={recordPaperConsent.bind(null, clientId)}>
              <ConfirmButton variant="secondary" message="Confermi che il cliente ha firmato l'informativa e il consenso su carta? Conserva il foglio firmato.">Firmato su carta</ConfirmButton>
            </form>
          </div>
        </>
      ) : null}
      {isOwner ? (
        <div className="border-t border-sand-deep pt-3">
          <a href={`/api/clienti/${clientId}/export`} className={buttonClass("secondary", "sm")}><IconDownload size={16} /> Scarica tutti i suoi dati</a>
          <p className="mt-2 text-xs text-muted">Per una richiesta di accesso o portabilità: un file con tutto quello che l&apos;app conserva su questo cliente.</p>
        </div>
      ) : null}
    </Card>
  );
}
