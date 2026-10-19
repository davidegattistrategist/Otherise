"use client";

/**
 * Timer dell'allenamento nel logbook: uno alla volta (recupero, AMRAP, EMOM,
 * intervalli, serie a tempo), con pausa e ripresa, bip e vibrazione a ogni
 * cambio di fase e negli ultimi 3 secondi. Il tempo si calcola dall'orologio,
 * quindi resta giusto anche se il telefono rallenta o va in pausa un attimo.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { adjustPlan, fmtClock, timerAt, type TimerPlan, type TimerState } from "@/lib/program/timer";
import { cx } from "@/components/ui";
import { IconPause, IconPlay, IconRestart, IconSound, IconSoundOff, IconX } from "@/components/icons";

type Active = { id: string; plan: TimerPlan; startedAt: number; banked: number; running: boolean };

const SOUND_KEY = "otherise:timer-sound";

export function useWorkoutTimer() {
  const [active, setActive] = useState<Active | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [sound, setSound] = useState(true);
  const onDone = useRef<(() => void) | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const last = useRef<{ index: number; sec: number } | null>(null);
  const soundRef = useRef(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(SOUND_KEY) === "off") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- preferenza salvata sul telefono
        setSound(false);
        soundRef.current = false;
      }
    } catch {}
  }, []);

  /** L'audio va acceso durante un tocco (iPhone non lo permette altrimenti). */
  const unlock = () => {
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      audio.current ??= new Ctor();
      void audio.current.resume().catch(() => undefined);
    } catch {}
  };

  const beep = useCallback((freq: number, ms: number) => {
    if (!soundRef.current) return;
    try {
      const ctx = audio.current;
      if (!ctx || ctx.state !== "running") return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + ms / 1000 + 0.02);
    } catch {}
  }, []);

  const vibrate = (pattern: number | number[]) => {
    try {
      navigator.vibrate?.(pattern);
    } catch {}
  };

  const elapsedOf = (a: Active, t: number) => (a.banked + (a.running ? t - a.startedAt : 0)) / 1000;

  const start = (id: string, plan: TimerPlan, done?: () => void) => {
    unlock();
    const t = Date.now();
    onDone.current = done ?? null;
    last.current = { index: 0, sec: Math.ceil(plan.phases[0]?.seconds ?? 0) };
    if (plan.phases[0]?.kind === "lead") beep(880, 120);
    setNow(t);
    setActive({ id, plan, startedAt: t, banked: 0, running: true });
  };

  const pause = () =>
    setActive((a) => {
      if (!a || !a.running) return a;
      const t = Date.now();
      return { ...a, banked: a.banked + (t - a.startedAt), running: false };
    });

  const resume = () => {
    unlock();
    const t = Date.now();
    setNow(t);
    setActive((a) => (a && !a.running ? { ...a, startedAt: t, running: true } : a));
  };

  const restart = () => {
    unlock();
    const t = Date.now();
    last.current = null;
    setNow(t);
    setActive((a) => (a ? { ...a, startedAt: t, banked: 0, running: true } : a));
  };

  const stop = () => {
    onDone.current = null;
    setActive(null);
  };

  /** Salta il resto (il recupero): come se fosse finito, senza bip. */
  const skip = () => {
    const cb = onDone.current;
    onDone.current = null;
    last.current = null;
    setActive(null);
    cb?.();
  };

  const adjust = (delta: number) => {
    const t = Date.now();
    setActive((a) => (a ? { ...a, plan: adjustPlan(a.plan, elapsedOf(a, t), delta) } : a));
  };

  const toggleSound = () => {
    unlock();
    const next = !soundRef.current;
    soundRef.current = next;
    setSound(next);
    try {
      localStorage.setItem(SOUND_KEY, next ? "on" : "off");
    } catch {}
  };

  // il controllo dei bip e della fine gira qui senza ridisegnare niente: l'orologio
  // che si vede ticchetta solo dentro la barra (TimerBar), così il logbook con
  // tutte le sue caselle non si ridisegna 5 volte al secondo mentre scrivi
  useEffect(() => {
    if (!active?.running) return;
    const id = setInterval(() => {
      const t = Date.now();
      const st = timerAt(active.plan, elapsedOf(active, t));
      if (st.done) {
        beep(1320, 600);
        vibrate([300, 120, 300, 120, 300]);
        const cb = onDone.current;
        onDone.current = null;
        last.current = null;
        setActive(null);
        cb?.();
        return;
      }
      const sec = Math.ceil(st.remaining);
      const prev = last.current;
      if (prev && prev.index !== st.index) {
        // fase nuova: via!
        beep(1320, 450);
        vibrate(st.phase.kind === "rest" ? [150, 80, 150] : 400);
      } else if (prev && prev.sec !== sec && sec >= 1 && sec <= 3 && (st.phase.kind === "lead" || st.phase.seconds >= 6)) {
        beep(880, 120);
      }
      last.current = { index: st.index, sec };
    }, 200);
    return () => clearInterval(id);
  }, [active, beep]);

  const stateAt = useCallback((t: number): TimerState | null => (active ? timerAt(active.plan, elapsedOf(active, Math.max(t, active.running ? active.startedAt : t))) : null), [active]);
  return { active, now, stateAt, sound, start, pause, resume, restart, stop, skip, adjust, toggleSound };
}

