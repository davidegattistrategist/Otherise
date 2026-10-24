"use client";

import { useKeepAwake } from "../use-keep-awake";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { blockHeading, itemLabel, type ProgramDay } from "@/lib/program/types";
import { logPlan, restLabel, restSeconds, type LogPlan } from "@/lib/program/logbook";
import { blockTimer, emomItemTimer, fmtClock, restTimerFor, timedSetTimer } from "@/lib/program/timer";
import { TimerBar, useWorkoutTimer } from "./workout-timer";
import { DictateButton } from "@/components/dictate-button";
import { VideoLink } from "@/components/video-link";
import { isOneSideExercise, isPerSideText, summarizeSets, type SetLog } from "@/lib/program/prescription";
import { saveWorkout } from "./actions";
import { cx, fmtNum } from "@/components/ui";
import { IconCheck, IconPlay, IconPlus, IconTrophy } from "@/components/icons";
import { epley, loadFromPercent } from "@/lib/strength/records";
import { RUN_COOLDOWN, RUN_WARMUP, runRx, runTitle, runWarmup } from "@/lib/program/running";
import { RunStep } from "@/components/program-day";

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
  /** Prima di chiudere l'allenamento (es. salva la sessione PT dello staff): un testo = errore, non si chiude */
  /** logbook dello staff: salva la sessione PT (riceve la data dell'allenamento) */
  beforeFinish?: (info: { performedOn: string }) => Promise<string | null>;
  /** Contenuto in fondo, prima della barra (es. sessione PT e note della lezione) */
  footer?: React.ReactNode;
  /**
   * Sessione PT finita a metà allenamento (staff): nella domanda sulle serie
   * non spuntate c'è anche "lo finisce da solo". L'allenamento resta aperto
   * (non "fatto"), così sul suo telefono è ancora il prossimo e lo riprende lì
   * invece di cominciarne un altro.
   */
  leaveOpen?: { label: string; note: string };
};

const numOrNull = (v: string): number | null => {
  const s = v.trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(Math.round(n * 100) / 100).replace(".", ","));

const HINT_KEY = "otherise:logbook-hint";
/** Esercizi a tempo fatti "un lato alla volta" scelti dal cliente (nome → sì/no) */
const SIDE_KEY = "otherise:per-side";

