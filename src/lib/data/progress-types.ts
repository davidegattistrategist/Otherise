/** Tipi dei grafici degli esercizi (anche per i componenti nel browser). */
import type { ExerciseRecord } from "../strength/records";

export type ExerciseSeries = { key: string; name: string; sessions: number; points: Array<{ date: string; value: number }>; record: ExerciseRecord | null };