export type WorkoutTimer = ReturnType<typeof useWorkoutTimer>;

const btn = "flex h-10 w-10 shrink-0 items-center justify-center rounded-full";

export function TimerBar({ timer }: { timer: WorkoutTimer }) {
  const { active } = timer;
  const [now, setNow] = useState(timer.now);
  const running = Boolean(active?.running);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [running]);
  const state = timer.stateAt(Math.max(now, timer.now));
  if (!active || !state) return null;
  const kind = state.phase.kind;
  const tone = kind === "work" ? "bg-accent text-white" : kind === "rest" ? "bg-accent-soft text-ink ring-1 ring-accent/40" : "bg-ink-soft text-white";
  const soft = kind === "rest" ? "bg-ink/10" : "bg-white/20";
  // una sola fase di lavoro (recupero, AMRAP, serie a tempo): basta il titolo; altrimenti il giro
  const single = active.plan.phases.filter((p) => p.kind !== "lead").length === 1;
  // il "via tra" in mezzo (cambia lato) dice cosa fare, quello iniziale cosa parte
  const label = kind === "lead" ? (state.index > 0 ? `${state.phase.label} · ${active.plan.title}` : `Si parte · ${active.plan.title}`) : single ? active.plan.title : state.phase.label;
  return (
    // key: a ogni cambio di fase la barra "lampeggia" (su iPhone il web non può vibrare)
    <div key={state.index} className={cx("timer-flash flex flex-col gap-1.5 rounded-[22px] px-4 py-2.5 shadow-lg", tone)} role="timer" aria-live="off" aria-label={`Timer: ${label}`}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] leading-snug font-semibold break-words">{active.running ? label : `In pausa · ${label}`}</div>
          <div className={cx("text-[26px] leading-none font-bold tabular", !active.running && "opacity-60")} data-testid="timer-clock">{kind === "lead" ? Math.ceil(state.remaining) : fmtClock(state.remaining)}</div>
        </div>
        {active.plan.adjustable ? (
          // recupero: "+30 s" se serve più fiato, "Salta" (in fondo) se sei già pronto
          <button type="button" aria-label="30 secondi in più" onClick={() => timer.adjust(30)} className={cx("h-10 shrink-0 rounded-full px-3 text-sm font-bold", soft)}>+30 s</button>
        ) : (
          <button type="button" aria-label="Ricomincia da capo" onClick={timer.restart} className={cx(btn, soft)}><IconRestart size={18} /></button>
        )}
        {active.running ? (
          <button type="button" aria-label="Metti in pausa" onClick={timer.pause} className={cx(btn, soft)}><IconPause size={18} /></button>
        ) : (
          <button type="button" aria-label="Riprendi" onClick={timer.resume} className={cx(btn, "bg-ink text-card")}><IconPlay size={18} /></button>
        )}
        <button type="button" aria-label={timer.sound ? "Togli il suono" : "Metti il suono"} onClick={timer.toggleSound} className={cx(btn, soft)}>{timer.sound ? <IconSound size={18} /> : <IconSoundOff size={18} />}</button>
        {active.plan.adjustable ? (
          <button type="button" onClick={timer.skip} className="h-10 shrink-0 rounded-full bg-ink px-3.5 text-sm font-bold text-card">Salta</button>
        ) : (
          <button type="button" aria-label="Ferma il timer" onClick={timer.stop} className={cx(btn, soft)}><IconX size={18} /></button>
        )}
      </div>
      <div className={cx("h-1.5 rounded-full", kind === "rest" ? "bg-ink/15" : "bg-white/30")}>
        <div className={cx("h-1.5 rounded-full", kind === "rest" ? "bg-accent" : "bg-white")} style={{ width: `${Math.max(0, Math.min(100, (1 - state.progress) * 100))}%` }} />
      </div>
    </div>
  );
}
