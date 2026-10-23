"use client";

/**
 * Modulo del check: pliche (3 rilevazioni per sito, media automatica),
 * circonferenze, test di forza con massimale stimato, test liberi e note.
 * - Accanto a ogni misura c'è quella del check precedente e la differenza.
 * - Ci si sposta tra le misure con Invio/frecce (computer) o con la barra ‹ ›
 *   sopra la tastiera (telefono).
 * - Tutto si salva da solo mentre scrivi (bozza): se esci o salta la rete
 *   non perdi niente; in modalità check la bozza passa anche all'altro
 *   dispositivo.
 * I risultati si aggiornano mentre scrivi; il server li ricalcola al salvataggio.
 */
import { DictateButton } from "@/components/dictate-button";
import { useActionState, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PendingPhotos, PhotoGrid, onlyImages, uploadCheckPhotos } from "@/components/check-photos";
import type { CheckPhoto, PendingPhoto } from "@/lib/check-photos-shared";
import { useKeepAwake } from "@/components/use-keep-awake";
import { useDraft, loadDraft } from "@/components/use-draft";
import { DraftNote } from "@/components/draft-note";
import { FieldNav } from "@/components/field-nav";
import { IconDown, IconPhoto, IconX } from "@/components/icons";
import { CIRCUMFERENCES, SKINFOLD_SITES, averagesOf, computeBodyComposition, formulaById, protocolSites, siteAverage, siteLabel, sumOf, type FormulaId, type Sex, type SkinfoldAverages, type SkinfoldSite } from "@/lib/body/skinfolds";
import { estimateOneRepMax, RPE_VALUES } from "@/lib/strength/e1rm";
import { ageAt, type KnownAge } from "@/lib/body/age";
import { Card, Eyebrow, Input, Label, cx, fmtNum } from "@/components/ui";
import { NoteArea } from "@/components/note-area";
import { ActionMessage, SubmitButton, type ActionState } from "@/components/form-bits";

export type CheckValues = {
  check_date: string;
  weight_kg: number | null;
  skinfolds: Partial<Record<SkinfoldSite, Array<number | null>>>;
  circumferences: Record<string, number>;
  strength_tests: Array<{ exercise: string; load: number | null; reps: number | null; rpe: number | null }>;
  tests_text: string;
  notes_next_phase: string;
  visible_to_client: boolean;
};

/** Il check prima di questo, per avere le misure accanto. */
export type PreviousCheck = {
  label: string;
  weight: number | null;
  folds: SkinfoldAverages;
  circ: Record<string, number>;
  fatPct: number | null;
  fatKg: number | null;
  leanKg: number | null;
};

/** Esito del salvataggio: id del check (per le foto) e dove andare dopo. */
export type CheckState = (NonNullable<ActionState> & { checkId?: string; redirectTo?: string }) | null;

/** Tutto il modulo come si salva nella bozza. */
export type CheckFormData = {
  check_date: string;
  weight: string;
  sf: Record<string, string[]>;
  circ: Record<string, string>;
  tests: Array<{ exercise: string; load: string; reps: string; rpe: string }>;
  tests_text: string;
  notes_next_phase: string;
  visible: boolean;
  /** modalità check: foto già caricate, da registrare con "Check finito" (per percorso, così due dispositivi non si pestano) */
  photos?: Record<string, PendingPhoto & { at: number }>;
};

const toNum = (s: string) => {
  const n = Number(s.replace(",", "."));
  return s.trim() && Number.isFinite(n) ? n : null;
};
// al massimo 2 decimali: niente "27,400000000000002" dai conti con la virgola
const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(Math.round(n * 100) / 100).replace(".", ","));

/** Righe dei test di forza al massimo (le legge anche il salvataggio). */
const MAX_TESTS = 10;

export function initialCheckData(values: CheckValues): CheckFormData {
  const sf: Record<string, string[]> = {};
  for (const s of SKINFOLD_SITES) sf[s.key] = [0, 1, 2].map((i) => str(values.skinfolds[s.key]?.[i]));
  const circ: Record<string, string> = {};
  for (const c of CIRCUMFERENCES) circ[c.key] = str(values.circumferences[c.key]);
  const tests = values.strength_tests.map((x) => ({ exercise: x.exercise, load: x.load?.toString() ?? "", reps: x.reps?.toString() ?? "", rpe: x.rpe?.toString() ?? "" }));
  // le righe dei test: quelle già scritte più una vuota ("Altro test" ne aggiunge)
  tests.push({ exercise: "", load: "", reps: "", rpe: "" });
  return { check_date: values.check_date, weight: str(values.weight_kg), sf, circ, tests, tests_text: values.tests_text, notes_next_phase: values.notes_next_phase, visible: values.visible_to_client };
}

