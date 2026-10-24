"use client";

/**
 * Logbook registrato dal trainer: in fondo "Sessione PT con te" (con "si
 * scala" e le note della lezione). Chiudendo l'allenamento si salvano insieme
 * l'allenamento e la sessione PT: un passo solo.
 */
import { useEffect, useState } from "react";
import { Logbook, type LogbookProps } from "./logbook";
import { DictateButton } from "@/components/dictate-button";
import { NoteArea } from "@/components/note-area";
import { savePtFromWorkout } from "@/app/staff/clienti/[id]/sessioni/actions";
import { loadDraft, useDraft } from "@/components/use-draft";

export function StaffLogbook({
  clientId,
  pt,
  ...props
}: LogbookProps & {
  clientId: string;
  pt: { checked: boolean; notes: string; counts: boolean; showCounts: boolean };
}) {
  const [isPt, setIsPt] = useState(pt.checked);
  const [counts, setCounts] = useState(pt.counts);
  const [notes, setNotes] = useState(pt.notes);
  const source = `${props.programId}:${props.week}:${props.day.id}`;
  // le note della lezione si tengono in bozza mentre scrivi (prima restavano solo in memoria:
  // un'app ricaricata a metà lezione le perdeva); sparisce quando la sessione è salvata
  const draftKey = `pt-note:${source}`;
  const draft = useDraft(draftKey, { notes, isPt, counts }, { isEmpty: (v) => !v.notes.trim() && v.isPt === pt.checked && v.counts === pt.counts });
  const { adopt, clear } = draft;
  useEffect(() => {
    let alive = true;
    void loadDraft<{ notes: string; isPt: boolean; counts: boolean }>(draftKey).then((d) => {
      if (!alive || !d?.data) return;
      adopt(d.data, d.at);
      // un testo nella bozza vale più di quello caricato (è più recente); vuoto non cancella niente
      if (d.data.notes.trim()) setNotes(d.data.notes);
      setIsPt(d.data.isPt);
      setCounts(d.data.counts);
    });
    return () => {
      alive = false;
    };
  }, [draftKey, adopt]);

  const beforeFinish = async ({ performedOn }: { performedOn: string }) => {
    // la sessione PT ha la data dell'allenamento (registrato oggi per un altro giorno: quella)
    const r = await savePtFromWorkout(clientId, { source, date: performedOn || props.today, notes, countsTowardPackage: counts, isPt });
    if (r.ok) clear();
    return r.ok ? null : r.error;
  };

  return (
    <Logbook
      {...props}
      beforeFinish={beforeFinish}
      leaveOpen={{ label: "Le finisce in autonomia: lascia aperto", note: "Sul suo telefono lo trova come “Riprendi l'allenamento”" }}
      footer={
        <section className="flex flex-col gap-3 rounded-[24px] bg-card p-5" aria-label="Sessione PT">
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={isPt} onChange={(e) => setIsPt(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#1b1a17]" />
            <span>
              <span className="block font-semibold">Sessione PT con te</span>
              <span className="block text-sm text-muted">Chiudendo l&apos;allenamento si registra anche la sessione PT, con le note qui sotto.</span>
            </span>
          </label>
          {isPt ? (
            <>
              {pt.showCounts ? (
                <label className="flex items-center gap-3 text-[15px]">
                  <input type="checkbox" checked={counts} onChange={(e) => setCounts(e.target.checked)} className="h-5 w-5 shrink-0 accent-[#1b1a17]" />
                  Si scala dalle sessioni PT pagate
                </label>
              ) : null}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-end justify-between gap-2">
                  <label htmlFor="pt-notes" className="text-[15px] font-semibold">Note della lezione <span className="font-normal text-muted">(le vedi solo tu)</span></label>
                  <DictateButton onText={(t) => setNotes((v) => (v ? `${v.trimEnd()} ${t}` : t))} />
                </div>
                <NoteArea
                  title="Note della lezione"
                  id="pt-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Com'è andata, cosa hai cambiato rispetto al programma, cosa ricordare la prossima volta"
                />
              </div>
            </>
          ) : null}
        </section>
      }
    />
  );
}
