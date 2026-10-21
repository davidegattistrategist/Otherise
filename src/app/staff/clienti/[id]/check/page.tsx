import { checkLabel } from "@/lib/check-order";
import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getStaffClient } from "@/lib/data/client";
import { staffBodyData } from "@/lib/data/checks";
import {
  formulaById,
  formulaUpgrade,
  formulasFor,
  protocolSites,
  siteLabel,
  sumOf,
  type Sex,
  type SkinfoldSite,
} from "@/lib/body/skinfolds";
import { BodyCharts, CheckCompare } from "@/components/body-progress";
import { StrengthTests } from "@/components/strength-tests";
import { strengthTestSeries } from "@/lib/strength/tests";
import { Button, Card, EmptyState, Eyebrow, Notice, fmtNum } from "@/components/ui";
import { ClearParams } from "@/components/clear-param";
import { setSkinfoldFormula } from "./actions";
import { startCheckMode } from "@/app/check/actions";
import { SexPrompt } from "./sex-prompt";
import { CheckPhotoUploader, PhotoAlbums, PhotoCompare } from "@/components/check-photos";
import { staffCheckPhotos } from "@/lib/check-photos";
import { IconPhoto } from "@/components/icons";
import { DailyWeight } from "@/components/daily-weight";
import { getWeights } from "@/lib/data/weights";
import { todayISO } from "@/lib/dates";

export const metadata: Metadata = { title: "Check" };

type SP = { salvato?: string; foto?: string; "formula-salvata"?: string };

const lower = (l: SkinfoldSite[]) => l.map((s) => siteLabel(s).toLowerCase()).join(", ");

