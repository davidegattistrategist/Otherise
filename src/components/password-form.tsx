"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePassword } from "@/app/login/actions";
import { ActionMessage, SubmitButton } from "./form-bits";
import { Input, Label } from "./ui";

export function PasswordForm() {
  const [state, action] = useActionState(changePassword, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-3">
      <div>
        <Label htmlFor="new-password">Nuova password</Label>
        <Input id="new-password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <div>
        <Label htmlFor="confirm-password">Ripeti la password</Label>
        <Input id="confirm-password" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <ActionMessage state={state} />
      <div><SubmitButton variant="secondary" size="sm">Cambia password</SubmitButton></div>
    </form>
  );
}
