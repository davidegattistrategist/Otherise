"use client";

/**
 * Modulo del check: pliche (3 rilevazioni per sito, media automatica),
 * circonferenze, test di forza con massimale stimato, test liberi e note.
 * I risultati si aggiornano mentre scrivi; il server li ricalcola al salvataggio.
 */
import { useActionState, useMemo, useState } from "react";
import { CIRCUMFERENCES, SKINFOLD_SITES, computeBodyComposition, protocolSites, siteAverage, type Sex, type SkinfoldSite } from "@/lib/body/skinfolds";
import { estimateOneRepMax, RPE_VALUES } from "@/lib/strength/e1rm";
import { ageOn } from "@/lib/dates";
import { Card, Eyebrow, Input, Label, Textarea, fmtNum } from "@/components/ui";
import { ActionMessage, SubmitButton, type ActionState } from "@/components/form-bits";

export type CheckValues = {
  check_date: string;
  weight_kg: number | null;
  skinfolds: Partial<Record<SkinfoldSite, Array<number | null>>>;
  circumferences: Record<string, number>;
  strength_tests: Array<{ exercise: string; load: number | null; reps: number | null; rpe: number | null }>;
  tests_text: string;
  notes_next_phase: string;
  visible_to_client: boolean;
};

const toNum = (s: string) => {
  const n = Number(s.replace(",", "."));
  return s.trim() && Number.isFinite(n) ? n : null;
};

