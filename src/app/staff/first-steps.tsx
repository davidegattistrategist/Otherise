/**
 * "Primi passi" per un'installazione nuova: compare al titolare nella pagina
 * Oggi finché non ha sistemato le cose essenziali, poi sparisce da sola.
 */
import Link from "next/link";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { Me } from "@/lib/auth";
import { Button, Card, Eyebrow, Input, cx } from "@/components/ui";
import { renameStaff } from "./team/actions";

export async function FirstSteps({ supabase, me }: { supabase: ServerSupabase; me: Me }) {
  if (me.role !== "owner") return null;
  const [{ data: s }, { count: exercises }, { count: clients }] = await Promise.all([
    supabase.from("app_settings").select("legal_name, legal_address, legal_tax_id, privacy_email, coaching_method").maybeSingle(),
    supabase.from("exercises").select("id", { count: "exact", head: true }),
    supabase.from("clients").select("id", { count: "exact", head: true }),
  ]);
  const defaultName = !me.fullName.trim() || me.fullName.trim() === me.email.split("@")[0];
  const steps = [
    { key: "name", done: !defaultName, title: "Scrivi il tuo nome", text: "Lo vedono i clienti nei messaggi e negli avvisi." },
    { key: "privacy", done: Boolean(s?.legal_name && s.legal_address && s.legal_tax_id && s.privacy_email), title: "Completa i dati per l'informativa privacy", text: "Titolare, indirizzo, P. IVA o codice fiscale, email.", href: "/staff/impostazioni#privacy" },
    { key: "exercises", done: (exercises ?? 0) > 0, title: "Importa l'eserciziario", text: "Circa 175 esercizi con video, con un clic.", href: "/staff/eserciziario" },
    { key: "method", done: Boolean(s?.coaching_method?.trim()), title: "Scrivi il tuo metodo per l'assistente AI", text: "Più è preciso, più le bozze ti somigliano.", href: "/staff/impostazioni" },
    { key: "client", done: (clients ?? 0) > 0, title: "Crea il primo cliente", text: "Poi lo inviti con un clic dalla sua scheda.", href: "/staff/clienti/nuovo" },
  ];
  const done = steps.filter((x) => x.done).length;
  if (done === steps.length) return null;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Eyebrow>Primi passi</Eyebrow>
        <span className="text-sm text-muted">{done} di {steps.length} fatti</span>
      </div>
      <ol className="flex flex-col">
        {steps.map((x, i) => (
          <li key={x.key} className="flex gap-3 border-t border-sand-deep py-3 first:border-t-0">
            <span className={cx("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold", x.done ? "bg-ink text-card" : "bg-sand-deep text-ink")} aria-hidden="true">
              {x.done ? "✓" : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              {x.done || !x.href ? (
                <span className={cx("font-semibold", x.done && "text-muted line-through")}>{x.title}</span>
              ) : (
                <Link href={x.href} className="font-semibold underline">{x.title}</Link>
              )}
              {!x.done ? <p className="text-sm text-muted">{x.text}</p> : null}
              {x.key === "name" && !x.done ? (
                <form action={renameStaff.bind(null, me.id)} className="mt-2 flex flex-wrap gap-2">
                  <label htmlFor="first-steps-name" className="sr-only">Nome e cognome</label>
                  <Input id="first-steps-name" name="full_name" required placeholder="Nome e cognome" className="max-w-xs" />
                  <Button type="submit" size="sm">Salva</Button>
                </form>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
