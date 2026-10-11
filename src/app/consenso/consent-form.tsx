"use client";

import { useActionState } from "react";
import { ActionMessage, SubmitButton } from "@/components/form-bits";
import { acceptPrivacy } from "./actions";

const box = "mt-0.5 h-5 w-5 shrink-0 accent-[#1b1a17]";

/** Un solo consenso obbligatorio (informativa, salute, foto e video per il servizio) e il permesso facoltativo per Instagram. */
export function ConsentForm({ consentText, instagramText }: { consentText: string; instagramText: string }) {
  const [state, action] = useActionState(acceptPrivacy, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex gap-3 text-[15px] leading-relaxed">
        <input type="checkbox" name="consent" required className={box} />
        <span>{consentText}</span>
      </label>
      <label className="flex gap-3 border-t border-sand-deep pt-4 text-[15px] leading-relaxed">
        <input type="checkbox" name="instagram" className={box} />
        <span>{instagramText}</span>
      </label>
      <ActionMessage state={state} />
      <SubmitButton pendingText="Un attimo…" className="w-full sm:w-auto">Conferma e continua</SubmitButton>
    </form>
  );
}
