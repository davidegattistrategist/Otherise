/**
 * Test di forza dei check (squat, stacco, panca…): una serie per esercizio,
 * per i grafici della performance di staff e cliente. Il valore è il
 * massimale stimato; senza ripetizioni (non stimabile) il carico del test.
 * I check dello storico importato senza data restano al loro posto (ordine
 * dei check, `sortChecks`) con l'etichetta "Check N".
 */
import { formatShort, type ISODate } from "../dates";
import { sortChecks } from "../check-order";

export type CheckTest = { exercise?: string | null; load?: number | null; reps?: number | null; rpe?: number | null; e1rm?: number | null };

export type TestPoint = {
  /** null per i check storici senza data */
  date: ISODate | null;
  /** "12 mar 2025" o "Check 3" */
  label: string;
  value: number;
  load: number | null;
  reps: number | null;
  rpe: number | null;
  estimated: boolean;
};
export type TestSeries = { key: string; name: string; points: TestPoint[] };

type TestCheck = { check_date: ISODate | null; strength_tests: unknown; sequence?: number | null; order_hint?: string | null; created_at?: string };

const keyOf = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

function pointLabel(c: TestCheck, refYear: number): string {
  if (c.check_date) return formatShort(c.check_date, refYear);
  return c.sequence ? `Check ${c.sequence}` : "Senza data";
}

export function strengthTestSeries(checks: TestCheck[], refYear = new Date().getFullYear()): TestSeries[] {
  const by = new Map<string, TestSeries>();
  // un check = una posizione: due test dello stesso esercizio nello stesso check tengono il migliore
  const last = new Map<string, number>();
  sortChecks(checks).forEach((c, idx) => {
    const tests = Array.isArray(c.strength_tests) ? (c.strength_tests as CheckTest[]) : [];
    for (const t of tests) {
      const name = (t.exercise ?? "").trim();
      if (!name) continue;
      const e1rm = typeof t.e1rm === "number" && t.e1rm > 0 ? t.e1rm : null;
      const load = typeof t.load === "number" && t.load > 0 ? t.load : null;
      const value = e1rm ?? load;
      if (value === null) continue;
      const key = keyOf(name);
      const s = by.get(key) ?? { key, name, points: [] };
      const point: TestPoint = {
        date: c.check_date,
        label: pointLabel(c, refYear),
        value: Math.round(value * 10) / 10,
        load,
        reps: typeof t.reps === "number" && t.reps > 0 ? t.reps : null,
        rpe: typeof t.rpe === "number" && t.rpe > 0 ? t.rpe : null,
        estimated: e1rm !== null,
      };
      if (last.get(key) === idx) {
        const same = s.points[s.points.length - 1];
        if (point.value > same.value) Object.assign(same, point);
      } else s.points.push(point);
      last.set(key, idx);
      by.set(key, s);
    }
  });
  // prima quelli con più test
  return [...by.values()].sort((a, b) => b.points.length - a.points.length || a.name.localeCompare(b.name, "it"));
}

/** "100 kg × 5 @ RPE 9" (o solo il carico) */
export function testDetail(p: TestPoint): string {
  if (p.load === null) return "";
  const reps = p.reps ? ` × ${p.reps}` : "";
  const rpe = p.reps && p.rpe && p.rpe !== 10 ? ` @ RPE ${String(p.rpe).replace(".", ",")}` : "";
  return `${String(p.load).replace(".", ",")} kg${reps}${rpe}`;
}
