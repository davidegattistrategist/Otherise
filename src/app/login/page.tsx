import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { getMe, homeFor } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Accedi" };

export default async function LoginPage() {
  const me = await getMe();
  if (me) redirect(homeFor(me.role));
  return (
    <AuthShell title="Bentornato" subtitle="Accedi con l'email e la password che hai scelto al primo accesso.">
      <LoginForm />
    </AuthShell>
  );
}
