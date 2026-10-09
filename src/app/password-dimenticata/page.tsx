"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Input, Label } from "@/components/ui";
import { ActionMessage, SubmitButton } from "@/components/form-bits";
import { sendReset } from "../login/actions";

export default function ForgotPage() {
  const [state, action] = useActionState(sendReset, null);
  return (
    <AuthShell title="Nuova password" subtitle="Ti mandiamo un link per sceglierne una nuova.">
      <form action={action} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <ActionMessage state={state} />
        <SubmitButton pendingText="Invio…" className="w-full">Mandami il link</SubmitButton>
        <Link href="/login" className="text-center text-sm font-semibold underline-offset-4 hover:underline">Torna all&apos;accesso</Link>
      </form>
    </AuthShell>
  );
}
