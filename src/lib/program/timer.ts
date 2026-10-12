/**
 * Timer dell'allenamento (logbook): recuperi, AMRAP, EMOM, intervalli,
 * serie "EMOM" del singolo esercizio e serie a tempo (es. plank 30").
 *
 * Un timer è una sequenza di fasi (lavoro, recupero, "via tra…"): il tempo
 * passato decide in che fase si è. Così pausa e ripresa sono solo un
 * conteggio del tempo trascorso, e se il telefono si blocca per qualche
 * secondo il timer resta giusto.
 */
import type { ProgramBlock } from "./types";
import { restSeconds } from "./logbook";

export type TimerPhaseKind = "lead" | "work" | "rest";
export type TimerPhase = { kind: TimerPhaseKind; label: string; seconds: number };

export type TimerPlan = {
  /** Cosa sta cronometrando: "Recupero", "AMRAP 24 min", "EMOM 12 min"… */
  title: string;
  phases: TimerPhase[];
  /** Si possono aggiungere o togliere 15 secondi (recupero e timer a fase unica) */
  adjustable: boolean;
};

export type TimerState = {
  index: number;
  phase: TimerPhase;
  /** Secondi che mancano alla fine della fase */
  remaining: number;
  /** Quanto della fase è passato (da 0 a 1) */
  progress: number;
  done: boolean;
};

/** Secondi di "Via tra 3, 2, 1" prima dei timer di lavoro. */
export const LEAD_SECONDS = 3;

const lead = (): TimerPhase => ({ kind: "lead", label: "Via tra", seconds: LEAD_SECONDS });

export function totalSeconds(plan: TimerPlan): number {
  return plan.phases.reduce((s, p) => s + p.seconds, 0);
}

/** Dove si trova il timer dopo `elapsed` secondi (pause escluse). */
export function timerAt(plan: TimerPlan, elapsed: number): TimerState {
  let t = Math.max(0, elapsed);
  for (let i = 0; i < plan.phases.length; i++) {
    const phase = plan.phases[i];
    if (t < phase.seconds) {
      return { index: i, phase, remaining: phase.seconds - t, progress: phase.seconds ? t / phase.seconds : 1, done: false };
    }
    t -= phase.seconds;
  }
  const last = plan.phases.length - 1;
  return { index: last, phase: plan.phases[last] ?? { kind: "work", label: "", seconds: 0 }, remaining: 0, progress: 1, done: true };
}

/** "1:05", "0:09", "24:00" */
export function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds - 1e-9));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Recupero tra le serie. */
export function restTimer(seconds: number): TimerPlan {
  return { title: "Recupero", adjustable: true, phases: [{ kind: "rest", label: "Recupero", seconds }] };
}

/** Serie a tempo (plank 30", isometrie…): 3 secondi per prepararsi e poi il lavoro. */
export function timedSetTimer(seconds: number, setNumber: number, sets: number, name = ""): TimerPlan {
  const set = sets > 1 ? `serie ${setNumber}/${sets}` : "serie";
  return {
    title: name ? `${name} · ${set}` : set.charAt(0).toUpperCase() + set.slice(1),
    adjustable: false,
    phases: [lead(), { kind: "work", label: "Lavoro", seconds }],
  };
}

/** Secondi di un recupero scritto come "EMOM 2" / "EMOM 2,5'" (riparti ogni…), altrimenti null. */
export function emomSeconds(rest: string | null | undefined): number | null {
  const m = /^e\.?m\.?o\.?m\.?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:'|’|min\w*)?$/i.exec((rest ?? "").trim());
  if (!m) return null;
  const secs = Math.round(Number(m[1].replace(",", ".")) * 60);
  return secs > 0 ? secs : null;
}

/** Esercizio con recupero "EMOM 2": ogni serie parte allo scoccare dei 2 minuti. */
export function emomItemTimer(rest: string | null | undefined, sets: number): TimerPlan | null {
  const every = emomSeconds(rest);
  if (!every || sets < 1) return null;
  const phases: TimerPhase[] = [lead()];
  for (let i = 1; i <= sets; i++) phases.push({ kind: "work", label: `Serie ${i}/${sets}`, seconds: every });
  return { title: `EMOM ${fmtClock(every)}`, adjustable: false, phases };
}

/** Timer di un blocco AMRAP, EMOM o intervalli (null se mancano i tempi). */
export function blockTimer(b: ProgramBlock): TimerPlan | null {
  if (b.kind === "amrap") {
    if (!b.durationMin) return null;
    const secs = Math.round(b.durationMin * 60);
    return { title: `AMRAP ${b.durationMin} min`, adjustable: false, phases: [lead(), { kind: "work", label: "Più giri possibili", seconds: secs }] };
  }
  if (b.kind === "emom") {
    const every = b.everySec ?? 60;
    const rounds = b.durationMin ? Math.max(1, Math.round((b.durationMin * 60) / every)) : b.rounds ?? null;
    if (!rounds) return null;
    const phases: TimerPhase[] = [lead()];
    for (let i = 1; i <= rounds; i++) phases.push({ kind: "work", label: `Giro ${i}/${rounds}`, seconds: every });
    const name = every === 60 ? "EMOM" : every % 60 === 0 ? `E${every / 60}MOM` : `Ogni ${every}"`;
    const minutes = String(Math.round(((rounds * every) / 60) * 10) / 10).replace(".", ",");
    return { title: `${name} ${minutes} min`, adjustable: false, phases };
  }
  if (b.kind === "interval") {
    const work = b.workSec ?? 0;
    const rest = b.restSec ?? 0;
    if (!work) return null;
    const rounds = b.rounds ?? (b.durationMin ? Math.max(1, Math.floor((b.durationMin * 60) / (work + rest))) : null);
    if (!rounds) return null;
    const phases: TimerPhase[] = [lead()];
    for (let i = 1; i <= rounds; i++) {
      phases.push({ kind: "work", label: `Lavoro ${i}/${rounds}`, seconds: work });
      // dopo l'ultimo giro non c'è recupero: hai finito
      if (rest > 0 && i < rounds) phases.push({ kind: "rest", label: `Recupero ${i}/${rounds}`, seconds: rest });
    }
    return { title: `Intervalli ${work}"/${rest}"`, adjustable: false, phases };
  }
  return null;
}

/** Recupero normale tra le serie (null per "EMOM 2", che ha il suo timer). */
export function restTimerFor(rest: string | null | undefined): TimerPlan | null {
  if (emomSeconds(rest)) return null;
  const s = restSeconds(rest);
  return s && s > 0 ? restTimer(s) : null;
}

/** Aggiunge (o toglie) secondi alla fase in corso, senza andare sotto 1 secondo dalla fine. */
export function adjustPlan(plan: TimerPlan, elapsed: number, delta: number): TimerPlan {
  const at = timerAt(plan, elapsed);
  if (at.done) return plan;
  const phases = plan.phases.map((p, i) => {
    if (i !== at.index) return p;
    const passed = p.seconds - at.remaining;
    return { ...p, seconds: Math.max(Math.ceil(passed) + 1, p.seconds + delta) };
  });
  return { ...plan, phases };
}
