"use client";

import { useActionState } from "react";
import { ActionMessage, SubmitButton, type ActionState } from "@/components/form-bits";

export function InviteButton({ action, label }: { action: (s: ActionState) => Promise<ActionState>; label: string }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div><SubmitButton pendingText="Invio…" variant="secondary">{label}</SubmitButton></div>
      <ActionMessage state={state} />
    </form>
  );
}
