"use client";

/**
 * Sotto l'importo di un pagamento di coaching: se è diverso dal dovuto dice
 * cosa succede alla differenza e lascia scegliere (di serie: tienila).
 *  - ha pagato di più → resta come credito, il prossimo rinnovo costa meno
 *  - ha pagato di meno → si aggiunge al prossimo rinnovo
 * Togliendo la spunta il periodo è saldato così (prezzo diverso solo questa volta).
 */
import { formatEuro } from "@/lib/billing";

export function CreditHint({ paid, due, keep, onKeep }: { paid: number; due: number; keep: boolean; onKeep: (v: boolean) => void }) {
  if (!Number.isFinite(paid) || Math.abs(paid - due) < 0.005) return <input type="hidden" name="keep_difference" value="on" />;
  const more = paid > due;
  const diff = formatEuro(Math.abs(paid - due));
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl bg-sand px-4 py-3 text-[15px]" data-testid="credit-hint">
      <span>{more ? `Sono ${diff} in più del dovuto (${formatEuro(due)}).` : `Mancano ${diff} al dovuto (${formatEuro(due)}).`}</span>
      <label className="flex items-start gap-2.5">
        <input type="checkbox" checked={keep} onChange={(e) => onKeep(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[#1b1a17]" />
        <span>{more ? "Tienili come credito: il prossimo rinnovo costerà meno." : "Aggiungili al prossimo rinnovo."}</span>
      </label>
      {!keep ? <span className="text-sm text-muted">Il periodo si considera saldato così, senza {more ? "credito" : "altro da recuperare"}.</span> : null}
      <input type="hidden" name="keep_difference" value={keep ? "on" : "off"} />
    </div>
  );
}
