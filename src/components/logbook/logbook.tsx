"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { blockHeading, itemLabel, type ProgramDay } from "@/lib/program/types";
import { logPlan, restLabel, restSeconds, type LogPlan } from "@/lib/program/logbook";
import { blockTimer, emomItemTimer, fmtClock, restTimerFor, timedSetTimer } from "@/lib/program/timer";
import { TimerBar, useWorkoutTimer } from "./workout-timer";
import { DictateButton } from "@/components/dictate-button";
import type { SetLog } from "@/lib/program/prescription";
import { saveWorkout } from "./actions";
import { cx, fmtNum } from "@/components/ui";
import { IconCheck, IconPlay, IconPlus, IconTrophy } from "@/components/icons";
import { epley, loadFromPercent } from "@/lib/strength/records";

type ItemState = { sets: SetLog[]; resultText: string };
type Last = { date: string; summary: string };

export type LogbookProps = {
  programId: string;
  week: number;
  day: ProgramDay;
  today: string;
  initial: { performedOn: string; completed: boolean; notes: string; discomfort: string; items: Record<string, ItemState>; updatedAt: string | null };
  last: Record<string, Last>;
  /** Serie dell'ultima volta per esercizio (id o nome minuscolo): diventano i valori proposti */
  lastSets?: Record<string, SetLog[]>;
  /** Record per esercizio: massimale stimato e carico più alto mai registrati */
  records?: Record<string, { e1rm: number | null; heaviest: number }>;
  /** Massimali per le prescrizioni in % (es. "5x5 @75%") */
  maxes?: Record<string, number>;
  videos: Record<string, string>;
  backHref: string;
  /** Pulsante finale: il cliente torna alla sua home, lo staff alla scheda */
  finishLabel?: string;
  /** Posizione della barra in basso (sopra il menu del telefono) */
  barClass?: string;
};