/** Chiave della bozza: un check nuovo per cliente, oppure quel check. */
export const checkDraftKey = (clientId: string, checkId: string | null | undefined) => `check:${clientId}:${checkId ?? "nuovo"}`;

const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "±");

/** "prima 12,3 · −0,8" sotto una misura. */
function Before({ prev, now, digits = 1, unit = "" }: { prev: number | null | undefined; now: number | null; digits?: number; unit?: string }) {
  if (prev === null || prev === undefined) return null;
  const d = now === null ? null : Math.round((now - prev) * 100) / 100;
  return (
    <span className="block text-xs font-normal text-muted tabular">
      prima {fmtNum(prev, digits)}{unit}
      {d !== null ? <span className={cx("ml-1 font-semibold", d === 0 ? "text-muted" : "text-ink-soft")}>{d === 0 ? "=" : `${sign(d)}${fmtNum(Math.abs(d), digits)}`}</span> : null}
    </span>
  );
}

export function CheckForm({
  clientId,
  checkId = null,
  newCheck = false,
  action,
  sex,
  birthDate,
  values,
  formula,
  manual,
  lastMissing,
  previous = null,
  live = false,
  onSaved,
  onBusy,
  onValues,
  knownAges = [],
  submitLabel,
  formId,
  view = "all",
  photoFolder = null,
  savedPhotos = [],
}: {
  clientId: string;
  /** check già salvato (modifica) */
  checkId?: string | null;
  /** check nuovo: si possono scegliere le foto prima di salvare */
  newCheck?: boolean;
  action: (s: CheckState, fd: FormData) => Promise<CheckState>;
  sex: Sex;
  birthDate: string | null;
  values: CheckValues;
  /** formula di riferimento del cliente (null = nessuna formula validata per il suo storico) */
  formula: FormulaId | null;
  /** true se la formula l'ha scelta il trainer (non automatica) */
  manual: boolean;
  /** pliche del protocollo non prese nell'ultimo check */
  lastMissing: SkinfoldSite[];
  /** il check precedente, per avere le misure accanto */
  previous?: PreviousCheck | null;
  /** modalità check: la bozza arriva anche dall'altro dispositivo */
  live?: boolean;
  /** modalità check: cosa fare dopo il salvataggio (al posto di andare alla pagina dei check) */
  onSaved?: (checkId: string) => void;
  /** il salvataggio è partito (true) o è tornato con un errore (false): per il pulsante "Check finito" fuori dal modulo */
  onBusy?: (busy: boolean) => void;
  /** modalità check: il modulo com'è adesso (anche con quello che arriva dall'altro dispositivo), per i confronti */
  onValues?: (data: CheckFormData) => void;
  /** età scritte nei check precedenti: se manca la data di nascita l'età si stima da qui */
  knownAges?: KnownAge[];
  submitLabel?: string;
  /** id del modulo (modalità check: "Check finito" in alto lo invia) */
  formId?: string;
  /** modalità check: quale parte mostrare (le altre restano nel modulo, nascoste) */
  view?: "all" | "misure" | "appunti";
  /** modalità check: id del check (o di quello nuovo, già deciso) in cui caricare subito le foto */
  photoFolder?: string | null;
  /** modalità check su un check salvato: le sue foto */
  savedPhotos?: CheckPhoto[];
}) {
  const hideMisure = view === "appunti";
  const hideAppunti = view === "misure";
  // senza rete (o se il server non risponde) un messaggio chiaro, non una pagina di errore:
  // quello che hai scritto resta nel modulo e nella bozza
  const safeAction = useCallback(
    async (prev: CheckState, fd: FormData): Promise<CheckState> => {
      try {
        return await action(prev, fd);
      } catch {
        return { error: "Non sono riuscito a salvare: controlla la connessione e tocca di nuovo. Quello che hai scritto resta qui." };
      }
    },
    [action],
  );
  const [state, formAction] = useActionState(safeAction, null);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const key = checkDraftKey(clientId, checkId);
  const start = useMemo(() => initialCheckData(values), [values]);
  const [f, setF] = useState<CheckFormData>(start);
  const [restored, setRestored] = useState<number | null>(null);
  const draft = useDraft(key, f, { live, onRemote: (d) => setF(d) });
  const { adopt, clear, syncNow } = draft;
  const onValuesRef = useRef(onValues);
  useEffect(() => {
    onValuesRef.current = onValues;
  });
  useEffect(() => {
    onValuesRef.current?.(f);
  }, [f]);

  // riprende quello che avevi scritto (anche sull'altro dispositivo). Solo
  // all'apertura: se la pagina si ridisegna (es. un pagamento registrato in
  // modalità check) il modulo resta com'è. In modalità check la bozza è il
  // check in corso, quindi niente avviso "Ho ripreso…".
  const startRef = useRef(start);
  useEffect(() => {
    let alive = true;
    void loadDraft<CheckFormData>(key).then((d) => {
      if (!alive || !d) return;
      if (JSON.stringify(d.data) === JSON.stringify(startRef.current)) {
        adopt(d.data, d.at);
        return;
      }
      adopt(d.data, d.at);
      setF(d.data);
      if (!live) setRestored(d.at);
    });
    return () => {
      alive = false;
    };
  }, [key, adopt, live]);

  // solo le foto di questo check (una bozza rimasta da un check annullato può averne di un'altra cartella)
  const pendingList = Object.values(f.photos ?? {}).filter((p) => photoFolder && p.path.startsWith(`${clientId}/${photoFolder}/`)).sort((a, b) => a.at - b.at);
  const set = <K extends keyof CheckFormData>(k: K, v: CheckFormData[K]) => setF((x) => ({ ...x, [k]: v }));

  // foto scelte prima di salvare (solo per un check nuovo): si caricano appena il check è salvato
  const [photos, setPhotos] = useState<File[]>([]);
  const previews = useMemo(() => photos.map((p) => URL.createObjectURL(p)), [photos]);
  const [upload, setUpload] = useState<{ done: number; total: number; progress: number } | null>(null);
  const [uploadError, setUploadError] = useState("");
  const photoInput = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  useKeepAwake(upload !== null);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  useEffect(() => {
    const savedId = state?.checkId;
    if (!state?.ok || !savedId || finished.current) return;
    finished.current = true;
    clear();
    const next = () => (onSaved ? onSaved(savedId) : router.push(state.redirectTo ?? `/staff/clienti/${clientId}/check`));
    if (!photos.length) {
      next();
      return;
    }
    void uploadCheckPhotos(clientId, savedId, photos, setUpload).then((r) => {
      setUpload(null);
      if (r.error) {
        setUploadError(`Check salvato, ma ${r.error.charAt(0).toLowerCase()}${r.error.slice(1)} Le foto le puoi aggiungere aprendo il check.`);
        setTimeout(() => (onSaved ? onSaved(savedId) : router.push(`/staff/clienti/${clientId}/check/${savedId}`)), 4000);
        return;
      }
      if (onSaved) onSaved(savedId);
      else router.push(`/staff/clienti/${clientId}/check?foto=${r.saved}`);
    });
  }, [state, clientId, photos, router, clear, onSaved]);

  // check già salvato, fuori dalla modalità check: si salva da solo mentre scrivi (niente "Salva")
  const autoSave = Boolean(checkId) && !live;
  const [liveStatus, setLiveStatus] = useState<{ kind: "idle" | "waiting" | "saving" | "saved" | "error"; at?: number; error?: string }>({ kind: "idle" });
  const lastSent = useRef(JSON.stringify(start));
  const autoRunning = useRef(false);
  const autoAgain = useRef(false);
  const actionRef = useRef(action);
  useEffect(() => {
    actionRef.current = action;
  });
  const valueOf = useRef(f);
  const autoRun = useCallback(async (el?: HTMLFormElement | null) => {
    if (autoRunning.current) {
      autoAgain.current = true;
      return;
    }
    autoRunning.current = true;
    try {
      do {
        autoAgain.current = false;
        const form = formRef.current ?? el;
        if (!form) return;
        const snap = JSON.stringify(valueOf.current);
        if (snap === lastSent.current) {
          setLiveStatus((s) => (s.kind === "waiting" || s.kind === "error" ? { kind: "saved", at: s.at } : s));
          continue;
        }
        setLiveStatus((s) => ({ kind: "saving", at: s.at }));
        const fd = new FormData(form);
        fd.set("__live", "1");
        let r: CheckState = null;
        try {
          r = await actionRef.current(null, fd);
        } catch {
          r = { error: "Non sono riuscito a salvare: controlla la connessione. Quello che hai scritto resta qui." };
        }
        if (r?.error) {
          setLiveStatus({ kind: "error", error: r.error });
          continue;
        }
        lastSent.current = snap;
        setLiveStatus({ kind: "saved", at: Date.now() });
        if (JSON.stringify(valueOf.current) === snap) clear();
      } while (autoAgain.current);
    } finally {
      autoRunning.current = false;
    }
  }, [clear]);
  useEffect(() => {
    valueOf.current = f;
    if (!autoSave || JSON.stringify(f) === lastSent.current) return;
    setLiveStatus((s) => (s.kind === "saving" ? s : { kind: "waiting", at: s.at }));
    const t = setTimeout(() => void autoRun(), 900);
    return () => clearTimeout(t);
  }, [f, autoSave, autoRun]);
  useEffect(() => {
    if (!autoSave) return;
    const el = formRef.current;
    const now = () => void autoRun(el);
    const onHidden = () => document.visibilityState === "hidden" && now();
    window.addEventListener("pagehide", now);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", now);
      document.removeEventListener("visibilitychange", onHidden);
      now();
    };
  }, [autoSave, autoRun]);

  // un salvataggio alla volta (due tocchi su "Check finito" mandavano due salvataggi:
  // il secondo dava errore anche se il check era salvato). In modalità check prima
  // si prende l'ultima versione scritta sull'altro dispositivo.
  const submitting = useRef(false);
  const synced = useRef(false);
  const onBusyRef = useRef(onBusy);
  useEffect(() => {
    onBusyRef.current = onBusy;
  });
  useEffect(() => {
    if (!state || state.ok) return;
    submitting.current = false;
    synced.current = false;
    onBusyRef.current?.(false);
  }, [state]);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (submitting.current) {
      e.preventDefault();
      return;
    }
    if (live && !synced.current) {
      e.preventDefault();
      submitting.current = true;
      onBusyRef.current?.(true);
      void syncNow().then(async () => {
        // il modulo si ridisegna con quello che è arrivato, poi parte
        await new Promise((r) => setTimeout(r, 80));
        synced.current = true;
        submitting.current = false;
        formRef.current?.requestSubmit();
      });
      return;
    }
    synced.current = false;
    submitting.current = true;
    onBusyRef.current?.(true);
  };

  // la plica che l'ultima volta non si è presa: su un check nuovo, dal computer,
  // il cursore parte già lì (dal telefono no: aprirebbe la tastiera da sola)
  const missedFocus = useRef(false);
  useEffect(() => {
    if (missedFocus.current || checkId || !lastMissing.length || hideMisure) return;
    missedFocus.current = true;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const el = formRef.current?.querySelector<HTMLInputElement>("input[data-missed]");
    if (el && !el.value) el.focus({ preventScroll: false });
  }, [checkId, lastMissing, hideMisure]);

  // i test restano chiusi, tranne se ce ne sono già
  const hasTests = f.tests.some((t) => t.exercise || t.load) || Boolean(f.tests_text.trim());
  const sites = protocolSites(sex);
  const age = ageAt(birthDate, f.check_date, knownAges);
  const ageEstimated = !birthDate && age !== null;
  const readings = useMemo(() => {
    const r: Partial<Record<SkinfoldSite, Array<number | null>>> = {};
    for (const s of sites) r[s] = f.sf[s].map(toNum);
    return r;
  }, [f.sf, sites]);
  const comp = useMemo(() => computeBodyComposition({ sex, age, weightKg: toNum(f.weight), skinfolds: readings, formula }), [readings, sex, age, f.weight, formula]);
  const avgs = averagesOf(readings);
  const measured = Object.keys(avgs) as SkinfoldSite[];
  const ref = formulaById(formula);
  const refMissing = ref ? ref.sites.filter((s) => avgs[s] === undefined) : [];
  const lower = (l: SkinfoldSite[]) => l.map((m) => siteLabel(m).toLowerCase()).join(", ");
  const foldRows = SKINFOLD_SITES.filter((s) => sites.includes(s.key));

  return (
    <form ref={formRef} id={formId} action={formAction} onSubmit={onSubmit} className="flex flex-col gap-5">
      <input type="hidden" name="draft_key" value={key} />
      {previous && !hideMisure ? (
        <p className="-mb-2 px-1 text-sm text-muted">Accanto a ogni misura: quella del check del <strong className="text-ink">{previous.label}</strong> e la differenza.</p>
      ) : null}
      <Card className={cx(hideMisure && "hidden")}>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="check_date">Data</Label>
            <Input id="check_date" name="check_date" type="date" value={f.check_date} onChange={(e) => set("check_date", e.target.value)} required={Boolean(values.check_date)} />
          </div>
          <div>
            <Label htmlFor="weight_kg" hint="kg">Peso</Label>
            <Input id="weight_kg" name="weight_kg" inputMode="decimal" data-nav data-nav-label="Peso" value={f.weight} onChange={(e) => set("weight", e.target.value)} placeholder={previous ? undefined : "65,5"} />
            <Before prev={previous?.weight} now={toNum(f.weight)} unit=" kg" />
          </div>
          <div className="flex items-end text-sm text-muted">{age !== null ? `${age} anni alla data del check` : "Manca la data di nascita nella scheda: serve per la percentuale di grasso."}</div>
        </div>
      </Card>

      <Card className={cx(hideMisure && "hidden")}>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <Eyebrow>Pliche in mm · {sex === "M" ? "uomo, 7 pliche" : "donna, 5 pliche"}</Eyebrow>
          <span className="text-sm text-muted">3 rilevazioni per plica, la media è automatica</span>
        </div>
        <div className="scroll-x">
          <table className="w-full border-collapse text-[15px] sm:min-w-[520px]">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th scope="col" className="py-2 font-semibold">Plica</th>
                <th scope="col" className="px-1 py-2 font-semibold">1ª</th>
                <th scope="col" className="px-1 py-2 font-semibold">2ª</th>
                <th scope="col" className="px-1 py-2 font-semibold">3ª</th>
                <th scope="col" className="py-2 pl-3 text-right font-semibold">Media</th>
              </tr>
            </thead>
            <tbody>
              {foldRows.map((s, row) => {
                const avg = siteAverage(f.sf[s.key].map(toNum));
                const prev = previous?.folds[s.key];
                return (
                  <tr key={s.key} className={cx("border-t border-sand-deep", lastMissing.includes(s.key) && "bg-accent-soft/60")}>
                    <th scope="row" className="w-[24%] py-2 pr-1 text-left text-sm font-semibold break-words sm:w-auto sm:text-[15px]">
                      {s.label}
                      {prev !== undefined ? <span className="block text-xs font-normal text-muted tabular">prima {fmtNum(prev, 1)}</span> : null}
                      {lastMissing.includes(s.key) ? <span className="block text-xs font-normal text-accent-deep">l&apos;ultima volta non presa</span> : null}
                    </th>
                    {[0, 1, 2].map((i) => (
                      <td key={i} className="px-1 py-1.5">
                        <input
                          aria-label={`${s.label}, rilevazione ${i + 1}`}
                          name={`sf_${s.key}_${i}`}
                          data-missed={lastMissing.includes(s.key) && i === 0 ? "" : undefined}
                          inputMode="decimal"
                          data-nav
                          data-nav-label={`${s.label} · ${i + 1}ª`}
                          data-nav-row={row}
                          data-nav-col={i}
                          value={f.sf[s.key][i]}
                          onChange={(e) => set("sf", { ...f.sf, [s.key]: f.sf[s.key].map((x, j) => (j === i ? e.target.value : x)) })}
                          className={cx("w-full min-w-0 rounded-lg border bg-sand px-0 py-2 text-center text-base sm:px-2", lastMissing.includes(s.key) ? "border-accent" : "border-sand-deep")}
                        />
                      </td>
                    ))}
                    <td className="py-2 pl-2 text-right text-sm font-semibold tabular sm:pl-3 sm:text-[15px]">
                      {avg !== null ? fmtNum(avg, 2) : "—"}
                      {avg !== null && prev !== undefined ? (
                        <span className="block text-xs font-semibold text-ink-soft">{(() => { const d = Math.round((avg - prev) * 100) / 100; return d === 0 ? "=" : `${sign(d)}${fmtNum(Math.abs(d), 1)}`; })()}</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-5 rounded-2xl bg-ink p-5 text-card">
          {measured.length === 0 ? (
            <p className="text-[15px] leading-relaxed text-muted-dark">Scrivi le pliche che riesci a prendere: se una non si prende lasciala vuota, non conta come zero.</p>
          ) : formula === null ? (
            <p className="text-[15px] leading-relaxed text-muted-dark">
              Somma pliche <strong className="text-card">{fmtNum(sumOf(avgs, measured), 2)} mm</strong>. Con le pliche prese finora a questo cliente non c&apos;è una formula validata per la percentuale di grasso: si confrontano somma delle pliche, peso e circonferenze.
            </p>
          ) : comp.ok && !(comp.fallback && manual) ? (
            <>
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(120px,1fr))]">
                <Result label="Somma pliche" value={`${fmtNum(sumOf(avgs, measured), 2)} mm`} />
                <Result label="Massa grassa" value={`${fmtNum(comp.bodyFatPct, 2)} %`} before={previous?.fatPct} now={comp.bodyFatPct} />
                <Result label="Massa grassa" value={comp.fatMassKg !== null ? `${fmtNum(comp.fatMassKg, 2)} kg` : "serve il peso"} before={previous?.fatKg} now={comp.fatMassKg} />
                <Result label="Massa magra" value={comp.leanMassKg !== null ? `${fmtNum(comp.leanMassKg, 2)} kg` : "serve il peso"} before={previous?.leanKg} now={comp.leanMassKg} />
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-dark">
                Formula: {comp.formula.label}.
                {ageEstimated ? ` Età ${age} anni, presa dai check precedenti: manca la data di nascita (la aggiungi nei Dati del cliente).` : ""}
                {comp.fallback && ref
                  ? ` Manca ${lower(refMissing)}: al salvataggio tutti i check di questo cliente passeranno a questa formula, così i grafici restano confrontabili. Puoi cambiarla dalla pagina dei check.`
                  : ""}
              </p>
            </>
          ) : comp.ok ? (
            <p className="text-[15px] leading-relaxed text-muted-dark">
              Somma pliche <strong className="text-card">{fmtNum(sumOf(avgs, measured), 2)} mm</strong>. Con la formula scelta ({ref?.label}) manca {lower(refMissing)}: questo check resterà senza percentuale. Solo come indicazione, con {comp.formula.label.toLowerCase()} sarebbe {fmtNum(comp.bodyFatPct, 1)} %.
            </p>
          ) : (
            <p className="text-[15px] leading-relaxed text-muted-dark">
              Somma pliche <strong className="text-card">{fmtNum(sumOf(avgs, measured), 2)} mm</strong>.{" "}
              {comp.missing.length
                ? `Con queste pliche non c'è una formula validata per la percentuale di grasso (manca ${lower(comp.missing)}): confronta la somma delle pliche, il peso e le circonferenze.`
                : comp.reason + "."}{" "}
              Puoi comunque salvare il check.
            </p>
          )}
        </div>
      </Card>

      <Card className={cx(hideMisure && "hidden")}>
        <Eyebrow className="mb-4">Circonferenze in cm</Eyebrow>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))]">
          {CIRCUMFERENCES.map((c) => (
            <div key={c.key}>
              <Label htmlFor={`circ_${c.key}`}>{c.label}</Label>
              <Input id={`circ_${c.key}`} name={`circ_${c.key}`} inputMode="decimal" data-nav data-nav-label={c.label} value={f.circ[c.key] ?? ""} onChange={(e) => set("circ", { ...f.circ, [c.key]: e.target.value })} />
              <Before prev={previous?.circ[c.key]} now={toNum(f.circ[c.key] ?? "")} />
            </div>
          ))}
        </div>
      </Card>

      {photoFolder ? (
        <Card className={cx("flex flex-col gap-3", hideMisure && "hidden")}>
          <Eyebrow>Foto del check <span className="normal-case tracking-normal text-muted">· facoltative</span></Eyebrow>
          <p className="text-sm text-muted">Si caricano subito, ridotte e senza dati nascosti, e le vedi anche sull&apos;altro dispositivo. Entrano nel check con &quot;Check finito&quot;.</p>
          {savedPhotos.length ? <PhotoGrid photos={savedPhotos} clientId={clientId} canDelete title="Foto già nel check" /> : null}
          <PendingPhotos
            clientId={clientId}
            checkId={photoFolder}
            photos={pendingList}
            onAdd={(p) => setF((x) => ({ ...x, photos: { ...(x.photos ?? {}), [p.path]: { ...p, at: Date.now() } } }))}
            onRemove={(path) =>
              setF((x) => {
                const next = { ...(x.photos ?? {}) };
                delete next[path];
                return { ...x, photos: next };
              })
            }
          />
          {newCheck ? <input type="hidden" name="new_id" value={photoFolder} /> : null}
          {pendingList.length ? <input type="hidden" name="pending_photos" value={JSON.stringify(pendingList.map(({ path, thumbPath, width, height, size }) => ({ path, thumbPath, width, height, size })))} /> : null}
        </Card>
      ) : null}
      {newCheck && !photoFolder ? (
        <Card className={cx("flex flex-col gap-3", hideMisure && "hidden")}>
          <Eyebrow>Foto del check <span className="normal-case tracking-normal text-muted">· facoltative</span></Eyebrow>
          <p className="text-sm text-muted">Sceglile tutte insieme dalla galleria: si caricano quando salvi il check, ridotte e senza dati nascosti. Puoi anche aggiungerle dopo, aprendo il check.</p>
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            aria-label="Scegli le foto da caricare con il check"
            onChange={(e) => {
              const files = onlyImages(Array.from(e.currentTarget.files ?? []));
              setPhotos((p) => [...p, ...files].slice(0, 12));
              e.currentTarget.value = "";
            }}
          />
          {previews.length ? (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Foto scelte">
              {previews.map((u, i) => (
                <li key={u} className="relative aspect-[3/4] overflow-hidden rounded-xl bg-sand">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                  <button type="button" onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))} className="absolute top-1 right-1 flex h-8 w-8 items-center justify-center rounded-full bg-ink/70 text-card" aria-label={`Togli la foto ${i + 1}`}>
                    <IconX size={16} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div>
            <button type="button" onClick={() => photoInput.current?.click()} className="inline-flex min-h-11 items-center gap-2 rounded-full border-[1.5px] border-ink px-4 text-[15px] font-semibold">
              <IconPhoto size={18} /> {photos.length ? "Aggiungi altre foto" : "Scegli le foto"}
            </button>
          </div>
        </Card>
      ) : null}
      <details className={cx("group rounded-[24px] bg-card", hideMisure && "hidden")} open={hasTests}>
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 sm:px-6 [&::-webkit-details-marker]:hidden">
          <span><span className="eyebrow block">Test di forza, corsa, HYROX</span><span className="mt-1 block text-sm text-muted">Facoltativi: tocca per aggiungerli</span></span>
          <IconDown size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-5 pb-5 sm:px-6">
        <p className="mb-4 text-sm text-muted">Massimale stimato con la tabella RPE (se non lo scegli vale RPE 10, cioè serie al limite), arrotondato a 2,5 kg. Fino a 12 ripetizioni.</p>
        <div className="flex flex-col gap-3">
          <div className="hidden gap-2 text-xs font-semibold text-muted sm:grid sm:grid-cols-[minmax(0,1fr)_6rem_5rem_6rem_9rem]">
            <span>Esercizio</span><span>Carico kg</span><span>Ripetizioni</span><span>RPE</span><span className="text-right">Massimale stimato</span>
          </div>
          {f.tests.map((t, i) => {
            const load = toNum(t.load);
            const reps = toNum(t.reps);
            const e = load && reps ? estimateOneRepMax(load, reps, toNum(t.rpe) ?? 10) : null;
            // perché manca il massimale, invece di un "—" muto
            const why = !t.exercise.trim() && !load && !reps ? "" : !load || !reps ? "servono carico e ripetizioni" : reps > 12 ? "oltre 12 ripetizioni non si stima" : "";
            const setT = (k: keyof typeof t, v: string) => set("tests", f.tests.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
            return (
              <div key={i} className="grid grid-cols-3 items-center gap-2 border-t border-sand-deep pt-3 first:border-t-0 first:pt-0 sm:grid-cols-[minmax(0,1fr)_6rem_5rem_6rem_9rem] sm:border-t-0 sm:pt-0">
                <input aria-label={`Test ${i + 1}, esercizio`} name={`test_${i}_exercise`} value={t.exercise} onChange={(ev) => setT("exercise", ev.target.value)} placeholder={i === 0 ? "Squat" : "Esercizio"} className="col-span-3 w-full rounded-lg border border-sand-deep bg-sand px-2 py-2 sm:col-span-1" />
                <input aria-label={`Test ${i + 1}, carico`} name={`test_${i}_load`} inputMode="decimal" value={t.load} onChange={(ev) => setT("load", ev.target.value)} placeholder="kg" className="w-full min-w-0 rounded-lg border border-sand-deep bg-sand px-2 py-2 text-center" />
                <input aria-label={`Test ${i + 1}, ripetizioni`} name={`test_${i}_reps`} inputMode="numeric" value={t.reps} onChange={(ev) => setT("reps", ev.target.value)} placeholder="rip." className="w-full min-w-0 rounded-lg border border-sand-deep bg-sand px-2 py-2 text-center" />
                <select aria-label={`Test ${i + 1}, RPE`} name={`test_${i}_rpe`} value={t.rpe} onChange={(ev) => setT("rpe", ev.target.value)} className="w-full min-w-0 rounded-lg border border-sand-deep bg-sand px-2 py-2">
                  <option value="">RPE 10</option>
                  {RPE_VALUES.filter((r) => r !== 10).map((r) => <option key={r} value={r}>{String(r).replace(".", ",")}</option>)}
                </select>
                <span className="col-span-3 text-right text-sm font-semibold tabular sm:col-span-1 sm:text-[15px]">
                  <span className="font-normal text-muted sm:hidden">Massimale stimato </span>{e ? `${fmtNum(e, 1)} kg` : why ? <span className="text-xs font-normal text-muted">{why}</span> : "—"}
                </span>
              </div>
            );
          })}
          {f.tests.length < MAX_TESTS ? (
            <button type="button" onClick={() => set("tests", [...f.tests, { exercise: "", load: "", reps: "", rpe: "" }])} className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-full px-1 text-sm font-semibold underline">
              + Altro test
            </button>
          ) : null}
        </div>
        <div className="mt-5">
          <Label htmlFor="tests_text" hint="corsa, cardio, HYROX, qualsiasi altro test">Altri test</Label>
          <NoteArea title="Altri test" id="tests_text" name="tests_text" rows={3} value={f.tests_text} onChange={(e) => set("tests_text", e.target.value)} placeholder="3 km in 13:40 · zona 2 a 10,5 km/h · 1000 m ski erg 3:58" />
        </div>
        </div>
      </details>

      <Card className={cx(hideAppunti && "hidden")}>
        <div className="flex items-end justify-between gap-2"><Label htmlFor="notes_next_phase" hint="abitudini, andamento, cosa cambiare. Riappare nell'editor del programma">Note per la prossima fase</Label><DictateButton onText={(t) => setF((x) => ({ ...x, notes_next_phase: x.notes_next_phase ? `${x.notes_next_phase.trimEnd()} ${t}` : t }))} /></div>
        <NoteArea title="Note per la prossima fase" id="notes_next_phase" name="notes_next_phase" rows={4} value={f.notes_next_phase} onChange={(e) => set("notes_next_phase", e.target.value)} />
        <label className="mt-4 flex items-center gap-3 text-[15px]">
          <input type="checkbox" name="visible_to_client" checked={f.visible} onChange={(e) => set("visible", e.target.checked)} className="h-5 w-5 accent-[#1b1a17]" />
          Il cliente vede questo check nei suoi progressi (le note per la prossima fase restano private)
        </label>
      </Card>

      {photos.length ? <input type="hidden" name="with_photos" value="1" /> : null}

      {upload ? (
        <div className="rounded-2xl bg-ink px-4 py-3 text-[15px] text-card" role="status">
          Check salvato. Carico le foto: {upload.done} di {upload.total}… tieni aperta l&apos;app.
        </div>
      ) : uploadError ? (
        <div className="rounded-2xl bg-accent-soft px-4 py-3 text-[15px]" role="alert">{uploadError}</div>
      ) : (
        <ActionMessage state={state?.ok ? null : state} />
      )}
      {upload ? null : autoSave ? (
        <p
          className={cx("text-sm", liveStatus.kind === "error" ? "font-semibold text-accent-deep" : "text-muted")}
          role={liveStatus.kind === "error" ? "alert" : undefined}
          aria-live="polite"
          data-live-status={liveStatus.kind}
        >
          {liveStatus.kind === "waiting" || liveStatus.kind === "saving"
            ? "Salvo…"
            : liveStatus.kind === "saved"
              ? `Salvato${liveStatus.at ? ` alle ${new Date(liveStatus.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}` : ""}`
              : liveStatus.kind === "error"
                ? `Non salvato: ${liveStatus.error}`
                : "Si salva da solo mentre scrivi."}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SubmitButton>{submitLabel ?? (photos.length ? `Salva check e ${photos.length} foto` : "Salva check")}</SubmitButton>
          <DraftNote
            confirm={submitLabel ?? (photos.length ? `Salva check e ${photos.length} foto` : "Salva check")}
            status={draft.status}
            restored={restored}
            onDiscard={() => {
              clear();
              setRestored(null);
              adopt(start);
              setF(start);
            }}
          />
        </div>
      )}
      <FieldNav root={formRef} />
    </form>
  );
}

function Result({ label, value, before, now }: { label: string; value: string; before?: number | null; now?: number | null }) {
  const d = before !== null && before !== undefined && now !== null && now !== undefined ? Math.round((now - before) * 100) / 100 : null;
  return (
    <div>
      <div className="text-xs font-semibold tracking-wide text-muted-dark uppercase">{label}</div>
      <div className="mt-1 text-2xl font-light tabular">{value}</div>
      {before !== null && before !== undefined ? (
        <div className="text-xs text-muted-dark tabular">prima {fmtNum(before, 1)}{d !== null ? ` · ${d === 0 ? "=" : `${sign(d)}${fmtNum(Math.abs(d), 1)}`}` : ""}</div>
      ) : null}
    </div>
  );
}