/** Superserie e circuiti: si fa un esercizio dopo l'altro, giro dopo giro */
const inRounds = (b: { kind: string; items: unknown[] }) => (b.kind === "superset" || b.kind === "circuit") && b.items.length > 1;

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

  const run = useMemo(() => runWarmup(day, week), [day, week]);
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
    if (!rec) return; // la prima volta non è un record: è il punto di partenza
    // si ricalcola a ogni modifica: se era un errore di battitura (1000 invece di 100) e lo correggi, il record sparisce
    const drop = () => setPrs((cur) => {
      if (!(it.id in cur)) return cur;
      const next = { ...cur };
      delete next[it.id];
      return next;
    });
    let best: { kg: number; reps: number; e: number } | null = null;
    for (const x of sets) {
      if (typeof x.kg !== "number" || typeof x.reps !== "number" || x.kg <= 0 || x.reps <= 0) continue;
      const e = epley(x.kg, x.reps) ?? 0;
      if (!best || e > best.e) best = { kg: x.kg, reps: x.reps, e };
    }
    if (!best) return drop();
    const heavier = sets.some((x) => typeof x.kg === "number" && x.kg > rec.heaviest && (x.reps ?? 0) > 0);
    if ((rec.e1rm && best.e > rec.e1rm + 0.01) || heavier) {
      const text = heavier ? `${fmtNum(Math.max(...sets.map((x) => (typeof x.kg === "number" ? x.kg : 0))))} kg: il carico più alto di sempre` : `${fmtNum(best.kg)} kg × ${best.reps}: massimale stimato ${fmtNum(best.e, 0)} kg`;
      setPrs((cur) => (cur[it.id] === text ? cur : { ...cur, [it.id]: text }));
    } else drop();
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
  /** ogni modifica conta: un salvataggio partito prima non deve "pulire" quello scritto dopo */
  const edits = useRef(0);
  /** com'erano gli esercizi all'apertura (per sapere quali hai toccato tu) */
  const baseItems = useRef<Record<string, ItemState>>(buildInitial());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef<(() => Promise<boolean>) | null>(null);
  const finishing = useRef(false);
  // chili copiati in automatico dalla serie precedente ("itemId:serie"): seguono la prima serie finché non li cambi
  /** testo dei chili mentre si scrive (così "37," resta "37," finché non si finisce) */
  const [typing, setTyping] = useState<Record<string, string>>({});
  const autoKg = useRef(new Set<string>());
  const [unchecked, setUnchecked] = useState<{ name: string; missing: number; total: number }[] | null>(null);
  /** La prossima serie da fare ("itemId:serie"), evidenziata quando finisce il recupero */
  const [upNext, setUpNext] = useState<string | null>(null);
  const upNextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Esercizi appena finiti (tutte le serie spuntate qui): una riga sola, si riaprono con un tocco */
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggleCollapsed = (id: string, on: boolean) =>
    setCollapsed((cur) => {
      if (cur.has(id) === on) return cur;
      const next = new Set(cur);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  /** Porta in vista l'esercizio dopo (se è sotto la barra o fuori schermo) */
  const scrollToNextItem = (itemId: string, setIndex?: number) => {
    const key = nextSetAfter(itemId, setIndex);
    if (!key || key.startsWith(`${itemId}:`)) return;
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-set="${CSS.escape(key)}"]`)?.closest<HTMLElement>("[data-item]");
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.top < 80 || r.top > window.innerHeight - 240) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  /** La prima volta: cosa sono i numeri grigi nelle caselle */
  const [hint, setHint] = useState(false);
  useEffect(() => {
    if (initial.completed) return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preferenza salvata sul telefono
      if (!localStorage.getItem(HINT_KEY)) setHint(true);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const closeHint = () => {
    setHint(false);
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {}
  };
  const latest = useRef({ items, notes, discomfort, performedOn, completed });
  useEffect(() => {
    latest.current = { items, notes, discomfort, performedOn, completed };
  }, [items, notes, discomfort, performedOn, completed]);

  // Bozza locale: se la connessione salta in palestra non si perde nulla
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(props));
      if (!raw) return;
      const draft = JSON.parse(raw) as { ts: string; base?: string | null; items: Record<string, ItemState>; notes: string; discomfort?: string; performedOn: string };
      // la bozza vale se il server non è cambiato da quando è stata scritta (`base`, l'ora del server:
      // l'orologio del telefono può essere indietro o avanti); le bozze vecchie senza base: come prima
      const usable = draft.base !== undefined ? (draft.base ?? null) === (initial.updatedAt ?? null) : !initial.updatedAt || draft.ts > initial.updatedAt;
      if (usable) {
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

  // un salvataggio alla volta, in fila: "Ho finito" toccato mentre ne parte uno
  // automatico aspetta il suo turno (e legge i dati più recenti), così sul
  // server non può arrivare per ultimo un salvataggio vecchio "non finito"
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const saveNow = useCallback(
    async (opts: { completed?: boolean } = {}) => {
      const s = latest.current;
      const done = opts.completed ?? s.completed;
      const rev = edits.current;
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
          // solo gli esercizi cambiati su questo dispositivo si scrivono sul server
          touchedItems: Object.keys(s.items).filter((id) => JSON.stringify(s.items[id]) !== JSON.stringify(baseItems.current[id] ?? null)),
        });
        if (!res.ok) {
          setStatus({ kind: "error", text: res.error });
          return false;
        }
        // intanto hai scritto altro? allora resta "da salvare" e la copia nel telefono non si tocca
        if (edits.current === rev) {
          dirty.current = false;
          try {
            localStorage.removeItem(storageKey({ programId, week, day }));
          } catch {}
        }
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
  const save = useCallback(
    (opts: { completed?: boolean } = {}): Promise<boolean> => {
      const run = queue.current.then(() => saveNow(opts));
      queue.current = run.catch(() => undefined);
      return run;
    },
    [saveNow],
  );

  // quando torna la rete (o ogni 20 secondi finché manca) riprova da solo;
  // se stavi chiudendo l'allenamento, lo chiude appena il salvataggio riesce
  useEffect(() => {
    saveRef.current = async () => {
      const ok = await save(finishing.current ? { completed: true } : {});
      if (ok && finishing.current) {
        const err = (await props.beforeFinish?.({ performedOn: latest.current.performedOn })) ?? null;
        if (err) {
          setStatus({ kind: "error", text: err });
          return ok;
        }
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
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (upNextTimer.current) clearTimeout(upNextTimer.current);
  }, []);

  const touch = useCallback(() => {
    dirty.current = true;
    edits.current += 1;
    try {
      const s = latest.current;
      localStorage.setItem(storageKey({ programId, week, day }), JSON.stringify({ ts: new Date().toISOString(), base: initial.updatedAt ?? null, items: s.items, notes: s.notes, discomfort: s.discomfort, performedOn: s.performedOn }));
    } catch {}
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(), 1500);
  }, [programId, week, day, save, initial.updatedAt]);

  useEffect(() => {
    const onHide = () => {
      if (dirty.current) void save();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [save]);

  // schermo sempre acceso durante l'allenamento
  useKeepAwake(true);

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

  /**
   * La prima serie ancora da fare dopo quella appena spuntata: nelle superserie
   * e nei circuiti l'esercizio dopo dello stesso giro (rematore 1 → push up 1 →
   * rematore 2…), altrimenti la serie dopo dello stesso esercizio; poi i successivi.
   */
  const nextSetAfter = (itemId: string, setIndex?: number): string | null => {
    const order = day.blocks.flatMap((b) => b.items).filter((it) => plans[it.id].mode !== "text");
    let fromId = itemId;
    const block = day.blocks.find((b) => b.items.some((it) => it.id === itemId));
    if (block && inRounds(block) && setIndex !== undefined) {
      const its = block.items.filter((it) => plans[it.id].mode !== "text");
      const k = its.findIndex((it) => it.id === itemId);
      const setsOf = (id: string) => latest.current.items[id]?.sets ?? [];
      const rounds = Math.max(0, ...its.map((it) => setsOf(it.id).length));
      const pos: Array<[number, number]> = [];
      for (let r = 0; r < rounds; r++) for (let j = 0; j < its.length; j++) pos.push([r, j]);
      const at = pos.findIndex(([r, j]) => r === setIndex && j === k);
      for (const [r, j] of [...pos.slice(at + 1), ...pos.slice(0, Math.max(0, at))]) {
        const x = setsOf(its[j].id)[r];
        if (x && !x.done) return `${its[j].id}:${r}`;
      }
      // giro finito del tutto: si continua dopo il blocco
      fromId = its[its.length - 1]?.id ?? itemId;
    }
    const from = order.findIndex((it) => it.id === fromId);
    for (const it of [...order.slice(from), ...order.slice(0, from)]) {
      const si = (latest.current.items[it.id]?.sets ?? []).findIndex((x) => !x.done);
      if (si >= 0) return `${it.id}:${si}`;
    }
    return null;
  };

  /** Finito (o saltato) il recupero: la prossima serie si illumina e, se è fuori schermo, viene in vista. */
  const showNext = (itemId: string, setIndex?: number) => {
    const key = nextSetAfter(itemId, setIndex);
    if (!key) return;
    setUpNext(key);
    if (upNextTimer.current) clearTimeout(upNextTimer.current);
    upNextTimer.current = setTimeout(() => setUpNext(null), 10_000);
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-set="${CSS.escape(key)}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.top < 80 || r.bottom > window.innerHeight - 180) el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  /** Recupero dopo una serie spuntata: non interrompe un AMRAP, EMOM o intervalli in corso. */
  const startRest = (rest: string, itemId?: string, setIndex?: number) => {
    setUpNext(null);
    const p = restTimerFor(rest);
    if (!p) {
      // niente recupero (es. il primo esercizio di un circuito): si illumina subito il prossimo
      if (itemId) showNext(itemId, setIndex);
      return;
    }
    if (clock.active && clock.active.id !== "rest" && !clock.active.id.startsWith("set:")) return;
    clock.start("rest", p, itemId ? () => showNext(itemId, setIndex) : undefined);
  };

  /** Serie a tempo (es. plank 30"): parte il tempo, alla fine la serie si spunta e parte il recupero. */
  const startTimedSet = (it: { id: string; name: string; rest: string }, seconds: number, perSide: boolean) => {
    const sets = latest.current.items[it.id]?.sets ?? [];
    const si = sets.findIndex((x) => !x.done);
    if (si < 0) return;
    clock.start(`set:${it.id}`, timedSetTimer(seconds, si + 1, sets.length, it.name, perSide), () => {
      update(it.id, (cur) => ({ ...cur, sets: cur.sets.map((x, i) => (i === si ? { ...x, done: true } : x)) }));
      const rest = restTimerFor(it.rest);
      if (rest) clock.start("rest", rest, () => showNext(it.id, si));
      else showNext(it.id, si);
    });
  };

  /** Tempo "per ogni lato": dalla prescrizione o dal nome, oppure come l'ha scelto il cliente. */
  const [sideChoice, setSideChoice] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SIDE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- scelta salvata sul telefono
      if (raw) setSideChoice(JSON.parse(raw) as Record<string, boolean>);
    } catch {}
  }, []);
  const perSideOf = (it: { name: string; notes?: string }, rx: string) => {
    const k = it.name.trim().toLowerCase();
    if (k in sideChoice) return sideChoice[k];
    return isPerSideText(rx) || isPerSideText(it.notes) || isOneSideExercise(it.name);
  };
  const setPerSide = (it: { name: string }, on: boolean) => {
    const next = { ...sideChoice, [it.name.trim().toLowerCase()]: on };
    setSideChoice(next);
    try {
      localStorage.setItem(SIDE_KEY, JSON.stringify(next));
    } catch {}
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

  /** Una serie segnata "fatta come scritto": prende i valori proposti dove è vuota. */
  const filledDone = (it: { id: string; exerciseId?: string | null; name: string }, x: SetLog, si: number, all: SetLog[]): SetLog => {
    if (plans[it.id].mode !== "sets") return { ...x, done: true };
    const sug = suggestion(it, si);
    return { kg: x.kg ?? sug.kg ?? (si > 0 ? all[si - 1].kg ?? null : null), reps: x.reps ?? sug.reps, done: true };
  };

  /** "Segna tutto il circuito come fatto": tutte le serie del blocco, con Annulla. */
  const [blockUndo, setBlockUndo] = useState<{ blockId: string; before: Record<string, ItemState> } | null>(null);
  const markBlockDone = (b: (typeof day.blocks)[number]) => {
    const cur = latest.current.items;
    const before: Record<string, ItemState> = {};
    const next = { ...cur };
    for (const it of b.items) {
      const st = cur[it.id];
      if (!st || plans[it.id].mode === "text") continue;
      before[it.id] = st;
      next[it.id] = { ...st, sets: st.sets.map((x, si, all) => (x.done ? x : filledDone(it, x, si, all))) };
    }
    latest.current = { ...latest.current, items: next };
    setItems(next);
    touch();
    setBlockUndo({ blockId: b.id, before });
    setUpNext(null);
    // il recupero del circuito non serve più
    if (clock.active && (clock.active.id === "rest" || b.items.some((it) => clock.active!.id === `set:${it.id}`))) clock.stop();
    for (const it of b.items) if (plans[it.id].mode === "sets") toggleCollapsed(it.id, true);
    if (hint) closeHint();
    const lastItem = [...b.items].reverse().find((it) => plans[it.id].mode !== "text");
    if (lastItem) scrollToNextItem(lastItem.id);
  };
  const undoBlock = () => {
    if (!blockUndo) return;
    const next = { ...latest.current.items, ...blockUndo.before };
    latest.current = { ...latest.current, items: next };
    setItems(next);
    touch();
    for (const id of Object.keys(blockUndo.before)) toggleCollapsed(id, false);
    setBlockUndo(null);
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
          return filledDone(it, x, si, all);
        });
        next[it.id] = { ...st, sets };
      }
    }
    latest.current = { ...latest.current, items: next };
    setItems(next);
    void finish();
  };

  const finishBusy = useRef(false);
  /** Chiude la sessione lasciando l'allenamento aperto: il cliente lo finisce dal suo telefono. */
  const leaveOpenAndClose = async () => {
    setUnchecked(null);
    if (finishBusy.current) return;
    finishBusy.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      const ok = await save({ completed: false });
      if (!ok) return;
      const err = (await props.beforeFinish?.({ performedOn: latest.current.performedOn })) ?? null;
      if (err) {
        setStatus({ kind: "error", text: err });
        return;
      }
      router.push(`${props.backHref}?aperto=1`);
      router.refresh();
    } finally {
      finishBusy.current = false;
    }
  };

  const finish = async () => {
    // un secondo tocco mentre sta già chiudendo non fa niente
    if (finishBusy.current) return;
    finishBusy.current = true;
    // il salvataggio automatico in attesa non serve più: parte quello finale
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setCompleted(true);
    latest.current = { ...latest.current, completed: true };
    finishing.current = true;
    try {
      const ok = await save({ completed: true });
      if (ok) {
        const err = (await props.beforeFinish?.({ performedOn: latest.current.performedOn })) ?? null;
        if (err) {
          setStatus({ kind: "error", text: err });
          return;
        }
        finishing.current = false;
        router.push(`${props.backHref}?fatto=1${latest.current.discomfort.trim() ? "&fastidio=1" : ""}`);
        router.refresh();
      }
    } finally {
      finishBusy.current = false;
    }
  };

  // per la spiegazione: il primo esercizio a serie con un valore proposto
  const hintItem = hint ? day.blocks.flatMap((b) => b.items).find((it) => plans[it.id]?.mode === "sets") ?? null : null;
  const hintSug = hintItem ? suggestion(hintItem, 0) : null;

  // esercizi finiti (tutte le serie spuntate) sul totale, per la barra in basso
  const countable = day.blocks.flatMap((b) => b.items).filter((it) => plans[it.id].mode !== "text");
  const doneCount = countable.filter((it) => {
    const sets = items[it.id]?.sets ?? [];
    return sets.length > 0 && sets.every((x) => x.done);
  }).length;

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
                <div key={it.id} data-item={it.id} className={cx("flex flex-col gap-2.5", ii > 0 && "border-t border-sand-deep pt-3")}>
                  {run?.before === it.id ? <RunStep label="Prima, riscaldamento" text={RUN_WARMUP} /> : null}
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-7 min-w-7 items-center justify-center rounded-full bg-ink px-1.5 text-xs font-bold text-card">{itemLabel(b, bi, ii)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[17px] leading-snug font-semibold">{runTitle(it.name, rx)}</div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-[15px]">
                        {rx ? <span className="font-bold">{runRx(it.name, rx)}</span> : null}
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
                          <VideoLink url={video} title={it.name} className="inline-flex items-center gap-1 font-semibold text-accent-deep" />
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
                  {plan.mode === "sets" && collapsed.has(it.id) && st.sets.every((x) => x.done) ? (
                    <button
                      type="button"
                      onClick={() => toggleCollapsed(it.id, false)}
                      className="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-sand px-3 text-left"
                      aria-label={`${it.name}: fatto, ${summarizeSets(st.sets) ?? ""}. Tocca per modificare`}
                    >
                      <span className="flex min-w-0 items-center gap-2 font-semibold">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink text-card"><IconCheck size={16} /></span>
                        <span className="min-w-0 break-words tabular">{summarizeSets(st.sets) ?? "Fatto"}</span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-muted underline">Modifica</span>
                    </button>
                  ) : plan.mode === "sets" ? (
                    <div className="flex flex-col gap-1.5">
                      {hintItem?.id === it.id ? (
                        <div className="flex flex-col gap-2 rounded-2xl bg-accent-soft px-3.5 py-3 text-[15px] leading-snug" role="note">
                          <p>
                            <span className="font-semibold">Come si usa:</span>{" "}
                            {hintSug && (hintSug.kg !== null || hintSug.repsText)
                              ? <>in grigio c&apos;è il proposto ({[hintSug.kg !== null ? `${fmtNum(hintSug.kg)} kg` : "", hintSug.repsText ? `× ${hintSug.repsText}` : ""].filter(Boolean).join(" ")}). </>
                              : <>in grigio c&apos;è il proposto, quando c&apos;è. </>}
                            Se l&apos;hai fatta così tocca <span className="inline-flex translate-y-0.5"><IconCheck size={16} /></span>; se è andata diversamente scrivi chili e ripetizioni veri.
                          </p>
                          <button type="button" onClick={closeHint} className="min-h-10 self-start rounded-full bg-ink px-4 text-sm font-semibold text-card">Ho capito</button>
                        </div>
                      ) : null}
                      <div className="grid grid-cols-[2.5rem_1fr_1fr_2.75rem] gap-2 px-0.5 text-[11px] font-semibold tracking-wider text-muted uppercase">
                        <span>Serie</span><span>Kg</span><span>Rip.</span><span className="sr-only">Fatto</span>
                      </div>
                      {st.sets.map((s, si) => (
                        <div key={si} data-set={`${it.id}:${si}`} className={cx("grid grid-cols-[2.5rem_1fr_1fr_2.75rem] items-center gap-2 rounded-xl transition-shadow", upNext === `${it.id}:${si}` && "bg-accent-soft ring-2 ring-accent")}>
                          <span className={cx("text-center text-sm font-semibold tabular", upNext === `${it.id}:${si}` ? "text-accent-deep" : "text-muted")}>{upNext === `${it.id}:${si}` ? <><span className="sr-only">Prossima: serie </span>{si + 1}</> : si + 1}</span>
                          <input
                            aria-label={`${it.name}, serie ${si + 1}, chili`}
                            inputMode="decimal"
                            className="h-11 w-full rounded-xl border border-sand-deep bg-sand px-3 text-[16px] font-semibold tabular"
                            placeholder={fmt(suggestion(it, si).kg)}
                            value={typing[`${it.id}:${si}`] ?? fmt(s.kg)}
                            onBlur={() => setTyping((t) => { const next = { ...t }; delete next[`${it.id}:${si}`]; return next; })}
                            onChange={(e) => {
                              // si tiene il testo com'è scritto (es. "37,"), altrimenti la virgola sparirebbe
                              setTyping((t) => ({ ...t, [`${it.id}:${si}`]: e.target.value }));
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
                              if (willBeDone) {
                                if (hint) closeHint();
                                // ultima serie dell'esercizio: si compatta in una riga e si passa al prossimo
                                const last = st.sets.every((x, i) => i === si || x.done);
                                if (last) toggleCollapsed(it.id, true);
                                if (it.rest || multi) startRest(it.rest, it.id, si);
                                else {
                                  setUpNext(null);
                                  if (last) scrollToNextItem(it.id, si);
                                }
                              }
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
                      <div className="flex items-center gap-1">
                        <input
                          aria-label={`Note su ${it.name}`}
                          className="h-10 min-w-0 flex-1 rounded-xl border border-transparent bg-transparent px-1 text-sm placeholder:text-muted focus:border-sand-deep focus:bg-sand"
                          placeholder="Nota (facoltativa)"
                          value={st.resultText}
                          onChange={(e) => update(it.id, (cur) => ({ ...cur, resultText: e.target.value }))}
                        />
                        <DictateButton onText={(t) => update(it.id, (cur) => ({ ...cur, resultText: cur.resultText ? `${cur.resultText.trimEnd()} ${t}` : t }))} />
                      </div>
                    </div>
                  ) : plan.mode === "check" ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap gap-2">
                        {st.sets.map((s, si) => (
                          <button
                            key={si}
                            type="button"
                            data-set={`${it.id}:${si}`}
                            aria-pressed={Boolean(s.done)}
                            className={cx("flex h-11 min-w-16 items-center justify-center gap-1 rounded-xl px-3 text-sm font-semibold tabular", s.done ? "bg-ink text-card" : upNext === `${it.id}:${si}` ? "bg-accent-soft ring-2 ring-accent" : "bg-sand-deep/70")}
                            onClick={() => {
                              update(it.id, (cur) => ({ ...cur, sets: cur.sets.map((x, i) => (i === si ? { ...x, done: !x.done } : x)) }));
                              if (!s.done && (it.rest || multi)) startRest(it.rest, it.id, si);
                              else setUpNext(null);
                            }}
                          >
                            {s.done ? <IconCheck size={16} /> : null}{plan.label}
                          </button>
                        ))}
                      </div>
                      {timedSeconds(plan.label) && st.sets.some((x) => !x.done) ? (
                        <>
                          <TimerButton
                            running={clock.active?.id === `set:${it.id}`}
                            label={perSideOf(it, rx) ? `Avvia ${plan.label} per lato` : `Avvia ${plan.label}: la serie si spunta da sola`}
                            onClick={() => startTimedSet(it, timedSeconds(plan.label)!, perSideOf(it, rx))}
                          />
                          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm" data-per-side>
                            <input
                              type="checkbox"
                              className="h-5 w-5 shrink-0 accent-[#1b1a17]"
                              checked={perSideOf(it, rx)}
                              onChange={(e) => setPerSide(it, e.target.checked)}
                            />
                            <span><span className="font-semibold">Un lato alla volta</span> <span className="text-muted">· {plan.label} per lato, 5&quot; per cambiare; la serie si spunta da sola</span></span>
                          </label>
                        </>
                      ) : null}
                      <div className="flex items-center gap-1">
                        <input
                          aria-label={`Note su ${it.name}`}
                          className="h-11 min-w-0 flex-1 rounded-xl border border-sand-deep bg-sand px-3 text-[15px]"
                          placeholder="Carico, tempo o note"
                          value={st.resultText}
                          onChange={(e) => update(it.id, (cur) => ({ ...cur, resultText: e.target.value }))}
                        />
                        <DictateButton onText={(t) => update(it.id, (cur) => ({ ...cur, resultText: cur.resultText ? `${cur.resultText.trimEnd()} ${t}` : t }))} />
                      </div>
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
                  {run?.after === it.id ? <RunStep label="Dopo, defaticamento" text={RUN_COOLDOWN} /> : null}
                </div>
              );
            })}
            {multi && b.items.some((it) => plans[it.id].mode !== "text") ? (
              b.items.every((it) => plans[it.id].mode === "text" || (items[it.id]?.sets ?? []).every((x) => x.done)) ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-sand px-4 py-2.5 text-[15px]" data-block-done={b.id}>
                  <span className="inline-flex items-center gap-2 font-semibold"><IconCheck size={18} /> {b.kind === "superset" ? "Superserie fatta" : "Circuito fatto"}</span>
                  {blockUndo?.blockId === b.id ? (
                    <button type="button" onClick={undoBlock} className="min-h-10 px-1 text-sm font-semibold text-muted underline">Annulla</button>
                  ) : null}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => markBlockDone(b)}
                  data-mark-block={b.id}
                  className="flex min-h-12 w-full flex-col items-center justify-center rounded-2xl bg-sand px-4 py-2 text-[15px] font-semibold ring-1 ring-sand-deep"
                >
                  <span className="inline-flex items-center gap-2"><IconCheck size={18} /> {b.kind === "superset" ? "Segna tutta la superserie come fatta" : "Segna tutto il circuito come fatto"}</span>
                  <span className="text-[13px] font-normal text-muted">Dove non hai scritto niente vale quello proposto</span>
                </button>
              )
            ) : null}
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

      {props.footer}

      <div className={cx("sticky z-20 flex flex-col gap-2", props.barClass ?? "bottom-[calc(var(--nav-space)+0.5rem)] md:bottom-4")}>
        <TimerBar timer={clock} />
        <div className="flex items-center gap-3 rounded-full bg-ink p-1.5 pl-5 text-card shadow-lg">
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            {countable.length ? <span className="truncate text-[15px] font-semibold tabular">{doneCount} di {countable.length} esercizi</span> : null}
            <span className={cx("truncate text-sm", status.kind === "error" ? "text-accent" : "text-muted-dark")} aria-live="polite">
              {status.kind === "saving" ? "Salvataggio…" : status.text ?? (completed ? "Sessione completata" : "Si salva da solo")}
            </span>
          </span>
          {status.kind === "error" ? (
            <button type="button" onClick={() => void saveRef.current?.()} className="h-11 shrink-0 rounded-full px-4 text-sm font-semibold text-card ring-1 ring-line-dark">Riprova</button>
          ) : null}
          <button type="button" onClick={askFinish} className="h-11 rounded-full bg-accent px-5 text-[15px] font-bold text-white disabled:opacity-60">
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
            <p className="mt-3 text-[16px] leading-relaxed">Le hai fatte ma non le hai spuntate, o le hai saltate?</p>
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" onClick={() => resolveUnchecked(true)} className="min-h-12 w-full rounded-full bg-ink text-[16px] font-semibold text-card">Le ho fatte: segnale come fatte</button>
              <button type="button" onClick={() => resolveUnchecked(false)} className="min-h-12 w-full rounded-full bg-card text-[16px] font-semibold ring-1 ring-sand-deep">Sì, le ho saltate</button>
              {props.leaveOpen ? (
                <button type="button" onClick={() => void leaveOpenAndClose()} className="flex min-h-12 w-full flex-col items-center justify-center rounded-2xl bg-card px-4 py-2 text-[16px] font-semibold ring-1 ring-sand-deep">
                  {props.leaveOpen.label}
                  <span className="text-[13px] font-normal text-muted">{props.leaveOpen.note}</span>
                </button>
              ) : null}
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