export default async function ChecksPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params;
  const sp = await searchParams;
  await requireStaff();
  const client = await getStaffClient(id);
  // cliente creato senza indicare il sesso (spot, solo lezioni PT): prima si sceglie quello
  if (!client.sex) return <SexPrompt clientId={id} />;
  const supabase = await createClient();
  // foto: nell'elenco solo quante sono; si aprono dal check, dall'elenco qui sotto o nel confronto
  const [{ data: checks }, photos, weights] = await Promise.all([supabase
    .from("checks")
    .select("id, check_date, sequence, created_at, order_hint, age_years, skinfolds, weight_kg, body_fat_pct, fat_mass_kg, lean_mass_kg, body_fat_formula, circumferences, strength_tests, tests_text, notes_next_phase, visible_to_client")
    .eq("client_id", id)
    .order("check_date", { ascending: true }), staffCheckPhotos(supabase, id), getWeights(supabase, id)]);
  const sex = client.sex as Sex;
  const body = staffBodyData(checks ?? [], sex, client.birth_date, client.skinfold_formula);
  const list = body.list;
  const folds = list.map((c) => ({ averages: c.avg }));
  const manual = formulaById(client.skinfold_formula);
  const ref = body.ref;
  const upgrade = manual ? null : formulaUpgrade(sex, folds, ref);
  const withFolds = list.filter((c) => Object.keys(c.avg).length > 0);
  const photoAlbums = list.filter((c) => photos.get(c.id)?.length).map((c) => ({ id: c.id, title: checkLabel(c, 0), photos: photos.get(c.id)! }));

  return (
    <div className="flex flex-col gap-5">
      {sp.salvato ? (
        <>
          <ClearParams names={["salvato"]} />
          <Notice tone="success">
            <span className="block">Check salvato.{list.some((c) => c.id === sp.salvato) ? " Ora puoi aggiungere le foto: sceglile tutte insieme dalla galleria." : ""}</span>
            {list.some((c) => c.id === sp.salvato) ? <CheckPhotoUploader clientId={id} checkId={sp.salvato} label="Aggiungi le foto del check" variant="primary" className="mt-2" /> : null}
          </Notice>
        </>
      ) : null}
      {sp.foto ? <><ClearParams names={["foto"]} /><Notice tone="success">Check salvato{Number(sp.foto) > 0 ? ` con ${sp.foto === "1" ? "1 foto" : `${sp.foto} foto`}` : ""}.</Notice></> : null}
      {sp["formula-salvata"] ? <><ClearParams names={["formula-salvata"]} /><Notice tone="success">Formula aggiornata: ho ricalcolato la massa grassa di tutti i check.</Notice></> : null}
      {upgrade ? (
        <Card className="ring-1 ring-accent">
          <Eyebrow className="mb-2">Proposta</Eyebrow>
          <p className="text-[15px] leading-relaxed">
            {ref
              ? `Negli ultimi 3 check hai preso ${upgrade.sites.length === protocolSites(sex).length ? "tutte le pliche" : `anche ${lower(upgrade.sites.filter((s) => !ref.sites.includes(s)))}`}. Vuoi passare alla formula ${upgrade.label}? È più precisa. I check più vecchi, dove manca qualche plica, resteranno senza percentuale: li vedi ancora scegliendo “${ref.label}” nel grafico.`
              : `Negli ultimi 3 check hai preso ${lower(upgrade.sites)}: con la formula ${upgrade.label} si può stimare la massa grassa. Vuoi usarla? I check più vecchi resteranno senza percentuale.`}
          </p>
          <form action={setSkinfoldFormula.bind(null, id)} className="mt-3">
            <input type="hidden" name="formula" value={upgrade.id} />
            <Button type="submit" size="sm">Sì, passa a {upgrade.label.split(" (")[0]}</Button>
          </form>
        </Card>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
        <Link href={`/staff/clienti/${id}/check/nuovo`} className="text-sm font-semibold underline">Compila senza modalità check</Link>
        <form action={startCheckMode.bind(null, id, null)}><Button type="submit">Inizia il check</Button></form>
      </div>
      <p className="-mt-3 text-right text-xs text-muted">Modalità check: a tutto schermo, con confronti, programma e pagamenti a portata di mano, e insieme sul telefono e sul computer.</p>
      <div id="peso" className="scroll-mt-24"><DailyWeight entries={weights} today={todayISO()} clientId={id} staff /></div>
      {list.length === 0 ? (
        <EmptyState title="Ancora nessun check">Registra pliche, circonferenze e test: i grafici si costruiscono da soli.</EmptyState>
      ) : (
        <>
          <BodyCharts points={body.points} sumSites={body.sumSites} formulas={body.formulas} />
          <StrengthTests series={strengthTestSeries(checks ?? [])} title="Test di forza e performance" />
          <CheckCompare points={body.points} sumSites={body.sumSites} />
          {photoAlbums.length ? (
            <Card className="flex flex-col gap-2">
              <Eyebrow>Le foto dei check</Eyebrow>
              <PhotoAlbums albums={[...photoAlbums].reverse()} />
              <PhotoCompare albums={photoAlbums} />
            </Card>
          ) : null}

          {withFolds.length ? (
            <Card>
              <Eyebrow className="mb-2">Formula per la massa grassa</Eyebrow>
              <p className="mb-3 text-[15px] leading-relaxed text-muted">
                {ref
                  ? `Ora: ${ref.label}${manual ? ", scelta da te" : ", scelta in automatico: la più completa che si può usare in tutti i check"}. Tutti i check usano la stessa, così i numeri restano confrontabili.`
                  : "Con le pliche prese finora non c'è una formula validata che valga per tutti i check: si confrontano somma delle pliche, peso e circonferenze."}
              </p>
              <form action={setSkinfoldFormula.bind(null, id)} className="flex flex-wrap items-center gap-2">
                <label htmlFor="ref-formula" className="sr-only">Formula</label>
                <select key={client.skinfold_formula ?? "auto"} id="ref-formula" name="formula" defaultValue={client.skinfold_formula ?? ""} className="min-w-0 rounded-lg border border-sand-deep bg-sand px-2 py-2 text-[15px]">
                  <option value="">Automatica</option>
                  {formulasFor(sex).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
                <Button type="submit" size="sm" variant="secondary">Salva</Button>
              </form>
            </Card>
          ) : null}

          <div className="flex flex-col gap-3">
            {[...list].reverse().map((c) => {
              const tests = ((c.strength_tests as Array<{ exercise: string; e1rm: number | null; load: number | null; reps: number | null }>) ?? []).filter((t) => t.exercise);
              const measured = Object.keys(c.avg) as SkinfoldSite[];
              const missing = measured.length ? protocolSites(sex).filter((s) => c.avg[s] === undefined) : [];
              return (
                <div key={c.id} className="overflow-hidden rounded-[24px] bg-card">
                <Link href={`/staff/clienti/${id}/check/${c.id}`} className="block p-5 hover:bg-white">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-lg font-semibold">{checkLabel(c, 0)}</span>
                    <span className="text-sm text-muted">{c.visible_to_client ? "Visibile al cliente" : "Solo staff"}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[15px] empty:hidden">
                    {c.weight_kg !== null ? <span>Peso <strong className="tabular">{fmtNum(c.weight_kg)}</strong> kg</span> : null}
                    {measured.length ? <span>Pliche <strong className="tabular">{fmtNum(sumOf(c.avg, measured), 1)}</strong> mm</span> : null}
                    {c.body_fat_pct !== null ? <span>Grasso <strong className="tabular">{fmtNum(c.body_fat_pct, 2)}</strong> %</span> : null}
                    {c.lean_mass_kg !== null ? <span>Magra <strong className="tabular">{fmtNum(c.lean_mass_kg, 2)}</strong> kg</span> : null}
                  </div>
                  {missing.length ? <div className="mt-1 text-sm text-muted">Pliche non prese: {lower(missing)}</div> : null}
                  {tests.length ? <div className="mt-1.5 text-sm text-muted">{tests.map((t) => `${t.exercise}${t.e1rm ? ` ≈ ${fmtNum(t.e1rm)} kg` : t.load ? ` ${fmtNum(t.load)}×${t.reps ?? "?"}` : ""}`).join(" · ")}</div> : null}
                  {c.tests_text ? <div className="mt-1 text-sm whitespace-pre-line text-muted">{c.tests_text}</div> : null}
                  {c.notes_next_phase ? <div className="mt-2 line-clamp-3 text-sm whitespace-pre-line text-ink-soft" data-clamp-ok>Prossima fase: {c.notes_next_phase}</div> : null}
                  <div className="mt-2 flex items-center gap-1.5 text-sm text-muted">
                    <IconPhoto size={15} />
                    {photos.get(c.id)?.length ? `${photos.get(c.id)!.length} foto · le vedi aprendo il check` : "Nessuna foto: le aggiungi aprendo il check"}
                  </div>
                </Link>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
