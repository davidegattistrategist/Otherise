import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatWithWeekday, todayISO } from "@/lib/dates";
import { Card, EmptyState, Eyebrow } from "@/components/ui";
import { ConfirmButton } from "@/components/form-bits";
import { SessionForm } from "./session-form";
import { getExtraSessions } from "@/lib/data/billing";
import { formatEuro } from "@/lib/billing";
import { deletePtSession, savePtSession } from "./actions";

export const metadata: Metadata = { title: "Sessioni PT" };

export default async function PtSessionsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ modifica?: string }> }) {
  const { id } = await params;
  const { modifica } = await searchParams;
  await requireStaff();
  const supabase = await createClient();
  const today = todayISO();
  const { data: sessions } = await supabase
    .from("pt_sessions")
    .select("id, session_date, notes, counts_toward_package")
    .eq("client_id", id)
    .order("session_date", { ascending: false })
    .order("created_at", { ascending: false });
  const list = sessions ?? [];
  // "Conta nel pacchetto" serve solo ai clienti con un pacchetto di sessioni
  // (il collaboratore non vede i piani: per lui resta visibile)
  const { data: plan } = await supabase.from("payment_plans").select("kind").eq("client_id", id).eq("active", true).maybeSingle();
  // sessioni PT extra pagate a parte (solo il titolare le vede)
  const extra = await getExtraSessions(supabase, id);
  const showPackage = !plan || plan.kind === "package" || Boolean(extra);
  const packageLabel = extra ? "Conta tra le sessioni PT a parte" : "Conta nel pacchetto";
  const thisMonth = list.filter((s) => s.session_date.slice(0, 7) === today.slice(0, 7)).length;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <Card id="nuova" className="flex flex-col gap-4 lg:sticky lg:top-6">
        <div>
          <Eyebrow>Nuova sessione</Eyebrow>
          <p className="mt-1.5 text-sm text-muted">Due righe a fine allenamento bastano: l&apos;assistente AI le userà per preparare il prossimo programma. Il cliente non le vede.</p>
        </div>
        {extra ? (
          <div className="rounded-2xl bg-sand px-4 py-3 text-[15px]">
            <span className="font-semibold">
              Sessioni PT a parte:{" "}
              {extra.due > 0
                ? `${extra.due} da saldare${extra.dueAmount !== null ? ` (${formatEuro(extra.dueAmount)})` : ""}`
                : extra.left > 0
                  ? extra.left === 1 ? "ne resta 1 pagata" : `ne restano ${extra.left} pagate`
                  : "in pari"}
            </span>
          </div>
        ) : null}
        <SessionForm action={savePtSession.bind(null, id, null)} today={today} showPackage={showPackage} packageLabel={packageLabel} />
      </Card>

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between px-1">
          <Eyebrow>Storico</Eyebrow>
          <span className="text-sm text-muted">{list.length} in totale · {thisMonth} questo mese</span>
        </div>
        {list.length === 0 ? (
          <EmptyState title="Nessuna sessione registrata">{showPackage ? "Le sessioni che “contano nel pacchetto” scalano le sessioni rimaste ai clienti con pacchetto." : "Qui trovi lo storico delle sessioni in palestra con le tue note."}</EmptyState>
        ) : (
          list.map((s) =>
            modifica === s.id ? (
              <Card key={s.id} className="flex flex-col gap-3">
                <Eyebrow>Modifica sessione</Eyebrow>
                <SessionForm compact action={savePtSession.bind(null, id, s.id)} today={today} values={s} showPackage={showPackage} packageLabel={packageLabel} />
                <a href={`/staff/clienti/${id}/sessioni`} className="text-sm font-semibold underline">Chiudi</a>
              </Card>
            ) : (
              <Card key={s.id} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">{formatWithWeekday(s.session_date)}</span>
                  {showPackage ? <span className="text-sm text-muted">{s.counts_toward_package ? (extra ? "Conta" : "Conta nel pacchetto") : extra ? "Non conta" : "Fuori pacchetto"}</span> : null}
                </div>
                {s.notes ? <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink-soft">{s.notes}</p> : <p className="text-sm text-muted">Nessuna nota.</p>}
                <div className="flex gap-4 pt-1">
                  <a href={`/staff/clienti/${id}/sessioni?modifica=${s.id}`} className="text-sm font-semibold underline">Modifica</a>
                  <form action={deletePtSession.bind(null, id, s.id)}>
                    <ConfirmButton variant="ghost" message="Eliminare questa sessione?">Elimina</ConfirmButton>
                  </form>
                </div>
              </Card>
            ),
          )
        )}
      </div>
    </div>
  );
}
