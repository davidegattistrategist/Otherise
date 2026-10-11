/**
 * Indicazioni per l'AI sul singolo cliente (tabella client_ai_profiles).
 * Sono un punto di partenza: l'AI segue sempre il programma più recente del
 * trainer, e alcune indicazioni si aggiornano da sole quando il trainer
 * pubblica un programma che va in un'altra direzione (autoUpdate).
 */
import type { Balance } from "./program/balance";

export const LEVELS = ["principiante", "intermedio", "avanzato"] as const;
export const RUN_LEVELS = ["nessuno", "principiante", "intermedio", "avanzato"] as const;
export const VERTICAL = ["si", "poche", "no"] as const;

export type AiProfile = {
  session_minutes: number | null;
  strength_level: string | null;
  running_level: string | null;
  vertical_push: string | null;
  squat_share: number | null;
  intensity_techniques: boolean | null;
  notes: string;
  /** come scrivere a questo cliente: lo impara l'AI dalle risposte del trainer (solo per le bozze di risposta) */
  reply_lessons: string;
  auto_note: string;
  updated_at: string | null;
};

export const EMPTY_PROFILE: AiProfile = {
  session_minutes: null,
  strength_level: null,
  running_level: null,
  vertical_push: null,
  squat_share: null,
  intensity_techniques: null,
  notes: "",
  reply_lessons: "",
  auto_note: "",
  updated_at: null,
};

const VERTICAL_LABEL: Record<string, string> = { si: "sì, si possono fare", poche: "poche", no: "no, da evitare" };
const RUN_LABEL: Record<string, string> = { nessuno: "non corre", principiante: "principiante", intermedio: "intermedio", avanzato: "avanzato" };

/** Testo per l'AI (vuoto se non c'è nessuna indicazione). */
export function profileText(p: AiProfile | null): string {
  if (!p) return "";
  const lines = [
    p.session_minutes ? `- Tempo per seduta: ${p.session_minutes} minuti` : "",
    p.strength_level ? `- Livello forza/muscolazione: ${p.strength_level}` : "",
    p.running_level ? `- Livello corsa: ${RUN_LABEL[p.running_level] ?? p.running_level}` : "",
    p.vertical_push ? `- Spinte verticali: ${VERTICAL_LABEL[p.vertical_push] ?? p.vertical_push}` : "",
    p.squat_share !== null ? `- Gambe: circa ${p.squat_share}% accosciata e ${100 - p.squat_share}% hinge` : "",
    p.intensity_techniques !== null ? `- Tecniche di intensità (superserie sullo stesso muscolo, cedimenti, serie a scalare): ${p.intensity_techniques ? "sì, concordate" : "no"}` : "",
    p.notes.trim() ? `- Note del trainer: ${p.notes.trim()}` : "",
  ].filter(Boolean);
  if (!lines.length) return "";
  const when = p.updated_at ? ` (aggiornate il ${p.updated_at.slice(0, 10)})` : "";
  return `${lines.join("\n")}${p.auto_note ? `\n- ${p.auto_note}` : ""}\nSono indicazioni${when}, non regole fisse: se il programma più recente del trainer va in un'altra direzione, segui il programma.`;
}

/**
 * Quando il trainer pubblica un programma, le indicazioni che il programma
 * smentisce si riallineano da sole (così non restano "dogmi" dimenticati).
 * Restituisce le modifiche da salvare, o null se non serve niente.
 */
export function autoUpdate(p: AiProfile, b: Balance, programMinutes: number | null, label: string): Partial<AiProfile> | null {
  const patch: Partial<AiProfile> = {};
  const why: string[] = [];
  if (p.squat_share !== null && b.squatShare !== null && Math.abs(b.squatShare - p.squat_share) >= 15) {
    patch.squat_share = Math.round(b.squatShare / 10) * 10;
    why.push(`gambe ${patch.squat_share}% accosciata`);
  }
  if (p.vertical_push === "no" && b.sets.spinta_verticale > 0) {
    patch.vertical_push = b.sets.spinta_verticale > 4 ? "si" : "poche";
    why.push(`spinte verticali: ${patch.vertical_push}`);
  }
  if (programMinutes && programMinutes !== p.session_minutes) {
    patch.session_minutes = programMinutes;
    why.push(`tempo per seduta ${programMinutes}'`);
  }
  if (!why.length) return null;
  patch.auto_note = `Aggiornate in automatico dal programma pubblicato «${label}»: ${why.join(", ")}.`;
  return patch;
}

export function parseProfileForm(fd: FormData): Omit<AiProfile, "auto_note" | "updated_at"> {
  const pick = <T extends readonly string[]>(name: string, allowed: T) => {
    const v = String(fd.get(name) ?? "");
    return (allowed as readonly string[]).includes(v) ? v : null;
  };
  const minutes = Number(fd.get("session_minutes"));
  const auto = fd.get("squat_auto") === "on";
  const share = Number(fd.get("squat_share"));
  const tech = String(fd.get("intensity_techniques") ?? "");
  return {
    session_minutes: Number.isFinite(minutes) && minutes >= 15 && minutes <= 240 ? Math.round(minutes) : null,
    strength_level: pick("strength_level", LEVELS),
    running_level: pick("running_level", RUN_LEVELS),
    vertical_push: pick("vertical_push", VERTICAL),
    squat_share: auto || !Number.isFinite(share) ? null : Math.min(100, Math.max(0, Math.round(share / 10) * 10)),
    intensity_techniques: tech === "si" ? true : tech === "no" ? false : null,
    notes: String(fd.get("notes") ?? "").slice(0, 2000),
    reply_lessons: String(fd.get("reply_lessons") ?? "")
      .split("\n")
      .map((l) => l.trim().replace(/^[-•]\s*/, ""))
      .filter(Boolean)
      .slice(0, 15)
      .map((l) => `- ${l.slice(0, 200)}`)
      .join("\n"),
  };
}

/** Minuti da una risposta scritta a mano ("60", "75 minuti", "un'ora e mezza"). */
export function minutesFromAnswer(text: string): number | null {
  const t = text.toLowerCase();
  if (/ora e mezz|1h ?30|1 ?h ?e ?30/.test(t)) return 90;
  if (/ora e un quarto/.test(t)) return 75;
  if (/due ore|2 ?h\b|2 ore/.test(t)) return 120;
  const m = /(\d{2,3})/.exec(t);
  if (m) {
    const n = Number(m[1]);
    return n >= 15 && n <= 240 ? n : null;
  }
  if (/\bun'?ora\b|1 ?h\b|1 ora/.test(t)) return 60;
  return null;
}
