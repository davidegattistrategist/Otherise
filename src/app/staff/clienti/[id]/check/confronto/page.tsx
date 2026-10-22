import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getStaffClient } from "@/lib/data/client";
import { staffBodyData } from "@/lib/data/checks";
import { getWeights } from "@/lib/data/weights";
import { getBusinessName } from "@/lib/data/shared";
import { compareRows, defaultPair, type CompareRow } from "@/lib/body/progress";
import { averageUntil } from "@/lib/body/weights";
import { addDays, ageOn, diffDays, formatLong, todayISO } from "@/lib/dates";
import type { Sex } from "@/lib/body/skinfolds";
import { Card, cx, EmptyState, fmtNum } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { PrintNote } from "@/components/print-note";

export const metadata: Metadata = { title: "Confronto composizione corporea" };

/**
 * Confronto tra due check da stampare o salvare in PDF (per esempio per il
 * nutrizionista): composizione corporea, pliche una per una, circonferenze e
 * peso giorno per giorno tra le due date. In stampa si vede solo il foglio.
 */
export default async function ComparePrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ da?: string; a?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireStaff();
  const client = await getStaffClient(id);
  const supabase = await createClient();
  const [{ data: checks }, weights, business] = await Promise.all([
    supabase
      .from("checks")
      .select("id, check_date, sequence, created_at, order_hint, age_years, skinfolds, weight_kg, body_fat_pct, fat_mass_kg, lean_mass_kg, body_fat_formula, circumferences")
      .eq("client_id", id)
      .order("check_date", { ascending: true }),
    getWeights(supabase, id),
    getBusinessName(),
  ]);
  const name = `${client.first_name} ${client.last_name}`.trim();
  if (!client.sex || !checks?.length) {
    return (
      <EmptyState title="Servono almeno due check" action={<Link href={`/staff/clienti/${id}/check`} className="font-semibold underline">Torna ai check</Link>}>
        Quando {client.first_name} avrà due check potrai confrontarli e salvare il confronto in PDF.
      </EmptyState>
    );
  }
  const body = staffBodyData(checks, client.sex as Sex, client.birth_date, client.skinfold_formula);
  const points = body.points;
  const pair = defaultPair(points);
  const aId = points.some((p) => p.id === sp.da) ? sp.da! : pair![0];
  const bId = points.some((p) => p.id === sp.a) ? sp.a! : pair![1];
  const a = points.find((p) => p.id === aId)!;
  const b = points.find((p) => p.id === bId)!;
  const rows = compareRows(a, b, body.sumSites);
  const corpo = rows.filter((r) => r.group === "corpo");
  const pliche = rows.filter((r) => r.group === "pliche");
  const cm = rows.filter((r) => r.group === "cm");
  const days = a.date && b.date ? diffDays(a.date, b.date) : null;
  const age = b.date ? ageOn(client.birth_date, b.date) : null;
  // peso giorno per giorno: media della prima e dell'ultima settimana tra i due check
  const wStart = a.date ? averageUntil(weights, addDays(a.date, 6)) : null;
  const wEnd = b.date ? averageUntil(weights, b.date) : null;
  const wCount = a.date && b.date ? weights.filter((w) => w.date >= a.date! && w.date <= b.date!).length : 0;
  const formula = body.ref?.label ?? null;
  const label = (p: typeof a) => (p.date ? formatLong(p.date) : p.label);

  return (
    <div className="flex flex-col gap-4">
      {/* scelta dei due check e stampa: non vanno sul foglio */}
      <Card className="flex flex-col gap-3" data-print-hide>
        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold">
            Prima
            <select name="da" defaultValue={aId} className="rounded-xl border border-sand-deep bg-card px-3 py-2.5 text-[15px] font-normal">
              {points.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold">
            Dopo
            <select name="a" defaultValue={bId} className="rounded-xl border border-sand-deep bg-card px-3 py-2.5 text-[15px] font-normal">
              {points.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <button type="submit" className="min-h-11 rounded-full px-4 text-sm font-semibold ring-1 ring-sand-deep">Confronta</button>
        </form>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <PrintButton />
          <span className="text-sm text-muted">Sul telefono: Stampa → apri l&apos;anteprima → Condividi per salvarlo o mandarlo come PDF.</span>
        </div>
      </Card>

      <article className="print-sheet flex flex-col gap-5 rounded-[24px] bg-card p-5 sm:p-7" data-print-sheet>
        <header className="flex flex-col gap-1 border-b border-sand-deep pb-4">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-muted uppercase"><span className="h-2 w-2 rounded-full bg-accent" />{business || "Otherise"}</div>
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight">Composizione corporea: confronto</h1>
          <p className="text-[15px] text-ink-soft">
            <span className="font-semibold text-ink">{name}</span>
            {client.sex === "F" ? " · donna" : " · uomo"}
            {age ? ` · ${age} anni` : ""}
          </p>
          <p className="text-[15px] text-ink-soft tabular">
            Dal check del <span className="font-semibold text-ink">{label(a)}</span> a quello del <span className="font-semibold text-ink">{label(b)}</span>
            {days !== null ? ` (${days} giorni)` : ""}
          </p>
        </header>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-compare-summary>
          {corpo.map((r) => (
            <Tile key={r.key} row={r} />
          ))}
        </section>

        {wStart !== null && wEnd !== null ? (
          <section className="flex flex-col gap-1 rounded-2xl bg-sand/60 px-4 py-3">
            <div className="text-xs font-semibold tracking-[0.12em] text-muted uppercase">Peso giorno per giorno, segnato dal cliente</div>
            <p className="text-[15px] tabular">
              Media della prima settimana <span className="font-semibold">{fmtNum(wStart, 1)} kg</span> → media dell&apos;ultima settimana <span className="font-semibold">{fmtNum(wEnd, 1)} kg</span> ({signed(wEnd - wStart)} kg, {wCount} pesate tra i due check)
            </p>
          </section>
        ) : null}

        {pliche.length ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-[17px] font-semibold">Pliche cutanee <span className="text-sm font-normal text-muted">(mm, misura diretta)</span></h2>
            <Table rows={pliche} a={label(a)} b={label(b)} />
          </section>
        ) : null}

        {cm.length ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-[17px] font-semibold">Circonferenze <span className="text-sm font-normal text-muted">(cm)</span></h2>
            <Table rows={cm} a={label(a)} b={label(b)} />
          </section>
        ) : null}

        <PrintNote label="Note per chi legge il confronto" placeholder="Scrivi qui cosa vuoi far notare (resta sul foglio stampato, non viene salvato)" />

        <footer className="flex flex-col gap-2 border-t border-sand-deep pt-4 text-[13px] leading-relaxed text-ink-soft">
          <p>
            <span className="font-semibold text-ink">Come sono misurati questi numeri.</span> Le pliche sono misurate con il plicometro, sempre con lo stesso protocollo
            {formula ? `; massa grassa e massa magra sono stimate dalle pliche con la formula ${formula} e l'equazione di Siri` : ""}.
            La massa magra qui è tutto ciò che non è grasso (muscoli, ossa, organi, acqua, glicogeno): non è la stessa cosa della “massa muscolare” indicata da una bioimpedenza.
          </p>
          <p>
            La bioimpedenza stima la composizione dalla conduzione elettrica del corpo e risente molto di idratazione, glicogeno, pasti, ciclo mestruale e ora della misura: i suoi valori vanno confrontati solo con altre bioimpedenze fatte nelle stesse condizioni, non con le pliche.
          </p>
          <p className="text-muted">Preparato da {me.fullName || "il coach"} il {formatLong(todayISO())}.</p>
        </footer>
      </article>
    </div>
  );
}

