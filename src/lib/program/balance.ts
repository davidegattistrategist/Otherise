/**
 * "Com'è fatto davvero" un programma: serie a settimana per tipo di movimento
 * (accosciata, hinge, tirate, spinte…), rapporto accosciata/hinge e durata
 * stimata di ogni giornata. Serve all'assistente AI per mantenere la struttura
 * che il trainer sta usando, e al trainer per vedere il tempo di una seduta.
 *
 * Il tipo di movimento si ricava dal nome dell'esercizio: è una stima, non
 * una classificazione perfetta (gli esercizi che non riconosce vanno in "altro").
 */
import { parsePrescription } from "./prescription";
import type { ProgramBlock, ProgramContent, ProgramDay, ProgramItem } from "./types";

export const PATTERNS = [
  "accosciata",
  "hinge",
  "tirata_verticale",
  "tirata_orizzontale",
  "spinta_orizzontale",
  "spinta_verticale",
  "spalle",
  "braccia",
  "core",
  "condizionamento",
  "altro",
] as const;
export type Pattern = (typeof PATTERNS)[number];

export const PATTERN_LABELS: Record<Pattern, string> = {
  accosciata: "Gambe · accosciata",
  hinge: "Gambe · hinge",
  tirata_verticale: "Dorso · tirate verticali",
  tirata_orizzontale: "Dorso · tirate orizzontali",
  spinta_orizzontale: "Spinte orizzontali",
  spinta_verticale: "Spinte verticali",
  spalle: "Spalle (alzate)",
  braccia: "Braccia",
  core: "Addome / core",
  condizionamento: "Condizionamento",
  altro: "Altro",
};

const RULES: Array<[Pattern, RegExp]> = [
  ["condizionamento", /vogator|rowing|row ?erg|remoerg|ski ?erg|\bski\b|\bbike\b|\bbici|cyclette|assault|air ?bike|\bcors[ae]\b|\brun\b|running|sprint|slitta|sled|burpee|wall ?ball|farmer|salt[io]|jump|corda|camminat|tapis|fartlek|ripetute/],
  ["core", /plank|dead ?bug|bird ?dog|pallof|crunch|addom|hollow|copenag|bear ?crawl|rollout|ab ?wheel|russian|leg raise|sit ?up|\bcore\b|side bridge|mountain climber/],
  ["hinge", /stacc|deadlift|\brdl\b|rumen|hip ?thrust|ponte|glute ?bridge|good ?morning|swing|nordic|iperestens|hyperext|pull ?through|leg ?curl|glute ?ham|femoral/],
  ["accosciata", /squat|accosciat|affond|lunge|bulgar|split|step ?up|leg ?press|pressa|hack|leg ?extension|pistol|sissy|box squat/],
  ["tirata_verticale", /lat ?machine|\blat\b|trazion|pull ?-?up|\bchin|pulldown|pull ?down/],
  ["spalle", /alzat|lateral|laterali|rear ?delt|face ?pull|oscillazion|aperture posteriori|upright/],
  ["tirata_orizzontale", /rematore|\brow\b|pulley|seal|t-?bar|high ?row|low ?row|inverted|australian/],
  ["spinta_verticale", /military|lento avanti|overhead|shoulder ?press|push ?press|arnold|landmine ?press|handstand|press sopra/],
  ["spinta_orizzontale", /panca|bench|piegament|push ?-?up|chest ?press|croci|\bfly\b|dip|floor ?press|pectoral|pec ?deck/],
  ["braccia", /curl|bicip|tricip|french|push ?-?down|hammer|kickback|estension/],
];

export function patternOf(name: string): Pattern {
  const n = name.toLowerCase();
  for (const [p, re] of RULES) if (re.test(n)) return p;
  return "altro";
}

/** Fondamentale "da bilanciere pesante": richiede tempo per caricare, scaldarsi e posizionarsi. */
export function isFundamental(name: string): boolean {
  const n = name.toLowerCase();
  if (/manubr|goblet|bulgar|split|pistol|kettlebell|macchin|machine|multipower|smith|corpo libero|elastic|landmine|box|trap ?bar/.test(n)) return false;
  if (/hip ?thrust|rumen|\brdl\b/.test(n)) return /bilancier/.test(n);
  return /squat|panca piana|bench press|stacco|deadlift|military/.test(n);
}

