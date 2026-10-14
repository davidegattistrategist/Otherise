"use client";

/**
 * Modalità check: in alto il cliente e i pulsanti "Chiudi per ora" e
 * "Check finito"; sotto le schede Misure, Confronti, Appunti, Programma e
 * Pagamenti. Il modulo del check resta sempre lo stesso (solo nascosto nelle
 * altre schede), si salva da solo a ogni lettera e passa da un dispositivo
 * all'altro.
 */
import { useState, type ReactNode } from "react";
import { CheckForm, type CheckState, type CheckValues, type PreviousCheck } from "@/app/staff/clienti/[id]/check/check-form";
import { BodyCharts, CheckCompare } from "@/components/body-progress";
import type { BodyPoint, FormulaSeries } from "@/lib/body/progress";
import type { CheckPhoto } from "@/lib/check-photos-shared";
import type { FormulaId, Sex, SkinfoldSite } from "@/lib/body/skinfolds";
import { buttonClass, cx } from "@/components/ui";
import { cancelCheckMode, endCheckMode, pauseCheckMode } from "../actions";

type Tab = "misure" | "confronti" | "appunti" | "programma" | "pagamenti";

const FORM_ID = "check-form";

export function CheckModeView(props: {
  clientId: string;
  clientName: string;
  checkId: string | null;
  photoFolder: string | null;
  savedPhotos: CheckPhoto[];
  sex: Sex | null;
  birthDate: string | null;
  formula: FormulaId | null;
  manual: boolean;
  lastMissing: SkinfoldSite[];
  previous: PreviousCheck | null;
  values: CheckValues;
  action: (s: CheckState, fd: FormData) => Promise<CheckState>;
  points: BodyPoint[];
  formulas: FormulaSeries[];
  sumSites: SkinfoldSite[];
  testsPanel: ReactNode;
  programPanel: ReactNode;
  paymentsPanel: ReactNode;
  sexMissing: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("misure");
  const [ending, setEnding] = useState(false);
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "misure", label: "Misure" },
    { key: "confronti", label: "Confronti" },
    { key: "appunti", label: "Appunti" },
    { key: "programma", label: "Programma" },
    ...(props.paymentsPanel ? [{ key: "pagamenti" as Tab, label: "Pagamenti" }] : []),
  ];
  const formView = tab === "appunti" ? "appunti" : "misure";

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[13px] font-semibold tracking-wider text-accent-deep uppercase">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden="true" /> Modalità check
          </div>
          <h1 className="mt-1 text-[30px] leading-tight font-normal tracking-tight sm:text-[38px]">{props.clientName}</h1>
          <p className="text-sm text-muted">{props.checkId ? "Stai correggendo un check salvato." : "Check nuovo."} Si salva tutto da solo, anche sull&apos;altro dispositivo.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action={pauseCheckMode.bind(null, undefined)}>
            <button type="submit" className={buttonClass("secondary", "sm")}>Chiudi per ora</button>
          </form>
          {props.sex ? (
            <button type="submit" form={FORM_ID} className={buttonClass("primary", "sm")} disabled={ending}>
              {ending ? "Salvo…" : "Check finito"}
            </button>
          ) : null}
        </div>
      </header>

      <nav aria-label="Modalità check" className="sticky top-0 z-20 -mx-[var(--edge-left)] bg-sand/95 px-[var(--edge-left)] py-2 backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
        <div className="scroll-x flex gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={tab === t.key}
              onClick={() => {
                setTab(t.key);
                window.scrollTo({ top: 0 });
              }}
              className={cx("min-h-10 shrink-0 rounded-full px-4 text-[15px] font-semibold", tab === t.key ? "bg-ink text-card" : "bg-card hover:bg-white")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {props.sexMissing}

      {props.sex ? (
        <div className={cx((tab === "misure" || tab === "appunti") ? "" : "hidden")}>
          {tab === "appunti" ? (
            <p className="mb-3 px-1 text-sm text-muted">Gli appunti finiscono nelle note per la prossima fase del check: solo tu (e chi segue il cliente) le vedete, e riappaiono quando prepari il programma.</p>
          ) : null}
          <CheckForm
            clientId={props.clientId}
            checkId={props.checkId}
            newCheck={!props.checkId}
            action={props.action}
            sex={props.sex}
            birthDate={props.birthDate}
            values={props.values}
            formula={props.formula}
            manual={props.manual}
            lastMissing={props.lastMissing}
            previous={props.previous}
            live
            photoFolder={props.photoFolder}
            savedPhotos={props.savedPhotos}
            formId={FORM_ID}
            view={formView}
            submitLabel="Check finito"
            onSaved={(id) => {
              setEnding(true);
              void endCheckMode(props.clientId, id);
            }}
          />
        </div>
      ) : null}

      {tab === "confronti" ? (
        <div className="flex flex-col gap-4">
          {props.points.length ? (
            <>
              <CheckCompare points={props.points} sumSites={props.sumSites} title="Confronta i check precedenti" />
              <BodyCharts points={props.points} sumSites={props.sumSites} formulas={props.formulas} />
            </>
          ) : (
            <p className="px-1 text-[15px] text-muted">È il primo check: i confronti compaiono dal prossimo.</p>
          )}
          {props.testsPanel}
        </div>
      ) : null}
      {tab === "programma" ? props.programPanel : null}
      {tab === "pagamenti" ? props.paymentsPanel : null}

      <div className="mt-6 border-t border-sand-deep pt-4">
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Annullare il check? Quello che hai scritto in questo check si cancella.")) void cancelCheckMode(props.clientId);
          }}
          className="text-sm font-semibold text-accent-deep underline"
        >
          Annulla il check
        </button>
      </div>
    </div>
  );
}
