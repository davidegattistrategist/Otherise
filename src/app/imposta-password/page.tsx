"use client";

import { useActionState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Input, Label } from "@/components/ui";
import { ActionMessage, SubmitButton } from "@/components/form-bits";
import { setPassword } from "../login/actions";

export default function SetPasswordPage() {
  const [state, action] = useActionState(setPassword, null);
  return (
    <AuthShell title="Scegli la password" subtitle="La userai per entrare da telefono e computer. Almeno 8 caratteri.">
      <form action={action} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="password">Nuova password</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        <div>
          <Label htmlFor="confirm">Ripeti la password</Label>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        <ActionMessage state={state} />
        <SubmitButton className="w-full">Salva e entra</SubmitButton>
      </form>
    </AuthShell>
  );
}
