"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Input, Label } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { ActionMessage, SubmitButton } from "@/components/form-bits";
import { signIn } from "./actions";

export function LoginForm() {
  const [state, action] = useActionState(signIn, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <PasswordInput id="password" name="password" autoComplete="current-password" required />
      </div>
      <ActionMessage state={state} />
      <SubmitButton pendingText="Accesso…" className="mt-2 w-full">Entra</SubmitButton>
      <Link href="/password-dimenticata" className="mt-1 text-center text-sm font-semibold underline-offset-4 hover:underline">
        Password dimenticata?
      </Link>
    </form>
  );
}
