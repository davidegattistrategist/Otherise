"use client";

import { useActionState } from "react";
import { ActionMessage, SubmitButton } from "@/components/form-bits";
import { acceptPrivacy } from "./actions";

const box = "mt-0.5 h-5 w-5 shrink-0 accent-[#1b1a17]";

export function ConsentForm({ healthText }: { healthText: string }) {
  const [state, action] = useActionState(acceptPrivacy, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex gap-3 text-[15px] leading-relaxed">
        <input type="checkbox" name="read" required className={box} />
        <span>Ho letto l&apos;informativa sul trattamento dei miei dati.</span>
      </label>
      <label className="flex gap-3 text-[15px] leading-relaxed">
        <input type="checkbox" name="health" required className={box} />
        <span>{healthText}</span>
      </label>
      <ActionMessage state={state} />
      <SubmitButton pendingText="Un attimo…" className="w-full sm:w-auto">Conferma e continua</SubmitButton>
    </form>
  );
}
