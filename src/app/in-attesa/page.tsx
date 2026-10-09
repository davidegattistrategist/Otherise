import { AuthShell } from "@/components/auth-shell";
import { requireUser } from "@/lib/auth";
import { signOut } from "../login/actions";
import { redirect } from "next/navigation";
import { homeFor } from "@/lib/auth";

export default async function WaitingPage() {
  const me = await requireUser();
  if (me.role !== "none") redirect(homeFor(me.role));
  return (
    <AuthShell
      title="Account in attesa"
      subtitle={`Sei entrato come ${me.email}, ma questo account non è ancora collegato. Chiedi al tuo allenatore di invitarti con questa email.`}
    >
      <form action={signOut}>
        <button className="font-semibold underline" type="submit">Esci</button>
      </form>
    </AuthShell>
  );
}