const numOrNull = (v: string): number | null => {
  const s = v.trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

function storageKey(p: { programId: string; week: number; day: ProgramDay }) {
  return `otherise:log:${p.programId}:${p.week}:${p.day.id}`;
}

export function Logbook(props: LogbookProps) {
  const { programId, week, day, today, initial, last, videos } = props;
  const lastSets = props.lastSets ?? {};
  const records = props.records ?? {};
  const maxes = props.maxes ?? {};
  const keyOf = (it: { exerciseId?: string | null; name: string }) => [it.exerciseId, it.name.trim().toLowerCase()].filter(Boolean) as string[];
  const pick = <T,>(map: Record<string, T>, it: { exerciseId?: string | null; name: string }): T | undefined => {
    for (const k of keyOf(it)) if (map[k] !== undefined) return map[k];
    return undefined;
  };
  const router = useRouter();

  const plans = useMemo(() => {
    const m: Record<string, LogPlan & { pctKg?: number | null }> = {};
    for (const b of day.blocks) {
      for (const it of b.items) {
        const plan = logPlan(it, b, week);
        if (plan.mode === "sets" && plan.kgHint === null && plan.pct) {
          const max = pick(maxes, it);
          const kg = max ? loadFromPercent(plan.pct, max) : null;
          m[it.id] = { ...plan, kgHint: kg, pctKg: kg };
        } else m[it.id] = plan;
      }
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, week, maxes]);

  const blockPlans = useMemo(() => Object.fromEntries(day.blocks.map((b) => [b.id, blockTimer(b)])), [day]);

  /** Valori proposti per una serie: dal programma, altrimenti dall'ultima volta */
  const suggestion = (it: { id: string; exerciseId?: string | null; name: string }, si: number) => {
    const plan = plans[it.id];
    if (plan.mode !== "sets") return { kg: null as number | null, reps: null as number | null, repsText: "" };
    const prev = pick(lastSets, it) ?? [];
    const prevSet = prev[si] ?? prev[prev.length - 1];
    const kg = plan.kgHint ?? (typeof prevSet?.kg === "number" ? prevSet.kg : null);
    const reps = /^\d+$/.test(plan.repsHint) ? Number(plan.repsHint) : null;
    return { kg, reps, repsText: plan.repsHint };
  };

  const [prs, setPrs] = useState<Record<string, string>>({});
  const checkRecord = (it: { id: string; exerciseId?: string | null; name: string }, sets: SetLog[]) => {
    const rec = pick(records, it);
    if (!rec || prs[it.id]) return; // la prima volta non è un record: è il punto di partenza
    let best: { kg: number; reps: number; e: number } | null = null;
    for (const x of sets) {
      if (typeof x.kg !== "number" || typeof x.reps !== "number" || x.kg <= 0 || x.reps <= 0) continue;
      const e = epley(x.kg, x.reps) ?? 0;
      if (!best || e > best.e) best = { kg: x.kg, reps: x.reps, e };
    }
    if (!best) return;
    const heavier = sets.some((x) => typeof x.kg === "number" && x.kg > rec.heaviest && (x.reps ?? 0) > 0);
    if ((rec.e1rm && best.e > rec.e1rm + 0.01) || heavier) {
      setPrs((cur) => ({ ...cur, [it.id]: heavier ? `${fmtNum(Math.max(...sets.map((x) => (typeof x.kg === "number" ? x.kg : 0))))} kg: il carico più alto di sempre` : `${fmtNum(best!.kg)} kg × ${best!.reps}: massimale stimato ${fmtNum(best!.e, 0)} kg` }));
    }
  };

  const buildInitial = () => {
    const out: Record<string, ItemState> = {};
    for (const b of day.blocks) {
      for (const it of b.items) {
        const saved = initial.items[it.id];
        const plan = plans[it.id];
        const rows = plan.mode === "text" ? 0 : plan.rows;
        const sets = saved?.sets?.length ? saved.sets : Array.from({ length: rows }, () => ({ kg: null, reps: null }));
        out[it.id] = { sets, resultText: saved?.resultText ?? "" };
      }
    }
    return out;
  };

  const [items, setItems] = useState<Record<string, ItemState>>(buildInitial);
  const [notes, setNotes] = useState(initial.notes);
  const [discomfort, setDiscomfort] = useState(initial.discomfort);
  const [showDiscomfort, setShowDiscomfort] = useState(Boolean(initial.discomfort));
  const [performedOn, setPerformedOn] = useState(initial.performedOn);
  const [completed, setCompleted] = useState(initial.completed);
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "saved" | "error"; text?: string }>({ kind: "idle" });
  const clock = useWorkoutTimer();
  const dirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef<(() => Promise<boolean>) | null>(null);
  const finishing = useRef(false);
  // chili copiati in automatico dalla serie precedente ("itemId:serie"): seguono la prima serie finché non li cambi
  const autoKg = useRef(new Set<string>());
  const [unchecked, setUnchecked] = useState<{ name: string; missing: number; total: number }[] | null>(null);
  const latest = useRef({ items, notes, discomfort, performedOn, completed });
  useEffect(() => {
    latest.current = { items, notes, discomfort, performedOn, completed };
  }, [items, notes, discomfort, performedOn, completed]);

  // Bozza locale: se la connessione salta in palestra non si perde nulla
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(props));
      if (!raw) return;
      const draft = JSON.parse(raw) as { ts: string; items: Record<string, ItemState>; notes: string; discomfort?: string; performedOn: string };
      if (!initial.updatedAt || draft.ts > initial.updatedAt) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- ripristino della bozza salvata sul telefono
        setItems((cur) => ({ ...cur, ...draft.items }));
        setNotes(draft.notes);
        if (draft.discomfort) {
          setDiscomfort(draft.discomfort);
          setShowDiscomfort(true);
        }
        setPerformedOn(draft.performedOn);
        dirty.current = true;
        setStatus({ kind: "idle", text: "Ripreso da dove eri rimasto" });
        // la bozza ripresa dal telefono va mandata subito, non al prossimo tocco
        retryTimer.current = setTimeout(() => void saveRef.current?.(), 800);
      } else {
        localStorage.removeItem(storageKey(props));
      }
    } catch {
      /* archiviazione locale non disponibile */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(
    async (opts: { completed?: boolean } = {}) => {
      const s = latest.current;
      const done = opts.completed ?? s.completed;
      setStatus({ kind: "saving" });
      try {
        const res = await saveWorkout({
          programId,
          week,
          dayId: day.id,
          performedOn: s.performedOn,
          completed: done,
          notes: s.notes,
          discomfort: s.discomfort,
          items: Object.entries(s.items).map(([itemId, v]) => ({ itemId, sets: v.sets.map((x) => ({ kg: x.kg ?? null, reps: x.reps ?? null, done: x.done })), resultText: v.resultText })),
        });
        if (!res.ok) {
          setStatus({ kind: "error", text: res.error });
          return false;
        }
        dirty.current = false;
        try {
          localStorage.removeItem(storageKey({ programId, week, day }));
        } catch {}
        const t = new Date(res.savedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
        setStatus({ kind: "saved", text: `Salvato alle ${t}` });
        return true;
      } catch {
        setStatus({ kind: "error", text: "Offline: salvo appena torna la rete" });
        return false;
      }
    },
    [programId, week, day],
  );

  // quando torna la rete (o ogni 20 secondi finché manca) riprova da solo;
  // se stavi chiudendo l'allenamento, lo chiude appena il salvataggio riesce
  useEffect(() => {
    saveRef.current = async () => {
      const ok = await save(finishing.current ? { completed: true } : {});
      if (ok && finishing.current) {
        finishing.current = false;
        router.push(`${props.backHref}?fatto=1${latest.current.discomfort.trim() ? "&fastidio=1" : ""}`);
        router.refresh();
      }
      return ok;
    };
  });
  useEffect(() => {
    if (status.kind !== "error") return;
    const retry = () => {
      if (dirty.current || finishing.current) void saveRef.current?.();
    };
    window.addEventListener("online", retry);
    const id = setInterval(retry, 20000);
    return () => {
      window.removeEventListener("online", retry);
      clearInterval(id);
    };
  }, [status.kind]);
  useEffect(() => () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
  }, []);

  const touch = useCallback(() => {
    dirty.current = true;
    try {
      const s = latest.current;
      localStorage.setItem(storageKey({ programId, week, day }), JSON.stringify({ ts: new Date().toISOString(), items: s.items, notes: s.notes, discomfort: s.discomfort, performedOn: s.performedOn }));
    } catch {}
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(), 1500);
  }, [programId, week, day, save]);

  useEffect(() => {
    const onHide = () => {
      if (dirty.current) void save();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [save]);

  // schermo sempre acceso durante l'allenamento (dove il telefono lo permette)
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const get = () => {
      if (document.visibilityState === "visible" && nav.wakeLock) nav.wakeLock.request("screen").then((l) => (lock = l)).catch(() => undefined);
    };
    get();
    document.addEventListener("visibilitychange", get);
    return () => {
      document.removeEventListener("visibilitychange", get);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  const itemById = useMemo(() => new Map(day.blocks.flatMap((b) => b.items).map((it) => [it.id, it])), [day]);
  const update = (itemId: string, fn: (s: ItemState) => ItemState) => {
    const cur = latest.current.items;
    const next = { ...cur, [itemId]: fn(cur[itemId]) };
    latest.current = { ...latest.current, items: next };
    setItems(next);
    touch();
    const it = itemById.get(itemId);
    if (it) checkRecord(it, next[itemId].sets.filter((x) => x.done || (x.kg !== null && x.reps !== null)));
  };

  /** Recupero dopo una serie spuntata: non interrompe un AMRAP, EMOM o intervalli in corso. */
  const startRest = (rest: string) => {
    const p = restTimerFor(rest);
    if (!p) return;
    if (clock.active && clock.active.id !== "rest" && !clock.active.id.startsWith("set:")) return;
    clock.start("rest", p);
  };

  /** Serie a tempo (es. plank 30"): parte il tempo, alla fine la serie si spunta e parte il recupero. */
  const startTimedSet = (it: { id: string; name: string; rest: string }, seconds: number) => {
    const sets = latest.current.items[it.id]?.sets ?? [];
    const si = sets.findIndex((x) => !x.done);
    if (si < 0) return;
    clock.start(`set:${it.id}`, timedSetTimer(seconds, si + 1, sets.length, it.name), () => {
      update(it.id, (cur) => ({ ...cur, sets: cur.sets.map((x, i) => (i === si ? { ...x, done: true } : x)) }));
      const rest = restTimerFor(it.rest);
      if (rest) clock.start("rest", rest);
    });
  };

  /** Serie non spuntate, per esercizio (solo dove si spuntano le serie). */
  const uncheckedSets = () => {
    const out: { name: string; missing: number; total: number }[] = [];
    for (const b of day.blocks) {
      for (const it of b.items) {
        const plan = plans[it.id];
        if (plan.mode === "text") continue;
        const sets = latest.current.items[it.id]?.sets ?? [];
        const missing = sets.filter((x) => !x.done).length;
        if (missing) out.push({ name: it.name, missing, total: sets.length });
      }
    }
    return out;
  };

  /** "Ho finito": se qualche serie non è spuntata, prima lo chiede. */
  const askFinish = () => {
    const list = initial.completed ? [] : uncheckedSets();
    if (list.length) setUnchecked(list);
    else void finish();
  };

  /** Dalla domanda finale: segna come fatte le serie non spuntate, o le lascia come saltate. */
  const resolveUnchecked = (markDone: boolean) => {
    setUnchecked(null);
    const cur = latest.current.items;
    const next: Record<string, ItemState> = {};
    for (const b of day.blocks) {
      for (const it of b.items) {
        const st = cur[it.id];
        if (!st || plans[it.id].mode === "text") {
          if (st) next[it.id] = st;
          continue;
        }
        const sets = st.sets.map((x, si, all) => {
          if (x.done) return x;
          if (!markDone) {
            // serie saltata: senza ripetizioni il carico proposto non va registrato
            return x.reps === null || x.reps === undefined ? { ...x, kg: null } : x;
          }
          if (plans[it.id].mode !== "sets") return { ...x, done: true };
          const sug = suggestion(it, si);
          return { kg: x.kg ?? sug.kg ?? (si > 0 ? all[si - 1].kg ?? null : null), reps: x.reps ?? sug.reps, done: true };
        });
        next[it.id] = { ...st, sets };
      }
    }
    latest.current = { ...latest.current, items: next };
    setItems(next);
    void finish();
  };

  const finish = async () => {
    setCompleted(true);
    latest.current = { ...latest.current, completed: true };
    finishing.current = true;
    const ok = await save({ completed: true });
    if (ok) {
      finishing.current = false;
      router.push(`${props.backHref}?fatto=1${latest.current.discomfort.trim() ? "&fastidio=1" : ""}`);
      router.refresh();
    }
  };

  const lastFor = (it: { exerciseId?: string | null; name: string }) => (it.exerciseId && last[it.exerciseId]) || last[it.name.trim().toLowerCase()] || null;
  const videoFor = (it: { exerciseId?: string | null; name: string }) => (it.exerciseId && videos[it.exerciseId]) || videos[it.name.trim().toLowerCase()] || null;

  return (
    <div className="flex flex-col gap-4">
      {day.notes ? <p className="rounded-2xl bg-card px-4 py-3 text-[15px] whitespace-pre-line">{day.notes}</p> : null}

      {day.blocks.map((b, bi) => {
        if (b.kind === "text") {
          return (
            <section key={b.id} className="rounded-[24px] bg-sand-deep/50 px-5 py-4">
              {b.title ? <h2 className="font-semibold">{b.title}</h2> : null}
              <p className="text-[15px] whitespace-pre-line text-ink-soft">{b.notes}</p>
            </section>
          );
        }
        const multi = b.kind !== "single";
        return (
          <section key={b.id} className={cx("flex flex-col gap-3 rounded-[24px] bg-card p-4 sm:p-5", multi && "ring-1 ring-sand-deep")}>
            {multi ? (
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h2 className="text-[13px] font-bold tracking-wider uppercase">{blockHeading(b).title}</h2>
                <span className="text-sm font-semibold text-accent-deep">{blockHeading(b).detail}</span>
                {b.notes ? <p className="w-full text-sm text-muted">{b.notes}</p> : null}
                {blockPlans[b.id] ? (
                  <TimerButton
                    running={clock.active?.id === `block:${b.id}`}
                    label="Avvia il timer"
                    onClick={() => clock.start(`block:${b.id}`, blockPlans[b.id]!)}
                  />
                ) : null}
              </div>
            ) : null}
            {b.items.map((it, ii) => {
              const plan = plans[it.id];
              const st = items[it.id];
              const rx = it.prescriptions[week - 1] || "";
              const prev = lastFor(it);
              const video = videoFor(it);
              return (
                <div key={it.id} className={cx("flex flex-col gap-2.5", ii > 0 && "border-t border-sand-deep pt-3")}>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-7 min-w-7 items-center justify-center rounded-full bg-ink px-1.5 text-xs font-bold text-card">{itemLabel(b, bi, ii)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[17px] leading-snug font-semibold">{it.name}</div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-[15px]">
                        {rx ? <span className="font-bold">{rx}</span> : null}
                        {plan.mode === "sets" && plan.pct ? (
                          <span className="font-semibold text-accent-deep">{plan.kgHint ? `≈ ${fmtNum(plan.kgHint)} kg` : "massimale non ancora misurato"}</span>
                        ) : null}
                        {it.rest ? <span className="text-muted">{/^emom/i.test(it.rest.trim()) ? restLabel(it.rest) : `rec. ${it.rest}`}</span> : null}
                      </div>
                      {prs[it.id] ? (
                        <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white" role="status">
                          <IconTrophy size={16} /> Nuovo record! {prs[it.id]}
                        </p>
                      ) : null}
                      {it.notes ? <p className="mt-1 text-sm text-ink-soft">{it.notes}</p> : null}
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        {prev ? <span className="text-muted">Ultima volta: <span className="font-semibold text-ink">{prev.summary}</span></span> : null}
                        {video ? (
                          <a href={video} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-accent-deep"><IconPlay size={14} /> Video</a>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {plan.mode !== "text" && emomItemTimer(it.rest, st.sets.length) ? (
                    <TimerButton
                      running={clock.active?.id === `emom:${it.id}`}
                      label={`Avvia l'EMOM: una serie ogni ${fmtClock(emomItemTimer(it.rest, st.sets.length)!.phases[1].seconds)}`}
                      onClick={() => clock.start(`emom:${it.id}`, emomItemTimer(it.rest, st.sets.length)!)}
                    />
                  ) : null}
                  {plan.mode === "sets" ? (
                    <div className="flex flex-col gap-1.5">
                      <div className="grid grid-cols-[2.5rem_1fr_1fr_2.75rem] gap-2 px-0.5 text-[11px] font-semibold tracking-wider text-muted uppercase">
                        <span>Serie</span><span>Kg</span><span>Rip.</span><span className="sr-only">Fatto</span>
                      </div>
                      {st.sets.map((s, si) => (
                        <div key={si} className="grid grid-cols-[2.5rem_1fr_1fr_2.75rem] items-center gap-2">
                          <span className="text-center text-sm font-semibold text-muted tabular">{si + 1}</span>
                          <input
                            aria-label={`${it.name}, serie ${si + 1}, chili`}
                            inputMode="decimal"
                            className="h-11 w-full rounded-xl border border-sand-deep bg-sand px-3 text-[16px] font-semibold tabular"
                            placeholder={fmt(suggestion(it, si).kg)}
                            value={fmt(s.kg)}
                            onChange={(e) => {
                              const kg = numOrNull(e.target.value);
                              autoKg.current.delete(`${it.id}:${si}`);
                              // lo stesso carico va proposto nelle serie successive ancora da fare
                              update(it.id, (cur) => ({
                                ...cur,
                                sets: cur.sets.map((x, i) => {
                                  if (i === si) return { ...x, kg };
                                  if (i < si || x.done) return x;
                                  const key = `${it.id}:${i}`;
                                  if (x.kg !== null && x.kg !== undefined && !autoKg.current.has(key)) return x;
                                  if (kg === null) autoKg.current.delete(key);
                                  else autoKg.current.add(key);
                                  return { ...x, kg };
                                }),
                              }));
                            }}
                          />
                          <input
                            aria-label={`${it.name}, serie ${si + 1}, ripetizioni`}
                            inputMode="numeric"
                            className="h-11 w-full rounded-xl border border-sand-deep bg-sand px-3 text-[16px] font-semibold tabular"
                            placeholder={plan.repsHint}
                            value={fmt(s.reps)}
                            onChange={(e) => {
                              const n = numOrNull(e.target.value);
                              update(it.id, (cur) => ({ ...cur, sets: cur.sets.map((x, i) => (i === si ? { ...x, reps: n === null ? null : Math.round(n) } : x)) }));
                            }}
                          />
                          <button
                            type="button"
                            aria-label={s.done ? "Serie fatta" : "Segna la serie come fatta"}
                            aria-pressed={Boolean(s.done)}
                            className={cx("flex h-11 w-11 items-center justify-center rounded-xl", s.done ? "bg-ink text-card" : "bg-sand-deep/70 text-muted")}
                            onClick={() => {
                              const willBeDone = !s.done;
                              update(it.id, (cur) => ({
                                ...cur,
                                sets: cur.sets.map((x, i) => {
                                  if (i !== si) return x;
                                  if (!willBeDone) return { ...x, done: false };
                                  // "fatto come scritto": riempie con i valori proposti se vuoti
                                  const sug = suggestion(it, si);
                                  const reps = x.reps ?? sug.reps;
                                  const kg = x.kg ?? sug.kg ?? (si > 0 ? cur.sets[si - 1].kg ?? null : null);
                                  return { kg, reps, done: true };
                                }),
                              }));
                              if (willBeDone && it.rest) startRest(it.rest);
                            }}
                          >
                            <IconCheck size={20} />
                          </button>
                        </div>
                      ))}
                      <div className="flex gap-2 text-sm font-semibold">
                        <button type="button" className="inline-flex min-h-11 items-center gap-1 pr-2 text-ink-soft" onClick={() => update(it.id, (cur) => ({ ...cur, sets: [...cur.sets, { kg: cur.sets[cur.sets.length - 1]?.kg ?? null, reps: null }] }))}>
                          <IconPlus size={16} /> serie
                        </button>
                        {st.sets.length > 1 ? (
                          <button type="button" className="min-h-11 px-2 text-muted" onClick={() => update(it.id, (cur) => ({ ...cur, sets: cur.sets.slice(0, -1) }))}>− serie</button>
                        ) : null}
                      </div>
                      <input
                        aria-label={`Note su ${it.name}`}
                        className="h-10 rounded-xl border border-transparent bg-transparent px-1 text-sm placeholder:text-muted focus:border-sand-deep focus:bg-sand"
                        placeholder="Una nota? (es. ultima serie pesante, fastidio al ginocchio)"
                        value={st.resultText}
                        onChange={(e) => update(it.id, (cur) => ({ ...cur, resultText: e.target.value }))}
                      />
                    </div>
                  ) : plan.mode === "check" ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap gap-2">
                        {st.sets.map((s, si) => (
                          <button
                            key={si}
                            type="button"
                            aria-pressed={Boolean(s.done)}
                            className={cx("flex h-11 min-w-16 items-center justify-center gap-1 rounded-xl px-3 text-sm font-semibold tabular", s.done ? "bg-ink text-card" : "bg-sand-deep/70")}
                            onClick={() => {
                              update(it.id, (cur) => ({ ...cur, sets: cur.sets.map((x, i) => (i === si ? { ...x, done: !x.done } : x)) }));
                              if (!s.done && it.rest) startRest(it.rest);
                            }}
                          >
                            {s.done ? <IconCheck size={16} /> : null}{plan.label}
                          </button>
                        ))}
                      </div>
                      {timedSeconds(plan.label) && st.sets.some((x) => !x.done) ? (
                        <TimerButton
                          running={clock.active?.id === `set:${it.id}`}
                          label={`Avvia ${plan.label}: la serie si spunta da sola`}
                          onClick={() => startTimedSet(it, timedSeconds(plan.label)!)}
                        />
                      ) : null}
                      <input
                        aria-label={`Note su ${it.name}`}
                        className="h-11 rounded-xl border border-sand-deep bg-sand px-3 text-[15px]"
                        placeholder="Carico, tempo o note (facoltativo)"
                        value={st.resultText}
                        onChange={(e) => update(it.id, (cur) => ({ ...cur, resultText: e.target.value }))}
                      />
                    </div>
                  ) : (
                    <input
                      aria-label={`Com'è andata: ${it.name}`}
                      className="h-11 rounded-xl border border-sand-deep bg-sand px-3 text-[15px]"
                      placeholder={b.kind === "amrap" && ii === 0 ? "Giri completati, carico…" : "Com'è andata? Carico, tempo, giri…"}
                      value={st.resultText}
                      onChange={(e) => update(it.id, (cur) => ({ ...cur, resultText: e.target.value }))}
                    />
                  )}
                </div>
              );
            })}
          </section>
        );
      })}

      <section className="flex flex-col gap-3 rounded-[24px] bg-card p-4 sm:p-5">
        <div className="flex items-end justify-between gap-2">
          <label htmlFor="session-notes" className="mb-1.5 font-semibold">Com&apos;è andata in generale?</label>
          <DictateButton
            onText={(t) => {
              const v = latest.current.notes;
              const next = v ? `${v.trimEnd()} ${t}` : t;
              setNotes(next);
              latest.current = { ...latest.current, notes: next };
              touch();
            }}
          />
        </div>
        <textarea
          id="session-notes"
          rows={3}
          className="rounded-xl border border-sand-deep bg-sand px-3 py-2.5 text-[15px] leading-relaxed"
          placeholder="Energia, sensazioni, qualcosa da dire al coach (facoltativo)"
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            latest.current = { ...latest.current, notes: e.target.value };
            touch();
          }}
        />
        {showDiscomfort ? (
          <div className="flex flex-col gap-2 rounded-2xl bg-accent-soft p-3">
            <div className="flex items-end justify-between gap-2">
              <label htmlFor="session-discomfort" className="mb-1.5 text-[15px] font-semibold">Dolore o fastidio</label>
              <DictateButton
                onText={(t) => {
                  const v = latest.current.discomfort;
                  const next = v ? `${v.trimEnd()} ${t}` : t;
                  setDiscomfort(next);
                  latest.current = { ...latest.current, discomfort: next };
                  touch();
                }}
              />
            </div>
            <textarea
              id="session-discomfort"
              rows={2}
              className="rounded-xl border border-sand-deep bg-card px-3 py-2.5 text-[15px] leading-relaxed"
              placeholder="Dove, durante quale esercizio, quanto forte"
              value={discomfort}
              onChange={(e) => {
                setDiscomfort(e.target.value);
                latest.current = { ...latest.current, discomfort: e.target.value };
                touch();
              }}
            />
            <p className="text-sm text-ink-soft">Lo legge subito il tuo coach e ti dice come procedere. Nel frattempo non forzare.</p>
          </div>
        ) : (
          <button type="button" onClick={() => setShowDiscomfort(true)} className="flex min-h-11 items-center self-start text-sm font-semibold underline">Hai sentito dolore o fastidio? Dillo al coach</button>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="performed-on" className="text-sm text-muted">Fatto il</label>
          <input
            id="performed-on"
            type="date"
            max={today}
            className="h-11 rounded-xl border border-sand-deep bg-sand px-3 text-[15px]"
            value={performedOn}
            onChange={(e) => {
              setPerformedOn(e.target.value);
              latest.current = { ...latest.current, performedOn: e.target.value };
              touch();
            }}
          />
        </div>
      </section>

      <div className={cx("sticky z-20 flex flex-col gap-2", props.barClass ?? "bottom-[calc(var(--nav-space)+0.5rem)] md:bottom-4")}>
        <TimerBar timer={clock} />
        <div className="flex items-center gap-3 rounded-full bg-ink p-1.5 pl-5 text-card shadow-lg">
          <span className={cx("min-w-0 flex-1 truncate text-sm", status.kind === "error" ? "text-accent" : "text-muted-dark")} aria-live="polite">
            {status.kind === "saving" ? "Salvataggio…" : status.text ?? (completed ? "Sessione completata" : "Si salva da solo")}
          </span>
          {status.kind === "error" ? (
            <button type="button" onClick={() => void saveRef.current?.()} className="h-11 shrink-0 rounded-full px-4 text-sm font-semibold text-card ring-1 ring-line-dark">Riprova</button>
          ) : null}
          <button type="button" onClick={askFinish} disabled={status.kind === "saving"} className="h-11 rounded-full bg-accent px-5 text-[15px] font-bold text-white disabled:opacity-60">
            {initial.completed ? "Salva" : props.finishLabel ?? "Ho finito"}
          </button>
        </div>
      </div>

      {unchecked ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Serie non spuntate">
          <div className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-sand px-5 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:rounded-[28px]">
            <h2 className="text-[22px] leading-tight font-semibold">Alcune serie non sono spuntate</h2>
            <ul className="mt-3 flex flex-col gap-1.5 text-[15px]">
              {unchecked.map((u, i) => (
                <li key={i} className="flex justify-between gap-3 rounded-xl bg-card px-3 py-2">
                  <span className="min-w-0 font-semibold">{u.name}</span>
                  <span className="shrink-0 text-muted tabular">{u.missing === u.total ? (u.total === 1 ? "non spuntata" : `tutte e ${u.total}`) : `${u.missing} su ${u.total}`}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[16px] leading-relaxed">Le hai fatte e ti sei dimenticato di spuntarle, o le hai saltate?</p>
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" onClick={() => resolveUnchecked(true)} className="min-h-12 w-full rounded-full bg-ink text-[16px] font-semibold text-card">Le ho fatte: segnale come fatte</button>
              <button type="button" onClick={() => resolveUnchecked(false)} className="min-h-12 w-full rounded-full bg-card text-[16px] font-semibold ring-1 ring-sand-deep">Sì, le ho saltate</button>
              <button type="button" onClick={() => setUnchecked(null)} className="min-h-11 text-sm font-semibold text-muted underline">Torno all&apos;allenamento</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Secondi di una serie a tempo dall'etichetta ("30\"", "1'30\""), null per le distanze. */
function timedSeconds(label: string): number | null {
  return /["”″'’]$/.test(label.trim()) ? restSeconds(label) : null;
}

function TimerButton({ running, label, onClick }: { running: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={running}
      className={cx("mt-1 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-4 text-[15px] font-semibold", running ? "bg-sand-deep/60 text-muted" : "bg-ink text-card")}
    >
      <IconPlay size={16} /> {running ? "Timer in corso (in basso)" : label}
    </button>
  );
}