/** Secondi di recupero scritti a mano: "90\"", "60-90\"", "2'", "2 min", "1'30\"", "EMOM 2". */
export function restSeconds(rest: string | null | undefined): number | null {
  const r = (rest ?? "").toLowerCase().replace(",", ".").trim();
  if (!r) return null;
  const emom = /emom\s*(\d+(?:\.\d+)?)/.exec(r);
  if (emom) return Math.round(Number(emom[1]) * 60);
  const minSec = /(\d+)\s*['’]\s*(\d+)\s*["”]?/.exec(r);
  if (minSec) return Number(minSec[1]) * 60 + Number(minSec[2]);
  const range = /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(["”]|s|sec|''|['’]|min)?/.exec(r);
  const one = /(\d+(?:\.\d+)?)\s*(["”]|s\b|sec|''|['’]|min)?/.exec(r);
  const m = range ?? one;
  if (!m) return null;
  const value = range ? (Number(range[1]) + Number(range[2])) / 2 : Number(m[1]);
  const unit = range ? range[3] : m[2];
  if (unit === "'" || unit === "’" || unit === "min") return Math.round(value * 60);
  if (!unit && value <= 5) return Math.round(value * 60);
  return Math.round(value);
}

function setsOf(item: ProgramItem, block: ProgramBlock, week: number): number {
  const p = parsePrescription(item.prescriptions[week] ?? item.prescriptions[0]);
  if (p.kind === "sets" || p.kind === "timed" || p.kind === "distance") return p.sets;
  return block.kind === "superset" || block.kind === "circuit" ? block.rounds ?? 1 : item.prescriptions[week]?.trim() ? 1 : 0;
}

function workSeconds(item: ProgramItem, week: number, pattern: Pattern): number {
  const p = parsePrescription(item.prescriptions[week] ?? item.prescriptions[0]);
  if (p.kind === "timed") return p.seconds;
  if (p.kind === "distance") return Math.round(p.meters * (pattern === "condizionamento" ? 0.36 : 0.5));
  if (p.kind === "sets" && p.reps) return Math.min(120, Math.max(20, p.reps * 4));
  return 45;
}

const DEFAULT_REST: Record<"fondamentale" | "complementare" | "accessorio", number> = { fondamentale: 150, complementare: 75, accessorio: 45 };
const CHANGE = 150; // cambio esercizio: spostarsi, aspettare l'attrezzo, prepararsi
const SETUP_FUNDAMENTAL = 8 * 60; // serie di avvicinamento e caricamento del bilanciere

function role(name: string, pattern: Pattern) {
  if (isFundamental(name)) return "fondamentale" as const;
  return pattern === "braccia" || pattern === "spalle" || pattern === "core" ? ("accessorio" as const) : ("complementare" as const);
}

/** Minuti stimati per una giornata (settimana indicata, da 0). */
export function estimateDayMinutes(day: ProgramDay, week = 0): number {
  let s = 0;
  for (const b of day.blocks) {
    if (b.kind === "text") {
      const m = /(\d+)\s*(?:min|['’])/.exec(`${b.title} ${b.notes}`.toLowerCase());
      s += m ? Number(m[1]) * 60 : 0;
      continue;
    }
    if (b.kind === "amrap" || b.kind === "emom") {
      s += (b.durationMin ?? 10) * 60 + CHANGE;
      continue;
    }
    if (b.kind === "interval") {
      s += (b.rounds ?? 6) * ((b.workSec ?? 40) + (b.restSec ?? 20)) + CHANGE;
      continue;
    }
    if (b.kind === "single") {
      for (const it of b.items) {
        const pat = patternOf(it.name);
        const r = role(it.name, pat);
        const sets = setsOf(it, b, week);
        if (!sets) continue;
        const rest = restSeconds(it.rest) ?? DEFAULT_REST[r];
        const emom = /emom/i.test(it.rest);
        s += sets * (emom ? rest : workSeconds(it, week, pat) + rest) + CHANGE + (r === "fondamentale" ? SETUP_FUNDAMENTAL : 0);
      }
      continue;
    }
    // superserie e circuiti: un giro = tutti gli esercizi di fila, poi il recupero
    const rounds = b.rounds ?? Math.max(1, ...b.items.map((it) => setsOf(it, b, week)));
    const work = b.items.reduce((a, it) => a + workSeconds(it, week, patternOf(it.name)) + 20, 0);
    const rest = Math.max(0, ...b.items.map((it) => restSeconds(it.rest) ?? 0)) || 75;
    s += rounds * (work + rest) + CHANGE + b.items.filter((it) => isFundamental(it.name)).length * SETUP_FUNDAMENTAL;
  }
  return Math.round(s / 60);
}

export type Balance = {
  week: number;
  sets: Record<Pattern, number>;
  /** % di accosciata sul totale accosciata + hinge (null se non ci sono esercizi di gambe) */
  squatShare: number | null;
  /** serie di tirata per ogni serie di spinta (null se non ci sono spinte) */
  pullPerPush: number | null;
  minutes: Array<{ title: string; minutes: number }>;
  fundamentals: string[];
};

/** Serie a settimana per tipo di movimento (le superserie contano ogni esercizio). */
export function programBalance(content: ProgramContent, week = 0): Balance {
  const sets = Object.fromEntries(PATTERNS.map((p) => [p, 0])) as Record<Pattern, number>;
  const fundamentals = new Set<string>();
  for (const day of content.days) {
    for (const b of day.blocks) {
      if (b.kind === "text") continue;
      for (const it of b.items) {
        if (!it.name.trim()) continue;
        const pat = patternOf(it.name);
        if (isFundamental(it.name)) fundamentals.add(it.name.trim());
        // AMRAP, EMOM e intervalli contano come lavoro di condizionamento (un esercizio = 1)
        if (b.kind === "amrap" || b.kind === "emom" || b.kind === "interval") sets.condizionamento += 1;
        else sets[pat] += setsOf(it, b, week);
      }
    }
  }
  const legs = sets.accosciata + sets.hinge;
  const pull = sets.tirata_verticale + sets.tirata_orizzontale;
  const push = sets.spinta_orizzontale + sets.spinta_verticale;
  return {
    week,
    sets,
    squatShare: legs ? Math.round((sets.accosciata / legs) * 100) : null,
    pullPerPush: push ? Math.round((pull / push) * 10) / 10 : null,
    minutes: content.days.map((d) => ({ title: d.title, minutes: estimateDayMinutes(d, week) })),
    fundamentals: [...fundamentals],
  };
}

/** Testo compatto per l'assistente AI. */
export function balanceText(b: Balance): string {
  const s = b.sets;
  const parts = [
    `Serie a settimana (settimana ${b.week + 1}, stima dai nomi degli esercizi): dorso ${s.tirata_verticale + s.tirata_orizzontale} (verticali ${s.tirata_verticale}, orizzontali ${s.tirata_orizzontale}); gambe ${s.accosciata + s.hinge} (accosciata ${s.accosciata}, hinge ${s.hinge}); spinte orizzontali ${s.spinta_orizzontale}; spinte verticali ${s.spinta_verticale}; spalle ${s.spalle}; braccia ${s.braccia}; addome/core ${s.core}; condizionamento ${s.condizionamento}${s.altro ? `; altro ${s.altro}` : ""}.`,
    b.squatShare !== null ? `Gambe: ${b.squatShare}% accosciata, ${100 - b.squatShare}% hinge.` : "",
    b.pullPerPush !== null ? `Tirate per ogni spinta: ${String(b.pullPerPush).replace(".", ",")}.` : "",
    b.fundamentals.length ? `Fondamentali con bilanciere: ${b.fundamentals.join(", ")}.` : "Nessun fondamentale con bilanciere.",
    `Durata stimata delle sedute (compresi cambi, avvicinamento e recuperi): ${b.minutes.map((m) => `${m.title} ~${m.minutes}'`).join(", ")}.`,
  ];
  return parts.filter(Boolean).join("\n");
}
