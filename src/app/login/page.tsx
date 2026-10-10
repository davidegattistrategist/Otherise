import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { Notice } from "@/components/ui";
import { getMe, homeFor } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Accedi" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ errore?: string }> }) {
  const { errore } = await searchParams;
  const me = await getMe();
  if (me) redirect(homeFor(me.role));
  return (
    <AuthShell title="Ciao!" subtitle="Accedi con l'email e la password che hai scelto al primo accesso.">
      {errore === "link" ? (
        <div className="mb-4">
          <Notice tone="error">Il link non è più valido (dura 24 ore e si può usare una volta sola). Se hai già scelto la password entra qui sotto, altrimenti usa “Password dimenticata” o chiedi un nuovo invito.</Notice>
        </div>
      ) : null}
      <LoginForm />
    </AuthShell>
  );
}
