"use client";

/**
 * Allenamento libero in pochi tocchi: cosa, quanto, com'era, quando. Parte già
 * con le scelte dell'ultima volta (chi fa spinning ogni martedì tocca solo
 * "Segna"). La nota è facoltativa e si può dettare.
 */
import { useActionState, useRef, useState } from "react";
import { addDays } from "@/lib/dates";
import { EFFORTS, FREE_KINDS, FREE_MINUTES, type FreeKind } from "@/lib/free-workout";
import { DictateButton } from "@/components/dictate-button";
import { ActionMessage, SubmitButton } from "@/components/form-bits";
import { Textarea, cx } from "@/components/ui";
import { saveFreeWorkout } from "./actions";

const chip = "flex min-h-12 cursor-pointer items-center justify-center rounded-2xl bg-sand px-3 text-center text-[15px] font-semibold select-none has-[:checked]:bg-ink has-[:checked]:text-card has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent";

function Group({ legend, children, className }: { legend: string; children: React.ReactNode; className?: string }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-[15px] font-semibold">{legend}</legend>
      <div className={className}>{children}</div>
    </fieldset>
  );
}

export function FreeWorkoutForm({ today, last }: { today: string; last: { kind: FreeKind; minutes: number | null; effort: number | null } | null }) {
  const [state, action] = useActionState(saveFreeWorkout, null);
  const [kind, setKind] = useState<FreeKind | "">(last?.kind ?? "");
  const [minutes, setMinutes] = useState(last?.minutes ? String(last.minutes) : "");
  const [effort, setEffort] = useState(last?.effort ? String(last.effort) : "2");
  const yesterday = addDays(today, -1);
  const [when, setWhen] = useState<"today" | "yesterday" | "other">("today");
  const [otherDay, setOtherDay] = useState(addDays(today, -2));
  const notes = useRef<HTMLTextAreaElement>(null);
  const preset = FREE_MINUTES.some((m) => String(m) === minutes);
  const day = when === "today" ? today : when === "yesterday" ? yesterday : otherDay;

  return (
    <form action={action} className="flex flex-col gap-6">
      <Group legend="Cosa hai fatto?" className="grid grid-cols-3 gap-2">
        {FREE_KINDS.map((k) => (
          <label key={k.key} className={cx(chip, k.key === "altro" && "col-span-3")}>
            <input type="radio" name="kind" value={k.key} checked={kind === k.key} onChange={() => setKind(k.key)} className="sr-only" />
            {k.label}
          </label>
        ))}
      </Group>

      <Group legend="Per quanto?" className="grid grid-cols-3 gap-2">
        {FREE_MINUTES.map((m) => (
          <label key={m} className={chip}>
            <input type="radio" name="minutes_preset" checked={minutes === String(m)} onChange={() => setMinutes(String(m))} className="sr-only" />
            {m} min
          </label>
        ))}
        <label className={cx("flex min-h-12 items-center gap-1 rounded-2xl px-3 text-[15px] font-semibold", !preset && minutes ? "bg-ink text-card" : "bg-sand")}>
          <input
            aria-label="Minuti, se non sono tra questi"
            inputMode="numeric"
            placeholder="Altro"
            value={preset ? "" : minutes}
            onChange={(e) => setMinutes(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
            className="w-full min-w-0 bg-transparent text-center outline-none placeholder:text-muted"
          />
          {!preset && minutes ? <span>min</span> : null}
        </label>
        <input type="hidden" name="minutes" value={minutes} />
      </Group>

      <Group legend="Com'era?" className="grid grid-cols-3 gap-2">
        {EFFORTS.map((e) => (
          <label key={e.value} className={chip}>
            <input type="radio" name="effort" value={e.value} checked={effort === String(e.value)} onChange={() => setEffort(String(e.value))} className="sr-only" />
            {e.label}
          </label>
        ))}
      </Group>

      <Group legend="Quando?" className="grid grid-cols-3 gap-2">
        {(
          [
            ["today", "Oggi"],
            ["yesterday", "Ieri"],
            ["other", "Altro giorno"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className={chip}>
            <input type="radio" name="when" checked={when === k} onChange={() => setWhen(k)} className="sr-only" />
            {label}
          </label>
        ))}
        {when === "other" ? (
          <input
            type="date"
            aria-label="Giorno"
            value={otherDay}
            max={today}
            min={addDays(today, -60)}
            onChange={(e) => setOtherDay(e.target.value)}
            className="col-span-3 min-h-12 rounded-2xl border border-sand-deep bg-card px-3 text-base"
          />
        ) : null}
        <input type="hidden" name="performed_on" value={day} />
      </Group>

      <div className="flex flex-col gap-2">
        <div className="flex items-end justify-between gap-2">
          <label htmlFor="free-notes" className="text-[15px] font-semibold">Vuoi aggiungere qualcosa? <span className="font-normal text-muted">(facoltativo)</span></label>
          <DictateButton target={notes} />
        </div>
        <Textarea ref={notes} id="free-notes" name="notes" rows={2} placeholder="Es. 10 km a ritmo tranquillo, gambe un po' pesanti" />
      </div>

      <ActionMessage state={state} />
      <SubmitButton pendingText="Segno…" className="w-full justify-center sm:w-auto">Segna l&apos;allenamento</SubmitButton>
    </form>
  );
}
