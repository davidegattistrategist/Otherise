"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cx } from "@/components/ui";
import { IconPlay } from "@/components/icons";
import { startProgramEarly } from "./actions";

/**
 * "Inizia oggi la nuova fase": per chi è pronto prima (la domenica la fase del
 * lunedì). Due tocchi: la data di inizio della fase diventa oggi.
 */
export function EarlyStart({
  programId,
  title,
  startsLabel,
  dark,
  staff,
  hasLeftovers,
}: {
  programId: string;
  title: string;
  /** "lunedì 20 ottobre" */
  startsLabel: string;
  dark?: boolean;
  /** Testi per lo staff (sessione PT) invece che per il cliente */
  staff?: boolean;
  /** Restano allenamenti della fase in corso da fare */
  hasLeftovers?: boolean;
}) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const go = () =>
    start(async () => {
      setError(null);
      const res = await startProgramEarly(programId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAsk(false);
      router.refresh();
    });

  const muted = dark ? "text-muted-dark" : "text-muted";
  return (
    <div className={cx("flex flex-col gap-2.5", dark && "border-t border-line-dark pt-4")} data-early-start={programId}>
      <p className={cx("text-[15px] leading-snug", dark ? "text-card" : "text-ink")}>
        <span className="font-semibold">{staff ? "La nuova fase" : "La tua nuova fase"} «{title}» parte {startsLabel}.</span>{" "}
        <span className={muted}>{staff ? "Se oggi fate già quella, iniziatela adesso." : "Se sei pronto, puoi iniziarla già oggi."}</span>
      </p>
      {ask ? (
        <div className={cx("flex flex-col gap-2 rounded-2xl p-3", dark ? "bg-white/10" : "bg-sand")}>
          <p className="text-[15px] leading-snug">
            La nuova fase parte da oggi e {staff ? "il prossimo allenamento è" : "il prossimo allenamento sarà"} il suo primo.
            {hasLeftovers ? " Gli allenamenti che restano di questa fase non li vedrai più come prossimi." : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={go} className={cx("min-h-11 rounded-full px-5 text-[15px] font-semibold disabled:opacity-60", dark ? "bg-card text-ink" : "bg-ink text-card")}>
              {pending ? "Un attimo…" : staff ? "Sì, iniziamo oggi" : "Sì, inizio oggi"}
            </button>
            <button type="button" disabled={pending} onClick={() => setAsk(false)} className={cx("min-h-11 rounded-full px-4 text-[15px] font-semibold underline", muted)}>
              No, aspetto
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAsk(true)}
          className={cx("inline-flex min-h-12 items-center justify-center gap-2 self-stretch rounded-full px-5 text-[15px] font-semibold sm:self-start", dark ? "text-card ring-1 ring-line-dark" : "bg-card ring-1 ring-sand-deep")}
        >
          <IconPlay size={16} /> Inizia oggi la nuova fase
        </button>
      )}
      {error ? <p className={cx("text-sm font-semibold", dark ? "text-accent" : "text-accent-deep")} role="alert">{error}</p> : null}
    </div>
  );
}
