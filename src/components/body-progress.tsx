"use client";

/**
 * Grafici dei check e confronto tra due check, per staff, modalità check e
 * cliente. Tutto cambia con un tocco (niente "Mostra"): % o kg di massa
 * grassa, somma o singola plica, ogni circonferenza, la formula (staff).
 */
import { useMemo, useState } from "react";
import { LineChart } from "./line-chart";
import { Card, Eyebrow, cx, fmtNum } from "./ui";
import { circKeysIn, compareRows, defaultPair, foldSitesIn, foldSum, type BodyPoint, type CompareRow, type FormulaSeries } from "@/lib/body/progress";
export type { FormulaSeries };
import { CIRCUMFERENCES, siteLabel, type SkinfoldSite } from "@/lib/body/skinfolds";

/** Fila di bottoni a scelta singola: scorre di lato sul telefono, va a capo sul computer. */
export function Chips({ label, options, value, onChange }: { label: string; options: Array<{ value: string; label: string }>; value: string; onChange: (v: string) => void }) {
  return (
    <div role="group" aria-label={label} className="scroll-x -mx-1 mb-2 flex gap-1.5 px-1 pb-1 md:flex-wrap">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx("min-h-9 shrink-0 rounded-full px-3 text-[13px] font-semibold", o.value === value ? "bg-ink text-card" : "bg-sand-deep/60 hover:bg-sand-deep")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function BodyCharts({
  points,
  sumSites,
  formulas,
  showFolds = true,
}: {
  points: BodyPoint[];
  /** pliche della somma (quelle prese in tutti i check, altrimenti il protocollo) */
  sumSites: SkinfoldSite[];
  /** staff: le formule che si possono usare, per cambiare formula al volo */
  formulas?: FormulaSeries[];
  showFolds?: boolean;
}) {
  const dated = useMemo(() => points.filter((p) => p.date), [points]);
  const [fatUnit, setFatUnit] = useState<"pct" | "kg">("pct");
  const [formulaId, setFormulaId] = useState(() => formulas?.find((f) => f.ref)?.id ?? formulas?.[0]?.id ?? "");
  const sites = foldSitesIn(dated);
  const [fold, setFold] = useState("sum");
  const circKeys = circKeysIn(dated);
  const [circ, setCirc] = useState(() => (circKeys.includes("vita") ? "vita" : circKeys[0] ?? "vita"));
  const formula = formulas?.find((f) => f.id === formulaId) ?? null;

  const series = (get: (p: BodyPoint) => number | null) =>
    dated.map((p) => ({ date: p.date!, value: get(p) })).filter((x): x is { date: string; value: number } => x.value !== null);
  const fat = (p: BodyPoint) => (formula ? formula.values[p.id] ?? null : { pct: p.fatPct, kg: p.fatKg, lean: p.leanKg });
  const fatPoints = series((p) => (fatUnit === "pct" ? fat(p)?.pct ?? null : fat(p)?.kg ?? null));
  const leanPoints = series((p) => fat(p)?.lean ?? null);
  const hasFat = formulas ? formulas.length > 0 : dated.some((p) => p.fatPct !== null);

  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
      <Card><Eyebrow className="mb-2">Peso · kg</Eyebrow><LineChart label="Peso" unit="kg" points={series((p) => p.weight)} /></Card>
      {hasFat ? (
        <Card>
          <Eyebrow className="mb-2">Massa grassa</Eyebrow>
          <Chips label="Massa grassa in" value={fatUnit} onChange={(v) => setFatUnit(v as "pct" | "kg")} options={[{ value: "pct", label: "%" }, { value: "kg", label: "kg" }]} />
          {formulas && formulas.length > 1 ? (
            <label className="mb-2 flex items-center gap-2 text-sm">
              <span className="shrink-0 text-muted">Formula</span>
              <select value={formulaId} onChange={(e) => setFormulaId(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-sand-deep bg-sand px-2 py-1.5 text-sm">
                {formulas.map((f) => <option key={f.id} value={f.id}>{f.ref ? `${f.label} · riferimento` : f.label}</option>)}
              </select>
            </label>
          ) : null}
          <LineChart label={`Massa grassa in ${fatUnit === "pct" ? "%" : "kg"}`} unit={fatUnit === "pct" ? "%" : "kg"} points={fatPoints} />
          {formula && !formula.ref ? <p className="mt-1 text-xs text-muted">Formula diversa da quella di riferimento: i numeri non coincidono con quelli dei check.</p> : null}
          {fatUnit === "kg" && !fatPoints.length && dated.some((p) => fat(p)?.pct !== null) ? <p className="mt-1 text-xs text-muted">Per i kg serve il peso nel check.</p> : null}
        </Card>
      ) : null}
      {hasFat ? <Card><Eyebrow className="mb-2">Massa magra · kg</Eyebrow><LineChart label="Massa magra" unit="kg" points={leanPoints} /></Card> : null}
      {showFolds && sites.length ? (
        <Card>
          <Eyebrow className="mb-2">Pliche · mm</Eyebrow>
          <Chips label="Plica" value={fold} onChange={setFold} options={[{ value: "sum", label: "Somma" }, ...sites.map((s) => ({ value: s, label: siteLabel(s) }))]} />
          <LineChart label={fold === "sum" ? "Somma pliche" : siteLabel(fold as SkinfoldSite)} unit="mm" points={series((p) => (fold === "sum" ? foldSum(p, sumSites) : p.folds[fold as SkinfoldSite] ?? null))} />
          {fold === "sum" ? <p className="mt-1 text-xs text-muted">Somma di {sumSites.map((s) => siteLabel(s).toLowerCase()).join(", ")}.</p> : null}
        </Card>
      ) : null}
      {circKeys.length ? (
        <Card>
          <Eyebrow className="mb-2">Circonferenze · cm</Eyebrow>
          <Chips label="Circonferenza" value={circ} onChange={setCirc} options={circKeys.map((k) => ({ value: k, label: CIRCUMFERENCES.find((c) => c.key === k)!.label }))} />
          <LineChart label={CIRCUMFERENCES.find((c) => c.key === circ)?.label ?? "Circonferenza"} unit="cm" points={series((p) => p.circ[circ] ?? null)} />
        </Card>
      ) : null}
    </div>
  );
}

const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "");

function DiffCell({ r }: { r: CompareRow }) {
  if (r.diff === null) return <span className="text-muted">–</span>;
  const good = r.diff === 0 || r.better === null ? null : (r.better === "down") === r.diff < 0;
  return (
    <span className={cx("font-semibold tabular", good === null ? "text-ink-soft" : good ? "text-ink" : "text-accent-deep")}>
      {r.diff === 0 ? "=" : `${sign(r.diff)}${fmtNum(Math.abs(r.diff), r.digits)}`}
      {good === true ? <span className="sr-only"> (bene)</span> : null}
    </span>
  );
}

/**
 * Confronto tra due check: si scelgono "prima" e "dopo" (di partenza il
 * penultimo e l'ultimo) e si vedono tutte le misure una accanto all'altra.
 */
export function CheckCompare({ points, sumSites, title = "Confronta due check" }: { points: BodyPoint[]; sumSites: SkinfoldSite[]; title?: string }) {
  const pair = defaultPair(points);
  const [aId, setA] = useState(pair?.[0] ?? "");
  const [bId, setB] = useState(pair?.[1] ?? "");
  const a = points.find((p) => p.id === aId);
  const b = points.find((p) => p.id === bId);
  if (points.length < 2 || !a || !b) return null;
  const rows = compareRows(a, b, sumSites);
  const groups: Array<{ key: CompareRow["group"]; title: string }> = [
    { key: "corpo", title: "Corpo" },
    { key: "pliche", title: "Pliche · mm" },
    { key: "cm", title: "Circonferenze · cm" },
  ];
  const select = (value: string, set: (v: string) => void, label: string) => (
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-semibold text-muted">
      {label}
      <select value={value} onChange={(e) => set(e.target.value)} className="w-full min-w-0 rounded-lg border border-sand-deep bg-sand px-2 py-2 text-[15px] font-normal text-ink">
        {points.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
    </label>
  );
  return (
    <Card className="flex max-w-3xl flex-col gap-3" aria-label={title}>
      <Eyebrow>{title}</Eyebrow>
      <div className="flex gap-2">
        {select(aId, setA, "Prima")}
        {select(bId, setB, "Dopo")}
      </div>
      <table className="w-full border-collapse text-[15px]">
        <thead className="table-head-hidden">
          <tr><th>Misura</th><th>Prima</th><th>Dopo</th><th>Differenza</th></tr>
        </thead>
        {groups.map((g) => {
          const list = rows.filter((r) => r.group === g.key);
          if (!list.length) return null;
          return (
            <tbody key={g.key}>
              <tr><th colSpan={4} className="pt-3 pb-1 text-left text-[12px] font-bold tracking-wider text-muted uppercase">{g.title}</th></tr>
              {list.map((r) => (
                <tr key={r.key} className="border-t border-sand-deep">
                  <th scope="row" className="w-full py-2 pr-2 text-left font-normal">{r.label}{g.key === "corpo" ? <span className="text-muted"> · {r.unit}</span> : null}</th>
                  <td className="py-2 pl-3 text-right whitespace-nowrap text-muted tabular">{fmtNum(r.a, r.digits)}</td>
                  <td className="py-2 pl-3 text-right font-semibold whitespace-nowrap tabular">{fmtNum(r.b, r.digits)}</td>
                  <td className="py-2 pl-3 text-right whitespace-nowrap"><DiffCell r={r} /></td>
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>
      <p className="text-xs text-muted">In nero quando va nella direzione giusta (meno grasso e pliche, più massa magra), in arancio quando va al contrario. Peso e centimetri dipendono dall&apos;obiettivo.</p>
    </Card>
  );
}