export function CheckForm({
  action,
  sex,
  birthDate,
  values,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  sex: Sex;
  birthDate: string | null;
  values: CheckValues;
}) {
  const [state, formAction] = useActionState(action, null);
  const [date, setDate] = useState(values.check_date);
  const [weight, setWeight] = useState(values.weight_kg?.toString().replace(".", ",") ?? "");
  const [sf, setSf] = useState<Record<string, string[]>>(() => {
    const out: Record<string, string[]> = {};
    for (const s of SKINFOLD_SITES) out[s.key] = [0, 1, 2].map((i) => values.skinfolds[s.key]?.[i]?.toString().replace(".", ",") ?? "");
    return out;
  });
  const [tests, setTests] = useState(() => {
    const t = values.strength_tests.map((x) => ({ exercise: x.exercise, load: x.load?.toString() ?? "", reps: x.reps?.toString() ?? "", rpe: x.rpe?.toString() ?? "" }));
    while (t.length < 4) t.push({ exercise: "", load: "", reps: "", rpe: "" });
    return t;
  });

  const sites = protocolSites(sex);
  const age = ageOn(birthDate, date);
  const comp = useMemo(() => {
    const readings: Partial<Record<SkinfoldSite, Array<number | null>>> = {};
    for (const s of sites) readings[s] = sf[s].map(toNum);
    return computeBodyComposition({ sex, age, weightKg: toNum(weight), skinfolds: readings });
  }, [sf, sites, sex, age, weight]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Card>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="check_date">Data</Label>
            <Input id="check_date" name="check_date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="weight_kg" hint="kg">Peso</Label>
            <Input id="weight_kg" name="weight_kg" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="65,5" />
          </div>
          <div className="flex items-end text-sm text-muted">{age !== null ? `${age} anni alla data del check` : "Manca la data di nascita nella scheda: serve per la percentuale di grasso."}</div>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <Eyebrow>Pliche in mm · {sex === "M" ? "uomo, 7 pliche" : "donna, 5 pliche"}</Eyebrow>
          <span className="text-sm text-muted">3 rilevazioni per plica, la media è automatica</span>
        </div>
        <div className="scroll-x">
          <table className="w-full min-w-[520px] border-collapse text-[15px]">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th scope="col" className="py-2 font-semibold">Plica</th>
                <th scope="col" className="px-1 py-2 font-semibold">1ª</th>
                <th scope="col" className="px-1 py-2 font-semibold">2ª</th>
                <th scope="col" className="px-1 py-2 font-semibold">3ª</th>
                <th scope="col" className="py-2 pl-3 text-right font-semibold">Media</th>
              </tr>
            </thead>
            <tbody>
              {SKINFOLD_SITES.filter((s) => sites.includes(s.key)).map((s) => {
                const avg = siteAverage(sf[s.key].map(toNum));
                return (
                  <tr key={s.key} className="border-t border-sand-deep">
                    <th scope="row" className="py-2 text-left font-semibold">{s.label}</th>
                    {[0, 1, 2].map((i) => (
                      <td key={i} className="px-1 py-1.5">
                        <input
                          aria-label={`${s.label}, rilevazione ${i + 1}`}
                          name={`sf_${s.key}_${i}`}
                          inputMode="decimal"
                          value={sf[s.key][i]}
                          onChange={(e) => setSf((v) => ({ ...v, [s.key]: v[s.key].map((x, j) => (j === i ? e.target.value : x)) }))}
                          className="w-full rounded-lg border border-sand-deep bg-sand px-2 py-2 text-center text-base"
                        />
                      </td>
                    ))}
                    <td className="py-2 pl-3 text-right font-semibold tabular">{avg !== null ? fmtNum(avg, 2) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-5 rounded-2xl bg-ink p-5 text-card">
          {comp.ok ? (
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(120px,1fr))]">
              <Result label="Somma pliche" value={`${fmtNum(comp.sumMm, 2)} mm`} />
              <Result label="Massa grassa" value={`${fmtNum(comp.bodyFatPct, 2)} %`} />
              <Result label="Massa grassa" value={comp.fatMassKg !== null ? `${fmtNum(comp.fatMassKg, 2)} kg` : "serve il peso"} />
              <Result label="Massa magra" value={comp.leanMassKg !== null ? `${fmtNum(comp.leanMassKg, 2)} kg` : "serve il peso"} />
            </div>
          ) : (
            <p className="text-[15px] leading-relaxed text-muted-dark">
              {comp.missing.length
                ? `Per calcolare la percentuale di grasso servono tutte le pliche. Mancano: ${comp.missing.map((m) => SKINFOLD_SITES.find((s) => s.key === m)!.label.toLowerCase()).join(", ")}.`
                : comp.reason}{" "}
              Puoi comunque salvare il check.
            </p>
          )}
        </div>
      </Card>

      <Card>
        <Eyebrow className="mb-4">Circonferenze in cm</Eyebrow>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))]">
          {CIRCUMFERENCES.map((c) => (
            <div key={c.key}>
              <Label htmlFor={`circ_${c.key}`}>{c.label}</Label>
              <Input id={`circ_${c.key}`} name={`circ_${c.key}`} inputMode="decimal" defaultValue={values.circumferences[c.key]?.toString().replace(".", ",") ?? ""} />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <Eyebrow className="mb-1">Test di forza</Eyebrow>
        <p className="mb-4 text-sm text-muted">Massimale stimato con la tabella RPE, arrotondato a 2,5 kg.</p>
        <div className="scroll-x">
          <table className="w-full min-w-[560px] border-collapse text-[15px]">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th scope="col" className="py-2 font-semibold">Esercizio</th>
                <th scope="col" className="px-1 py-2 font-semibold">Carico kg</th>
                <th scope="col" className="px-1 py-2 font-semibold">Ripetizioni</th>
                <th scope="col" className="px-1 py-2 font-semibold">RPE</th>
                <th scope="col" className="py-2 pl-3 text-right font-semibold">Massimale stimato</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((t, i) => {
                const e = toNum(t.load) && toNum(t.reps) && toNum(t.rpe) ? estimateOneRepMax(toNum(t.load)!, toNum(t.reps)!, toNum(t.rpe)!) : null;
                const set = (k: keyof typeof t, v: string) => setTests((arr) => arr.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
                return (
                  <tr key={i} className="border-t border-sand-deep">
                    <td className="py-1.5 pr-1"><input aria-label={`Test ${i + 1}, esercizio`} name={`test_${i}_exercise`} value={t.exercise} onChange={(e) => set("exercise", e.target.value)} placeholder={i === 0 ? "Squat" : ""} className="w-full rounded-lg border border-sand-deep bg-sand px-2 py-2" /></td>
                    <td className="px-1 py-1.5"><input aria-label={`Test ${i + 1}, carico`} name={`test_${i}_load`} inputMode="decimal" value={t.load} onChange={(e) => set("load", e.target.value)} className="w-24 rounded-lg border border-sand-deep bg-sand px-2 py-2 text-center" /></td>
                    <td className="px-1 py-1.5"><input aria-label={`Test ${i + 1}, ripetizioni`} name={`test_${i}_reps`} inputMode="numeric" value={t.reps} onChange={(e) => set("reps", e.target.value)} className="w-20 rounded-lg border border-sand-deep bg-sand px-2 py-2 text-center" /></td>
                    <td className="px-1 py-1.5">
                      <select aria-label={`Test ${i + 1}, RPE`} name={`test_${i}_rpe`} value={t.rpe} onChange={(e) => set("rpe", e.target.value)} className="w-24 rounded-lg border border-sand-deep bg-sand px-2 py-2">
                        <option value="">—</option>
                        {RPE_VALUES.map((r) => <option key={r} value={r}>{String(r).replace(".", ",")}</option>)}
                      </select>
                    </td>
                    <td className="py-1.5 pl-3 text-right font-semibold tabular">{e ? `${fmtNum(e, 1)} kg` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-5">
          <Label htmlFor="tests_text" hint="corsa, cardio, HYROX, qualsiasi altro test">Altri test</Label>
          <Textarea id="tests_text" name="tests_text" rows={3} defaultValue={values.tests_text} placeholder="3 km in 13:40 · zona 2 a 10,5 km/h · 1000 m ski erg 3:58" />
        </div>
      </Card>

      <Card>
        <Label htmlFor="notes_next_phase" hint="abitudini, andamento, cosa cambiare. Riappare nell'editor del programma">Note per la prossima fase</Label>
        <Textarea id="notes_next_phase" name="notes_next_phase" rows={4} defaultValue={values.notes_next_phase} />
        <label className="mt-4 flex items-center gap-3 text-[15px]">
          <input type="checkbox" name="visible_to_client" defaultChecked={values.visible_to_client} className="h-5 w-5 accent-[#1b1a17]" />
          Il cliente vede questo check nei suoi progressi (le note per la prossima fase restano private)
        </label>
      </Card>

      <ActionMessage state={state} />
      <div><SubmitButton>Salva check</SubmitButton></div>
    </form>
  );
}

function Result({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold tracking-wide text-muted-dark uppercase">{label}</div>
      <div className="mt-1 text-2xl font-light tabular">{value}</div>
    </div>
  );
}
