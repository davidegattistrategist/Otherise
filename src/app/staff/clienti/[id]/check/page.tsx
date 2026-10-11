import { checkLabel, sortChecks } from "@/lib/check-order";
import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CIRCUMFERENCES } from "@/lib/body/skinfolds";
import { LineChart } from "@/components/line-chart";
import { Card, EmptyState, Eyebrow, LinkButton, Notice, fmtNum } from "@/components/ui";
import { ClearParams } from "@/components/clear-param";

export const metadata: Metadata = { title: "Check" };

export default async function ChecksPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ salvato?: string; misura?: string }> }) {
  const { id } = await params;
  const { salvato, misura } = await searchParams;
  await requireStaff();
  const supabase = await createClient();
  const { data: checks } = await supabase
    .from("checks")
    .select("id, check_date, sequence, created_at, weight_kg, body_fat_pct, fat_mass_kg, lean_mass_kg, circumferences, strength_tests, tests_text, notes_next_phase, visible_to_client")
    .eq("client_id", id)
    .order("check_date", { ascending: true });
  const list = sortChecks(checks ?? []);
  const circKey = CIRCUMFERENCES.find((c) => c.key === misura)?.key ?? "vita";
  const series = (pick: (c: (typeof list)[number]) => number | null) =>
    list.map((c) => ({ date: c.check_date, value: pick(c) })).filter((p): p is { date: string; value: number } => Boolean(p.date) && p.value !== null && p.value !== undefined);

  return (
    <div className="flex flex-col gap-5">
      {salvato ? <><ClearParams names={["salvato"]} /><Notice tone="success">Check salvato.</Notice></> : null}
      <div className="flex justify-end"><LinkButton href={`/staff/clienti/${id}/check/nuovo`}>Nuovo check</LinkButton></div>
      {list.length === 0 ? (
        <EmptyState title="Ancora nessun check">Registra pliche, circonferenze e test: i grafici si costruiscono da soli.</EmptyState>
      ) : (
        <>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
            <Card><Eyebrow className="mb-2">Peso · kg</Eyebrow><LineChart label="Peso" unit="kg" points={series((c) => (c.weight_kg === null ? null : Number(c.weight_kg)))} /></Card>
            <Card><Eyebrow className="mb-2">Massa grassa · %</Eyebrow><LineChart label="Massa grassa" unit="%" points={series((c) => (c.body_fat_pct === null ? null : Number(c.body_fat_pct)))} /></Card>
            <Card><Eyebrow className="mb-2">Massa magra · kg</Eyebrow><LineChart label="Massa magra" unit="kg" points={series((c) => (c.lean_mass_kg === null ? null : Number(c.lean_mass_kg)))} /></Card>
            <Card>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <Eyebrow>Circonferenze · cm</Eyebrow>
                <form className="flex items-center gap-2">
                  <label htmlFor="misura" className="sr-only">Misura</label>
                  <select id="misura" name="misura" defaultValue={circKey} className="rounded-lg border border-sand-deep bg-sand px-2 py-1 text-sm">
                    {CIRCUMFERENCES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                  <button type="submit" className="text-sm font-semibold underline">Mostra</button>
                </form>
              </div>
              <LineChart label={CIRCUMFERENCES.find((c) => c.key === circKey)!.label} unit="cm" points={series((c) => (c.circumferences as Record<string, number>)?.[circKey] ?? null)} />
            </Card>
          </div>
          <div className="flex flex-col gap-3">
            {[...list].reverse().map((c) => {
              const tests = ((c.strength_tests as Array<{ exercise: string; e1rm: number | null; load: number | null; reps: number | null }>) ?? []).filter((t) => t.exercise);
              return (
                <Link key={c.id} href={`/staff/clienti/${id}/check/${c.id}`} className="block rounded-[24px] bg-card p-5 hover:bg-white">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-lg font-semibold">{checkLabel(c, 0)}</span>
                    <span className="text-sm text-muted">{c.visible_to_client ? "Visibile al cliente" : "Solo staff"}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[15px]">
                    <span>Peso <strong className="tabular">{fmtNum(c.weight_kg)}</strong> kg</span>
                    <span>Grasso <strong className="tabular">{fmtNum(c.body_fat_pct, 2)}</strong> %</span>
                    <span>Magra <strong className="tabular">{fmtNum(c.lean_mass_kg, 2)}</strong> kg</span>
                  </div>
                  {tests.length ? <div className="mt-1.5 text-sm text-muted">{tests.map((t) => `${t.exercise}${t.e1rm ? ` ≈ ${fmtNum(t.e1rm)} kg` : t.load ? ` ${fmtNum(t.load)}×${t.reps ?? "?"}` : ""}`).join(" · ")}</div> : null}
                  {c.tests_text ? <div className="mt-1 text-sm whitespace-pre-line text-muted">{c.tests_text}</div> : null}
                  {c.notes_next_phase ? <div className="mt-2 line-clamp-3 text-sm whitespace-pre-line text-ink-soft">Prossima fase: {c.notes_next_phase}</div> : null}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
