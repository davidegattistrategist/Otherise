import { checkLabel, sortChecks } from "@/lib/check-order";
import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getStaffClient } from "@/lib/data/client";
import { checkAge } from "@/lib/data/checks";
import {
  CIRCUMFERENCES,
  SKINFOLD_SITES,
  averagesOf,
  commonSites,
  computeBodyComposition,
  formulaById,
  formulaUpgrade,
  formulasFor,
  protocolSites,
  referenceFormula,
  siteLabel,
  sumOf,
  type Sex,
  type SkinfoldReadings,
  type SkinfoldSite,
} from "@/lib/body/skinfolds";
import { LineChart } from "@/components/line-chart";
import { Button, Card, EmptyState, Eyebrow, LinkButton, Notice, fmtNum } from "@/components/ui";
import { ClearParams } from "@/components/clear-param";
import { setSkinfoldFormula } from "./actions";
import { SexPrompt } from "./sex-prompt";
import { CheckPhotoUploader } from "@/components/check-photos";
import { IconPhoto } from "@/components/icons";

export const metadata: Metadata = { title: "Check" };

type SP = { salvato?: string; foto?: string; misura?: string; formula?: string; plica?: string; "formula-salvata"?: string };

/** Filtro del grafico che tiene gli altri filtri già scelti. */
function ChartFilter({ name, value, options, keep, label, wide }: { name: keyof SP; value: string; options: Array<{ value: string; label: string }>; keep: Record<string, string>; label: string; wide?: boolean }) {
  return (
    <form className={`flex min-w-0 items-center gap-2 ${wide ? "w-full" : ""}`}>
      {Object.entries(keep).filter(([k, v]) => k !== name && v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label htmlFor={`f-${name}`} className="sr-only">{label}</label>
      <select key={value} id={`f-${name}`} name={name} defaultValue={value} className={`${wide ? "flex-1" : "max-w-[12rem]"} min-w-0 rounded-lg border border-sand-deep bg-sand px-2 py-1 text-sm`}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <button type="submit" className="min-h-10 px-2 text-sm font-semibold underline">Mostra</button>
    </form>
  );
}

const lower = (l: SkinfoldSite[]) => l.map((s) => siteLabel(s).toLowerCase()).join(", ");

export default async function ChecksPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params;
  const sp = await searchParams;
  await requireStaff();
  const client = await getStaffClient(id);
  // cliente creato senza indicare il sesso (spot, solo lezioni PT): prima si sceglie quello
  if (!client.sex) return <SexPrompt clientId={id} />;
  const supabase = await createClient();
  const { data: checks } = await supabase
    .from("checks")
    .select("id, check_date, sequence, created_at, order_hint, age_years, skinfolds, weight_kg, body_fat_pct, fat_mass_kg, lean_mass_kg, body_fat_formula, circumferences, strength_tests, tests_text, notes_next_phase, visible_to_client")
    .eq("client_id", id)
    .order("check_date", { ascending: true });
  // nell'elenco solo quante foto ha ogni check (si guardano aprendo il check)
  const { data: photoRows } = await supabase.from("check_photos").select("check_id").eq("client_id", id);
  const photos = new Map<string, { length: number }>();
  for (const r of photoRows ?? []) photos.set(r.check_id, { length: (photos.get(r.check_id)?.length ?? 0) + 1 });
  const sex = client.sex as Sex;
  const list = sortChecks(checks ?? []).map((c) => ({ ...c, avg: averagesOf(c.skinfolds as SkinfoldReadings) }));
  const folds = list.map((c) => ({ averages: c.avg }));
  const manual = formulaById(client.skinfold_formula);
  const ref = referenceFormula(sex, folds, client.skinfold_formula);
  const upgrade = manual ? null : formulaUpgrade(sex, folds, ref);
  const dated = list.filter((c) => c.check_date);

  // formule che si possono usare in almeno un check con data (per il grafico)
  const usable = formulasFor(sex).filter((f) => dated.some((c) => f.sites.every((s) => c.avg[s] !== undefined)));
  const shown = usable.find((f) => f.id === sp.formula) ?? (ref && usable.includes(ref) ? ref : usable[0] ?? null);
  const comp = (c: (typeof list)[number]) =>
    shown ? computeBodyComposition({ sex, age: checkAge(c, client.birth_date), weightKg: c.weight_kg === null ? null : Number(c.weight_kg), skinfolds: c.skinfolds as SkinfoldReadings, formula: shown.id }) : null;
  const comps = new Map(dated.map((c) => [c.id, comp(c)]));
  const pick = (c: (typeof list)[number], k: "bodyFatPct" | "leanMassKg") => {
    const r = comps.get(c.id);
    return r?.ok && !r.fallback ? r[k] : null;
  };

  const withFolds = list.filter((c) => Object.keys(c.avg).length > 0);
  const common = commonSites(sex, folds);
  const sumSites = common.length ? common : protocolSites(sex);
  const plica = SKINFOLD_SITES.find((s) => s.key === sp.plica && withFolds.some((c) => c.avg[s.key] !== undefined))?.key ?? null;

  const circKey = CIRCUMFERENCES.find((c) => c.key === sp.misura)?.key ?? "vita";
  const keep = { misura: sp.misura ?? "", formula: sp.formula ?? "", plica: sp.plica ?? "" };
  const series = (get: (c: (typeof list)[number]) => number | null) =>
    dated.map((c) => ({ date: c.check_date!, value: get(c) })).filter((p): p is { date: string; value: number } => p.value !== null && p.value !== undefined);

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
      <div className="flex justify-end"><LinkButton href={`/staff/clienti/${id}/check/nuovo`}>Nuovo check</LinkButton></div>
      {list.length === 0 ? (
        <EmptyState title="Ancora nessun check">Registra pliche, circonferenze e test: i grafici si costruiscono da soli.</EmptyState>
      ) : (
        <>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
            <Card><Eyebrow className="mb-2">Peso · kg</Eyebrow><LineChart label="Peso" unit="kg" points={series((c) => (c.weight_kg === null ? null : Number(c.weight_kg)))} /></Card>
            {shown ? (
              <>
                <Card>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <Eyebrow>Massa grassa · %</Eyebrow>
                    {usable.length > 1 ? <ChartFilter wide name="formula" label="Formula" value={shown.id} keep={keep} options={usable.map((f) => ({ value: f.id, label: f.id === ref?.id ? `${f.label} · riferimento` : f.label }))} /> : null}
                  </div>
                  <LineChart label="Massa grassa" unit="%" points={series((c) => pick(c, "bodyFatPct"))} />
                  {shown.id !== ref?.id ? <p className="mt-1 text-xs text-muted">Formula diversa da quella di riferimento: i numeri non coincidono con quelli dei check.</p> : null}
                </Card>
                <Card><Eyebrow className="mb-2">Massa magra · kg</Eyebrow><LineChart label="Massa magra" unit="kg" points={series((c) => pick(c, "leanMassKg"))} /></Card>
              </>
            ) : null}
            {withFolds.length ? (
              <Card>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <Eyebrow>Pliche · mm</Eyebrow>
                  <ChartFilter
                    name="plica"
                    label="Plica"
                    value={plica ?? ""}
                    keep={keep}
                    options={[{ value: "", label: "Somma" }, ...SKINFOLD_SITES.filter((s) => withFolds.some((c) => c.avg[s.key] !== undefined)).map((s) => ({ value: s.key, label: s.label }))]}
                  />
                </div>
                <LineChart label={plica ? siteLabel(plica) : "Somma pliche"} unit="mm" points={series((c) => (plica ? c.avg[plica] ?? null : sumSites.every((s) => c.avg[s] !== undefined) ? sumOf(c.avg, sumSites) : null))} />
                {!plica ? <p className="mt-1 text-xs text-muted">Somma di {lower(sumSites)}{common.length ? ", le pliche prese in tutti i check" : ""}.</p> : null}
              </Card>
            ) : null}
            <Card>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <Eyebrow>Circonferenze · cm</Eyebrow>
                <ChartFilter name="misura" label="Misura" value={circKey} keep={keep} options={CIRCUMFERENCES.map((c) => ({ value: c.key, label: c.label }))} />
              </div>
              <LineChart label={CIRCUMFERENCES.find((c) => c.key === circKey)!.label} unit="cm" points={series((c) => (c.circumferences as Record<string, number>)?.[circKey] ?? null)} />
            </Card>
          </div>

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
                  {c.notes_next_phase ? <div className="mt-2 line-clamp-3 text-sm whitespace-pre-line text-ink-soft">Prossima fase: {c.notes_next_phase}</div> : null}
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
