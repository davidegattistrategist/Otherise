"use client";

import { useActionState } from "react";
import { ActionMessage, SubmitButton, type ActionState } from "@/components/form-bits";
import { TypedEmail } from "./typed-email";

export function InviteButton({ action, label }: { action: (s: ActionState, fd: FormData) => Promise<ActionState>; label: string }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <TypedEmail />
      <div><SubmitButton pendingText="Invio…" variant="secondary">{label}</SubmitButton></div>
      <ActionMessage state={state} />
    </form>
  );
}