function signed(n: number, digits = 1) {
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return `${r > 0 ? "+" : r < 0 ? "−" : "±"}${fmtNum(Math.abs(r), digits)}`;
}

/** Arancio quando va nella direzione che di solito non si cerca (grasso o pliche su, massa magra giù). */
function tone(r: CompareRow) {
  if (r.diff === null || r.diff === 0 || !r.better) return "";
  const good = r.better === "down" ? r.diff < 0 : r.diff > 0;
  return good ? "text-ink" : "text-accent-deep";
}

function Tile({ row }: { row: CompareRow }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-sand/60 px-3.5 py-3" data-compare-tile={row.key}>
      <div className="text-xs text-muted">{row.label}{row.unit === "%" ? " (%)" : ""}</div>
      <div className={cx("text-[26px] leading-none font-semibold tabular", tone(row))}>{row.diff === null ? "–" : signed(row.diff, row.digits)}<span className="ml-1 text-sm font-normal text-muted">{row.unit}</span></div>
      <div className="text-xs text-ink-soft tabular">{row.a === null ? "–" : fmtNum(row.a, row.digits)} → {row.b === null ? "–" : fmtNum(row.b, row.digits)}</div>
      {row.key !== "weight" ? <div className="text-[11px] text-muted">stima dalle pliche</div> : null}
    </div>
  );
}

function Table({ rows, a, b }: { rows: CompareRow[]; a: string; b: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[15px] tabular">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="py-1.5 pr-2 font-semibold">Misura</th>
            <th className="py-1.5 pr-2 text-right font-semibold">{a}</th>
            <th className="py-1.5 pr-2 text-right font-semibold">{b}</th>
            <th className="py-1.5 text-right font-semibold">Differenza</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={cx("border-t border-sand-deep", r.key === "sum" && "font-semibold")}>
              <td className="py-1.5 pr-2">{r.label}</td>
              <td className="py-1.5 pr-2 text-right">{r.a === null ? "–" : fmtNum(r.a, r.digits)}</td>
              <td className="py-1.5 pr-2 text-right">{r.b === null ? "–" : fmtNum(r.b, r.digits)}</td>
              <td className={cx("py-1.5 text-right font-semibold", tone(r))}>{r.diff === null ? "–" : signed(r.diff, r.digits)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
