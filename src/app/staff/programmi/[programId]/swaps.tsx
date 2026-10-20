"use client";

/**
 * "Sostituisci per alcune settimane" (infortunio, attrezzo che manca): in
 * quelle settimane il cliente fa un altro esercizio, poi torna questo con la
 * sua progressione. Le prescrizioni di quelle settimane si scrivono nella
 * griglia come sempre; qui si sceglie solo chi sostituisce e per quanto.
 */
import { useState } from "react";
import { cx } from "@/components/ui";
import { IconSparkle, IconX } from "@/components/icons";
import { weeksLabel, type ItemSwap, type ProgramItem } from "@/lib/program/types";
import { placeSwap } from "@/lib/program/retouch";

type Props = {
  item: ProgramItem;
  weeks: number;
  /** settimane fatte: non si sostituiscono */
  done: number;
  /** id dell'eserciziario dal nome (null se non c'è) */
  resolveId: (name: string) => string | null;
  onChange: (swaps: ItemSwap[] | undefined, what: string) => void;
  /** "Chiedi all'AI": apre il ritocco su questo esercizio con il motivo già scelto */
  onAskAi?: () => void;
};

export function SwapTools({ item, weeks, done, resolveId, onChange, onAskAi }: Props) {
  const [open, setOpen] = useState<null | { index: number | null }>(null);
  const swaps = item.swaps ?? [];
  const first = Math.min(weeks, done + 1);
  const canAdd = done < weeks && item.name.trim();
  return (
    <div className="flex w-full flex-col gap-1.5" data-swap-tools>
      {swaps.length ? (
        <ul className="flex flex-col gap-1">
          {swaps.map((s, i) => (
            <li key={`${s.from}-${s.to}-${s.name}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-accent-soft/60 px-2.5 py-1.5 text-[13px]" data-swap>
              <span className="min-w-0 flex-1 break-words">
                <span className="font-semibold">{weeksLabel(s.from, s.to)}:</span> {s.name}
                {s.reason ? <span className="text-ink-soft"> · {s.reason}</span> : null}
              </span>
              {s.to > done ? (
                <span className="flex items-center gap-1">
                  <button type="button" className="min-h-8 px-1.5 font-semibold underline" onClick={() => setOpen({ index: i })}>Modifica</button>
                  <button
                    type="button"
                    aria-label={`Togli la sostituzione ${s.name}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-card"
                    onClick={() => {
                      // le settimane già fatte con il sostituto restano nello storico
                      const kept = s.from <= done ? [...swaps.slice(0, i), { ...s, to: done }, ...swaps.slice(i + 1)] : swaps.filter((_, j) => j !== i);
                      onChange(kept.length ? kept : undefined, `Tolta la sostituzione con ${s.name}`);
                    }}
                  >
                    <IconX size={14} />
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <SwapForm
          item={item}
          weeks={weeks}
          first={first}
          initial={open.index !== null ? swaps[open.index] : null}
          resolveId={resolveId}
          onCancel={() => setOpen(null)}
          onAskAi={onAskAi ? () => { setOpen(null); onAskAi(); } : undefined}
          onSave={(s) => {
            const others = open.index !== null ? swaps.filter((_, j) => j !== open.index) : swaps;
            onChange(placeSwap(others, s), `${s.name} al posto di ${item.name} nelle ${weeksLabel(s.from, s.to)}`);
            setOpen(null);
          }}
        />
      ) : canAdd ? (
        <button type="button" onClick={() => setOpen({ index: null })} className="flex min-h-8 items-center self-start rounded-full px-2 text-xs font-semibold whitespace-nowrap text-muted hover:bg-sand hover:text-ink" data-swap-add>
          Sostituisci per alcune settimane
        </button>
      ) : null}
    </div>
  );
}

function SwapForm({
  item,
  weeks,
  first,
  initial,
  resolveId,
  onCancel,
  onSave,
  onAskAi,
}: {
  item: ProgramItem;
  weeks: number;
  first: number;
  initial: ItemSwap | null;
  resolveId: (name: string) => string | null;
  onCancel: () => void;
  onSave: (s: { from: number; to: number; name: string; exerciseId: string | null; notes: string; reason: string }) => void;
  onAskAi?: () => void;
}) {
  const [from, setFrom] = useState(Math.max(first, initial?.from ?? first));
  const [to, setTo] = useState(Math.max(initial?.to ?? Math.min(weeks, first + 1), Math.max(first, initial?.from ?? first)));
  const [name, setName] = useState(initial?.name ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [error, setError] = useState<string | null>(null);
  const options = Array.from({ length: weeks }, (_, i) => i + 1).filter((w) => w >= first);
  const field = "w-full rounded-xl border border-sand-deep bg-card px-3 py-2 text-[15px]";
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-sand p-3 ring-1 ring-sand-deep" role="group" aria-label={`Sostituisci ${item.name}`} data-swap-form>
      <div className="text-sm font-semibold break-words">Al posto di {item.name}</div>
      <input list="exercise-library" aria-label="Esercizio sostitutivo" value={name} onChange={(e) => setName(e.target.value)} placeholder="Scegli o scrivi l'esercizio" className={field} />
      <div className="flex flex-wrap items-center gap-2 text-[15px]">
        <span>dalla settimana</span>
        <select aria-label="Sostituisci dalla settimana" value={from} onChange={(e) => { const v = Number(e.target.value); setFrom(v); if (to < v) setTo(v); }} className="rounded-xl border border-sand-deep bg-card px-3 py-2">
          {options.map((w) => <option key={w} value={w}>{w}</option>)}
        </select>
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          alla
          <select aria-label="Sostituisci fino alla settimana" value={Math.max(to, from)} onChange={(e) => setTo(Number(e.target.value))} className="rounded-xl border border-sand-deep bg-card px-3 py-2">
            {options.filter((w) => w >= from).map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </span>
      </div>
      <textarea aria-label="Perché (facoltativo)" value={reason} onChange={(e) => setReason(e.target.value)} rows={1} maxLength={200} placeholder="Perché, facoltativo (es. polso sinistro)" className={field} />
      <textarea aria-label="Indicazioni per il sostituto" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Indicazioni per il sostituto (se vuote valgono quelle di prima)" className={field} />
      <p className="text-xs text-muted">Le prescrizioni di quelle settimane le scrivi nella griglia come sempre (il sostituto può avere carichi diversi).</p>
      {error ? <p className="text-sm font-semibold text-accent-deep" role="alert">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="min-h-11 rounded-full bg-ink px-4 text-sm font-semibold text-card"
          onClick={() => {
            const n = name.trim();
            if (!n) return setError("Scrivi o scegli l'esercizio che lo sostituisce.");
            if (n.toLowerCase() === item.name.trim().toLowerCase()) return setError("È lo stesso esercizio: scegline un altro.");
            onSave({ from, to: Math.max(to, from), name: n, exerciseId: resolveId(n), notes: notes.trim(), reason: reason.trim() });
          }}
          data-swap-save
        >
          Salva la sostituzione
        </button>
        <button type="button" className="min-h-11 rounded-full px-3 text-sm font-semibold ring-1 ring-sand-deep" onClick={onCancel}>Annulla</button>
        {onAskAi ? (
          <button type="button" className={cx("inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink-soft underline")} onClick={onAskAi}>
            <IconSparkle size={14} /> Chiedi all&apos;AI cosa mettere
          </button>
        ) : null}
      </div>
    </div>
  );
}
