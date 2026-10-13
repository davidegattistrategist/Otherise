/**
 * Grafico a linea semplice (SVG), per peso, massa grassa, massa magra,
 * circonferenze e voti del diario. L'ultimo punto è evidenziato in arancio.
 */
import { formatShort, type ISODate } from "@/lib/dates";
import { fmtNum } from "./ui";

export type Point = { date: ISODate; value: number };

export function LineChart({
  points,
  unit = "",
  height = 160,
  digits = 1,
  label,
  yMin,
  yMax,
}: {
  points: Point[];
  unit?: string;
  height?: number;
  digits?: number;
  label: string;
  yMin?: number;
  yMax?: number;
}) {
  const data = points.filter((p) => Number.isFinite(p.value)).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (data.length === 0) {
    return <div className="flex h-24 items-center text-sm text-muted">Ancora nessun dato</div>;
  }
  // viewBox vicino alla larghezza reale delle card, così i testi restano leggibili
  const W = 340;
  const H = Math.round(height * 0.75);
  const padL = 34;
  const padR = 14;
  const padT = 18;
  const padB = 22;
  const vals = data.map((d) => d.value);
  let lo = yMin ?? Math.min(...vals);
  let hi = yMax ?? Math.max(...vals);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const span = hi - lo;
  lo = yMin ?? lo - span * 0.15;
  hi = yMax ?? hi + span * 0.15;
  const x = (i: number) => (data.length === 1 ? (padL + W - padR) / 2 : padL + (i * (W - padL - padR)) / (data.length - 1));
  const y = (v: number) => padT + ((hi - v) * (H - padT - padB)) / (hi - lo);
  const ticks = [lo, (lo + hi) / 2, hi];
  const last = data[data.length - 1];
  const first = data[0];
  const year = Number(last.date.slice(0, 4));
  const showEvery = Math.ceil(data.length / 4);

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${label}: da ${fmtNum(first.value, digits)} a ${fmtNum(last.value, digits)} ${unit}`}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--color-sand-deep)" strokeWidth="1" />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--color-muted)">
              {fmtNum(t, digits)}
            </text>
          </g>
        ))}
        <polyline
          points={data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ")}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {data.map((d, i) => (
          <circle key={d.date + i} cx={x(i)} cy={y(d.value)} r={i === data.length - 1 ? 4.5 : 2.5} fill={i === data.length - 1 ? "var(--color-accent)" : "var(--color-ink)"}>
            <title>{`${formatShort(d.date, year)}: ${fmtNum(d.value, digits)} ${unit}`}</title>
          </circle>
        ))}
        <text x={Math.min(x(data.length - 1), W - padR)} y={y(last.value) - 9} textAnchor="end" fontSize="11.5" fontWeight="700" fill="var(--color-ink)">
          {fmtNum(last.value, digits)}
        </text>
        {data.map((d, i) =>
          i % showEvery === 0 || i === data.length - 1 ? (
            <text key={"l" + i} x={x(i)} y={H - 6} textAnchor={i === 0 && data.length > 1 ? "start" : i === data.length - 1 && data.length > 1 ? "end" : "middle"} fontSize="10.5" fill="var(--color-muted)">
              {formatShort(d.date, year)}
            </text>
          ) : null,
        )}
      </svg>
    </figure>
  );
}
