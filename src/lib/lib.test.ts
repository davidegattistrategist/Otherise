import { applyPatch, diffDraft, isDraftPatch, mergeDraft } from "./draft-merge";
import { fillName, looksLikeQuestion, pendingClientMessages, pseudonymize, similarity, styleParts, styleSections, worthLearning, type StyleExample } from "./reply-draft";
import { prescriptionRule, setDifferences, workoutVsPlan } from "./reply-context";
import { describe, expect, it } from "vitest";
import { commonSites, computeBodyComposition, formulaById, formulaUpgrade, protocolSites, referenceFormula, siteAverage } from "./body/skinfolds";
import { sortChecks } from "./check-order";
import { checkDue } from "./check-due";
import { DEDICATIONS, QUOTES, dedicationOfDay, quoteOfDay } from "./quotes";
import { estimateOneRepMax } from "./strength/e1rm";
import { isOneSideExercise, isPerSideText, parsePrescription, prescriptionFromSets, summarizeSets } from "./program/prescription";
import { parseEuro, billingStatus, clientFacingStatus, unpaidPeriods, withUnpaidRows, usesCredit, nextPaymentProposal, creditChange, dueAmount, isCoaching, ptCounterView, periodEnd, suggestNextPeriod, type PlanKind } from "./billing";
import { clientNotices, ptLeft } from "./client-notice";
import { triageFallback, triageWithoutAi } from "./note-triage";
import { backupNotice, formatBytes, spaceSummary } from "./backup-notice";
import { clientPaymentText, paymentEvent, staffPaymentText } from "./payment-alerts";
import { compareRows, defaultPair, firstToLast, sitesInAll, type BodyPoint } from "./body/progress";
import { splitLinks } from "../components/chat/linkify";
import { chatSilence, chatSilenceAlert, romeDay, snoozeUntil } from "./chat-silence";
import { romeHour } from "./dates";
import { addDays, addMonths, ageOn, diffDays, formatHeading, isBirthday, isISODate, mondayOf, todayISO } from "./dates";
import { displayWeek, nextDay, nextWorkout, programEndDate, weekPosition } from "./program/schedule";
import { buildNextPhase, copyWeekToOthers } from "./program/next-phase";
import { blockLetter, blockSummary, emptyBlock, itemLabel, normalizeWeeks, parseContent, type ProgramContent } from "./program/types";
import { parseCsv } from "./import/csv";
import { parseProgramSheet } from "./import/sheet";
import { parseExerciseCsv, youtubeId } from "./import/exercises";
import { checkinWeekFor } from "./checkin";
import { appendToDay, blockNames, collectBlocks, deleteSelected, fitPrescriptions, insertBeforeSelected, parseClip, replaceSelected, samePlaceIds } from "./program/clipboard";

describe("plicometria", () => {
  it("donna, 5 pliche: stessi numeri del foglio report mensile", () => {
    // valori di un check reale del foglio: somma 75,5 mm, 33 anni, 65,5 kg → 21,71% / 14,22 / 51,28
    const r = computeBodyComposition({
      sex: "F",
      age: 33,
      weightKg: 65.5,
      skinfolds: {
        tricipite: [18.5, 18.5, 18.5],
        sottoscapolare: [9.5, 9.5, 9.5],
        soprailiaca: [8, 8, 8.5],
        addominale: [11, 11, 10.5],
        coscia: [28.5, 28.5, 28.5],
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sumMm).toBe(75.5);
    expect(r.bodyFatPct).toBe(21.71);
    expect(r.fatMassKg).toBe(14.22);
    expect(r.leanMassKg).toBe(51.28);
  });

  it("uomo, 7 pliche: formula Jackson-Pollock + Siri", () => {
    const sk = Object.fromEntries(protocolSites("M").map((s) => [s, [100 / 7, 100 / 7, 100 / 7]]));
    const r = computeBodyComposition({ sex: "M", age: 30, weightKg: 80, skinfolds: sk });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bodyFatPct).toBe(14.63);
  });

  it("con 3 pliche usa la formula a 3 pliche (petto, tricipite, sottoscapolare)", () => {
    const r = computeBodyComposition({
      sex: "M",
      age: 29,
      weightKg: 98,
      skinfolds: { tricipite: [21, 21, 21], pettorale: [16, 16, 16], sottoscapolare: [22, 22.5, 22] },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.formula.id).toBe("m3_pts");
    expect(r.bodyFatPct).toBe(22.77);
    expect(r.fallback).toBe(false);
  });

  it("donna senza coscia: formula tricipite, soprailiaca, addome", () => {
    const r = computeBodyComposition({ sex: "F", age: 40, weightKg: 60, skinfolds: { tricipite: [12], sottoscapolare: [9], soprailiaca: [8], addominale: [10] } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.formula.id).toBe("f3_tsa");
    expect(r.bodyFatPct).toBeCloseTo(16.96, 2);
  });

  it("non calcola la percentuale senza una formula validata (mai una plica a zero)", () => {
    const r = computeBodyComposition({ sex: "F", age: 30, weightKg: 60, skinfolds: { tricipite: [12], sottoscapolare: [9], soprailiaca: [8] } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toEqual(["addominale", "coscia"]);
  });

  it("con la formula di riferimento: se manca una sua plica ripiega e lo segnala", () => {
    const sk = { tricipite: [12], sottoscapolare: [9], soprailiaca: [8], addominale: [10] };
    const r = computeBodyComposition({ sex: "F", age: 30, weightKg: 60, skinfolds: sk, formula: "f5" });
    expect(r.ok && r.fallback && r.formula.id).toBe("f3_tsa");
  });

  it("formula di riferimento: la più completa valida per tutti i check, o quella scelta", () => {
    const full = { averages: { tricipite: 12, sottoscapolare: 9, soprailiaca: 8, addominale: 10, coscia: 20 } };
    const noThigh = { averages: { tricipite: 12, sottoscapolare: 9, soprailiaca: 8, addominale: 10 } };
    const none = { averages: {} };
    expect(referenceFormula("F", [full, full])?.id).toBe("f5");
    expect(referenceFormula("F", [noThigh, full, none])?.id).toBe("f3_tsa");
    expect(referenceFormula("F", [noThigh, full], "f5")?.id).toBe("f5");
    expect(referenceFormula("F", [])?.id).toBe("f5");
    expect(referenceFormula("F", [{ averages: { tricipite: 12, sottoscapolare: 9, soprailiaca: 8 } }])).toBeNull();
    expect(referenceFormula("M", [full], "f5")?.id).toBeUndefined();
  });

  it("propone una formula più completa dopo 3 check di fila con la plica in più", () => {
    const full = { averages: { tricipite: 12, sottoscapolare: 9, soprailiaca: 8, addominale: 10, coscia: 20 } };
    const noThigh = { averages: { tricipite: 12, sottoscapolare: 9, soprailiaca: 8, addominale: 10 } };
    const f3 = referenceFormula("F", [noThigh, full, full]);
    expect(formulaUpgrade("F", [noThigh, full, full], f3)).toBeNull();
    expect(formulaUpgrade("F", [noThigh, full, { averages: {} }, full, full], f3)?.id).toBe("f5");
    expect(formulaUpgrade("F", [noThigh, full, full, full], formulaById("f5"))).toBeNull();
  });

  it("somma confrontabile: solo le pliche prese in tutti i check", () => {
    const a = { averages: { tricipite: 12, sottoscapolare: 9, coscia: 20 } };
    const b = { averages: { tricipite: 11, sottoscapolare: 8 } };
    expect(commonSites("F", [a, b, { averages: {} }])).toEqual(["tricipite", "sottoscapolare"]);
  });

  it("chiede l'età se manca", () => {
    const sk = Object.fromEntries(protocolSites("F").map((s) => [s, [10]]));
    const r = computeBodyComposition({ sex: "F", age: null, weightKg: 60, skinfolds: sk });
    expect(r.ok).toBe(false);
  });

  it("media delle sole rilevazioni inserite", () => {
    expect(siteAverage([8, 8, 8.5])).toBeCloseTo(8.1667, 3);
    expect(siteAverage([12, null, null])).toBe(12);
    expect(siteAverage([null, null])).toBeNull();
  });

  it("protocollo donna senza pettorale e ascellare", () => {
    expect(protocolSites("F")).toEqual(["tricipite", "sottoscapolare", "soprailiaca", "addominale", "coscia"]);
  });
});

describe("frase del giorno", () => {
  it("dedica col nome, diversa ogni giorno", () => {
    expect(dedicationOfDay("2026-10-12", "Giulia")).toBe("per Giulia");
    expect(dedicationOfDay("2026-10-13", " Giulia ")).toBe("forza Giulia");
    expect(dedicationOfDay(`2026-10-${12 + DEDICATIONS.length}`, "Giulia")).toBe("per Giulia");
    expect(dedicationOfDay("2026-10-12", null)).toBe("un giorno alla volta");
  });
  it("una frase per ogni data, uguale per tutti; il 29 febbraio solo negli anni bisestili", () => {
    expect(Object.keys(QUOTES)).toHaveLength(366);
    expect(quoteOfDay("2027-01-01")).toEqual({ text: "Devi cambiare la tua vita.", author: "Rilke" });
    expect(quoteOfDay("2026-12-25").text).toMatch(/Natale/);
    expect(quoteOfDay("2028-02-29").text).toMatch(/calendario/);
    expect(quoteOfDay("2027-03-01")).toBe(QUOTES["03-01"]);
    expect(quoteOfDay(addDays("2027-02-28", 1))).toBe(QUOTES["03-01"]);
  });
});

describe("check da fare", () => {
  const prog = (endDate: string) => ({ endDate, state: "running" });
  it("solo per chi fa i check nell'app, dall'ultima settimana della fase", () => {
    expect(checkDue({ checksInApp: false, lastCheck: "2026-09-01", program: prog("2026-10-14") }, "2026-10-12")).toBeNull();
    expect(checkDue({ checksInApp: true, lastCheck: "2026-09-01", program: prog("2026-10-30") }, "2026-10-12")).toBeNull();
    expect(checkDue({ checksInApp: true, lastCheck: "2026-09-01", program: prog("2026-10-15") }, "2026-10-12")?.text).toBe("La fase finisce tra 3 giorni");
    expect(checkDue({ checksInApp: true, lastCheck: "2026-09-01", program: prog("2026-10-10") }, "2026-10-12")).toEqual({ text: "Fase finita da 2 giorni", late: true });
  });
  it("sparisce quando il check di fine fase è fatto, e senza programma non c'è", () => {
    expect(checkDue({ checksInApp: true, lastCheck: "2026-10-11", program: prog("2026-10-15") }, "2026-10-12")).toBeNull();
    expect(checkDue({ checksInApp: true, lastCheck: "2026-09-01", program: null }, "2026-10-12")).toBeNull();
  });
});

describe("ordine dei check", () => {
  it("prima lo storico senza data, poi per data; order_hint mette al suo posto un check senza data", () => {
    const list = [
      { id: "b", check_date: "2025-03-01", created_at: "1" },
      { id: "n2", check_date: null, sequence: 2, created_at: "1" },
      { id: "h", check_date: null, sequence: 3, order_hint: "2025-02-01", created_at: "1" },
      { id: "a", check_date: "2025-01-01", created_at: "1" },
      { id: "n1", check_date: null, sequence: 1, created_at: "1" },
    ];
    expect(sortChecks(list).map((c) => c.id)).toEqual(["n1", "n2", "a", "h", "b"]);
  });
});

describe("massimale stimato", () => {
  it("100 kg × 5 a RPE 8 → 81% → 122,5 kg", () => {
    expect(estimateOneRepMax(100, 5, 8)).toBe(122.5);
  });
  it("1 ripetizione a RPE 10 = carico", () => {
    expect(estimateOneRepMax(72.5, 1, 10)).toBe(72.5);
  });
  it("fuori tabella → null", () => {
    expect(estimateOneRepMax(100, 15, 8)).toBeNull();
    expect(estimateOneRepMax(100, 5, 6)).toBeNull();
  });
});

describe("prescrizioni dei vostri programmi", () => {
  const cases: Array<[string, unknown]> = [
    ["4x8 65kg", { kind: "sets", sets: 4, reps: 8, kg: 65 }],
    ["1x1 72,5kg", { kind: "sets", sets: 1, reps: 1, kg: 72.5 }],
    ["4x8/10", { kind: "sets", sets: 4, reps: null, repsText: "8/10", kg: null }],
    ["4x10 45/47,5kg", { kind: "sets", sets: 4, reps: 10, kg: null, loadText: "45/47,5 kg" }],
    ["2x 6/8  ripetizioni più controllate possibile", { kind: "sets", sets: 2, repsText: "6/8" }],
    ["4x8/10 discesa in 3\"", { kind: "sets", sets: 4, repsText: "8/10" }],
    ["3x20\"", { kind: "timed", sets: 3, seconds: 20 }],
    ["3x20-30\"", { kind: "timed", sets: 3, seconds: 20 }],
    ["2x20\" per gamba", { kind: "timed", sets: 2, seconds: 20 }],
    ["5x800m", { kind: "distance", sets: 5, meters: 800 }],
    ["5x 1400m 12.5km/h", { kind: "distance", sets: 5, meters: 1400 }],
    ["3x20m 40kg", { kind: "distance", sets: 3, meters: 20 }],
    ["4x1000 4:30 + 3x500 4:15", { kind: "text" }],
    ["7 corridoi 140kg", { kind: "text" }],
    ["50kg 3 ripetizioni ogni 70\" x 10", { kind: "text" }],
    ["2km facili", { kind: "text" }],
    ["", { kind: "text" }],
  ];
  for (const [input, expected] of cases) {
    it(JSON.stringify(input), () => {
      expect(parsePrescription(input)).toMatchObject(expected as object);
    });
  }

  it("riassume e ricostruisce dal logbook", () => {
    expect(summarizeSets([{ kg: 65, reps: 10 }, { kg: 65, reps: 10 }])).toBe("2 × 10 · 65 kg");
    expect(summarizeSets([{ kg: 22.5, reps: 6 }, { kg: 22.5, reps: 7 }])).toBe("6×22,5, 7×22,5 kg");
    expect(summarizeSets([])).toBeNull();
    expect(prescriptionFromSets([{ kg: 65, reps: 11 }, { kg: 65, reps: 11 }, { kg: 65, reps: 11 }, { kg: 65, reps: 11 }])).toBe("4x11 65kg");
    expect(prescriptionFromSets([{ kg: 65, reps: 11 }, { kg: 60, reps: 11 }])).toBeNull();
  });
});

describe("date", () => {
  it("compleanno (anche per chi è nato il 29 febbraio)", () => {
    expect(isBirthday("1990-10-11", "2026-10-11")).toBe(true);
    expect(isBirthday("1990-10-12", "2026-10-11")).toBe(false);
    expect(isBirthday(null, "2026-10-11")).toBe(false);
    expect(isBirthday("1996-02-29", "2027-02-28")).toBe(true);
    expect(isBirthday("1996-02-29", "2028-02-28")).toBe(false);
    expect(isBirthday("1996-02-29", "2028-02-29")).toBe(true);
  });

  it("formato e calcoli", () => {
    expect(isISODate("2026-02-30")).toBe(false);
    expect(isISODate("2026-10-09")).toBe(true);
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(diffDays("2026-10-01", "2026-10-09")).toBe(8);
    expect(mondayOf("2026-10-11")).toBe("2026-10-05");
    expect(ageOn("1992-10-10", "2026-10-09")).toBe(33);
    expect(ageOn("1992-10-09", "2026-10-09")).toBe(34);
    expect(formatHeading("2026-10-09")).toBe("Venerdì 9 ottobre");
  });
  it("oggi è calcolato sull'ora italiana", () => {
    // 23:30 UTC del 9 ottobre = 01:30 del 10 ottobre in Italia
    expect(todayISO(new Date("2026-10-09T23:30:00Z"))).toBe("2026-10-10");
  });
});

describe("pagamenti", () => {
  it("periodi: dal 22 luglio al 21 ottobre, il rinnovo dal giorno dopo", () => {
    expect(periodEnd("quarterly", "2026-07-22")).toBe("2026-10-21");
    expect(periodEnd("monthly", "2026-10-10")).toBe("2026-11-09");
    expect(periodEnd("six_weeks", "2026-10-01")).toBe("2026-11-11");
    expect(periodEnd("monthly", "2026-01-31")).toBe("2026-02-27");
    expect(suggestNextPeriod("quarterly", "2026-01-01", "2026-10-21")).toEqual({ start: "2026-10-22", end: "2027-01-21" });
    expect(suggestNextPeriod("package", "2026-01-01", null)).toBeNull();
  });
  it("coaching rimasto indietro: una riga per periodo, il credito sul primo", () => {
    const plan = { kind: "six_weeks" as const, amount: 300, start_date: "2026-01-01" };
    const rows = unpaidPeriods(plan, "2026-08-02", "2026-10-13", 200);
    expect(rows.map((r) => [r.start, r.end, r.amount, r.late])).toEqual([
      ["2026-08-03", "2026-09-13", 100, true],
      ["2026-09-14", "2026-10-25", 300, false],
    ]);
    expect(unpaidPeriods(plan, "2026-10-20", "2026-10-13")).toEqual([]);
  });
  it("stati", () => {
    const base = { plan_id: "p", amount: 600, sessions_bought: 0, sessions_used: 0, paid_until: null as string | null };
    expect(billingStatus({ ...base, kind: "quarterly", paid_until: "2026-11-01" }, "2026-10-09").state).toBe("ok");
    const soon = billingStatus({ ...base, kind: "quarterly", paid_until: "2026-10-14" }, "2026-10-09");
    expect(soon.state).toBe("due_soon");
    expect(soon.label).toBe("Scade tra 5 giorni");
    // trimestre in corso non ancora pagato: "da saldare", non scaduto
    const inPeriod = billingStatus({ ...base, kind: "quarterly", paid_until: "2026-10-08" }, "2026-10-09");
    expect(inPeriod.label).toBe("Trimestre da saldare");
    expect(inPeriod.clientLabel).toBe("Trimestre da saldare");
    expect(inPeriod.unpaidPeriods).toBe(1);
    expect(billingStatus({ ...base, kind: "quarterly", paid_until: "2026-10-08" }, "2027-01-08").label).toBe("Trimestre da saldare");
    // finito anche quel trimestre senza pagamento: scaduto
    const late = billingStatus({ ...base, kind: "quarterly", paid_until: "2026-10-08" }, "2027-01-10");
    expect(late.label).toBe("Scaduto da 2 giorni");
    expect(late.clientLabel).toBe("Periodo scaduto");
    expect(late.unpaidPeriods).toBe(2);
    expect(clientFacingStatus(inPeriod)).not.toBeNull();
    expect(clientFacingStatus(late)).not.toBeNull();
    // più di un periodo indietro: lo gestisce il trainer
    expect(clientFacingStatus(billingStatus({ ...base, kind: "monthly", paid_until: "2026-06-30" }, "2026-10-09"))).toBeNull();
    expect(billingStatus({ ...base, kind: "six_weeks", paid_until: "2026-09-30" }, "2026-10-09").label).toBe("Blocco di 6 settimane da saldare");
    expect(billingStatus({ ...base, kind: "monthly", paid_until: null }, "2026-10-09").state).toBe("overdue");
    const pkg = billingStatus({ ...base, kind: "package", sessions_bought: 10, sessions_used: 8 }, "2026-10-09");
    expect(pkg.state).toBe("due_soon");
    expect(pkg.label).toBe("2 sessioni rimaste");
    expect(billingStatus({ ...base, kind: "package", sessions_bought: 10, sessions_used: 10 }, "2026-10-09").state).toBe("overdue");
    expect(billingStatus(null, "2026-10-09").state).toBe("none");
  });  it("periodo saltato: resta scaduto anche se ha pagato quello dopo", () => {
    const base = { plan_id: "p", amount: 300, sessions_bought: 0, sessions_used: 0 };
    const ok = billingStatus({ ...base, kind: "six_weeks", paid_until: "2026-10-25" }, "2026-10-13");
    expect(ok.state).toBe("ok");
    const st = withUnpaidRows(ok, [{ id: "x", period_start: "2026-08-03", period_end: "2026-09-13" }], "2026-10-13");
    expect(st.state).toBe("overdue");
    expect(st.label).toBe("Scaduto da 30 giorni");
    expect(st.clientLabel).toBe("Periodo scaduto");
    expect(withUnpaidRows(ok, [], "2026-10-13")).toBe(ok);
  });
  it("credito anche sui pacchetti di lezioni PT: 700 invece di 630, il prossimo pacchetto costa 560", () => {
    const c = creditChange({ planAmount: 630, credit: 0, paid: 700, keep: true });
    expect(c).toBe(70);
    const next = nextPaymentProposal({ kind: "package", amount: 630, method: "cash", start_date: "2026-01-01", package_sessions: 10 }, null, c);
    expect(next.amount).toBe(560);
    expect(next.sessions).toBe(10);
    expect(usesCredit("package")).toBe(true);
    expect(usesCredit("single")).toBe(false);
  });
  it("credito del coaching: paga 500 invece di 300, il rinnovo dopo costa 100", () => {
    // 6 settimane a 300 €: porta 500 → 200 di credito
    const c1 = creditChange({ planAmount: 300, credit: 0, paid: 500, keep: true });
    expect(c1).toBe(200);
    expect(dueAmount(300, c1)).toBe(100);
    // al rinnovo paga i 100 dovuti: credito finito
    expect(c1 + creditChange({ planAmount: 300, credit: c1, paid: 100, keep: true })).toBe(0);
    // paga meno (250): 50 da recuperare, il rinnovo dopo è 350
    const c2 = creditChange({ planAmount: 300, credit: 0, paid: 250, keep: true });
    expect(dueAmount(300, c2)).toBe(350);
    // prezzo diverso solo questa volta: niente credito, e quello di prima si usa
    expect(creditChange({ planAmount: 300, credit: 0, paid: 250, keep: false })).toBe(0);
    expect(creditChange({ planAmount: 300, credit: 200, paid: 150, keep: false })).toBe(-200);
    // credito più grande del prezzo: il rinnovo è gratis
    expect(dueAmount(300, 450)).toBe(0);
  });
  it("coaching o lezioni PT: il programma serve solo a chi è in coaching", () => {
    expect(isCoaching("quarterly", false)).toBe(true);
    expect(isCoaching("six_weeks", false)).toBe(true);
    expect(isCoaching("package", true)).toBe(false);
    expect(isCoaching("single", false)).toBe(false);
    expect(isCoaching(null, true)).toBe(true);
    expect(isCoaching(null, false)).toBe(false);
  });
  it("contatore unico delle sessioni PT: rimaste = pagate − fatte, da saldare con il prezzo", () => {
    expect(ptCounterView(null)).toBeNull();
    expect(ptCounterView({ since: "2026-10-12", baseline_at: null, bought: 10, used: 2 })).toEqual({ bought: 10, used: 2, left: 8, due: 0, price: null, dueAmount: null, since: "2026-10-12", corrected: false });
    // 3 fatte senza pagamento, poi un pacchetto da 10: ne restano 7
    expect(ptCounterView({ since: "2026-10-01", baseline_at: null, bought: 10, used: 3 })?.left).toBe(7);
    const due = ptCounterView({ since: "2026-10-03", baseline_at: "2026-10-03T10:00:00Z", bought: 0, used: 2 }, 45);
    expect(due).toMatchObject({ left: -2, due: 2, dueAmount: 90, corrected: true });
  });
  it("al cliente: in scadenza, periodo in corso da saldare o scaduto da un periodo", () => {
    const base = { plan_id: "p", amount: 600, sessions_bought: 0, sessions_used: 0, paid_until: null as string | null };
    const st = (r: Partial<typeof base> & { kind: PlanKind }) => clientFacingStatus(billingStatus({ ...base, ...r }, "2026-10-12"));
    expect(st({ kind: "quarterly", paid_until: "2026-11-01" })?.state).toBe("ok");
    expect(st({ kind: "quarterly", paid_until: "2026-10-15" })?.state).toBe("due_soon");
    expect(st({ kind: "quarterly", paid_until: "2026-10-05" })?.state).toBe("overdue");
    expect(st({ kind: "quarterly", paid_until: "2026-06-30" })?.clientLabel).toBe("Periodo scaduto");
    expect(st({ kind: "quarterly", paid_until: "2026-03-31" })).toBeNull();
    expect(st({ kind: "monthly", paid_until: null })).toBeNull();
    expect(st({ kind: "package", sessions_bought: 10, sessions_used: 10 })?.state).toBe("overdue");
    expect(st({ kind: "package", sessions_bought: 10, sessions_used: 15 })).toBeNull();
  });
});

const sample: ProgramContent = {
  days: [
    {
      id: "d1", title: "Giorno 1", notes: "",
      blocks: [
        { id: "b1", kind: "single", title: "", notes: "", items: [{ id: "i1", name: "Squat", rest: "90\"", notes: "", prescriptions: ["4x8 60kg", "4x9 60kg", "4x10 60kg"] }] },
        { id: "b2", kind: "superset", title: "", notes: "", rounds: 4, items: [
          { id: "i2", name: "Panca", rest: "", notes: "", prescriptions: ["4x8", "", ""] },
          { id: "i3", name: "Rematore", rest: "", notes: "", prescriptions: ["4x10", "", ""] },
        ] },
      ],
    },
    { id: "d2", title: "Giorno 2", notes: "", blocks: [] },
  ],
};

describe("programmi", () => {
  it("etichette A, A1, A2…", () => {
    expect(blockLetter(0)).toBe("A");
    expect(blockLetter(27)).toBe("AB");
    expect(itemLabel(sample.days[0].blocks[0], 0, 0)).toBe("A");
    expect(itemLabel(sample.days[0].blocks[1], 1, 1)).toBe("B2");
  });
  it("riassunto dei blocchi", () => {
    expect(blockSummary({ ...emptyBlock(4, "emom"), everySec: 120, durationMin: 12 })).toBe("E2MOM 12 min");
    expect(blockSummary({ ...emptyBlock(4, "amrap"), durationMin: 15 })).toBe("AMRAP 15 min");
    expect(blockSummary({ ...emptyBlock(4, "interval"), workSec: 40, restSec: 20, rounds: 8 })).toBe("40\" lavoro · 20\" recupero · 8 giri");
  });
  it("normalizza il numero di settimane e legge contenuti incompleti", () => {
    const n = normalizeWeeks(sample, 5);
    expect(n.days[0].blocks[0].items[0].prescriptions).toHaveLength(5);
    expect(parseContent(null)).toEqual({ days: [] });
    expect(parseContent({ days: [{ id: "x", title: "G", blocks: [{ id: "b", kind: "single", items: [{ id: "i", name: "A" }] }] }] }).days[0].blocks[0].items[0].prescriptions).toEqual([]);
  });
  it("settimana in corso e prossima sessione", () => {
    expect(weekPosition("2026-10-05", 6, "2026-10-09")).toEqual({ state: "running", week: 1 });
    expect(weekPosition("2026-10-05", 6, "2026-10-12")).toEqual({ state: "running", week: 2 });
    expect(weekPosition("2026-10-05", 1, "2026-10-12")).toEqual({ state: "finished", endedDaysAgo: 1 });
    expect(displayWeek("2026-10-12", 6, "2026-10-09")).toBe(1);
    expect(programEndDate("2026-10-05", 6)).toBe("2026-11-15");
    expect(nextDay(sample, 1, [{ week: 1, day_id: "d1", completed: true }])?.day.id).toBe("d2");
    expect(nextDay(sample, 1, [{ week: 1, day_id: "d1", completed: true }, { week: 1, day_id: "d2", completed: true }])).toBeNull();
    // in sequenza: chi salta un allenamento riparte da quello, anche nella settimana dopo
    const doneW1 = sample.days.map((d) => ({ week: 1, day_id: d.id, completed: true }));
    expect(nextWorkout(sample, 4, [])?.week).toBe(1);
    expect(nextWorkout(sample, 4, doneW1)).toMatchObject({ week: 2, index: 0 });
    expect(nextWorkout(sample, 4, [...doneW1, { week: 2, day_id: sample.days[1].id, completed: true }])).toMatchObject({ week: 2, index: 0 });
    expect(nextWorkout(sample, 1, doneW1)).toBeNull();
  });
  it("nuova fase dalla precedente: settimana 1 dal logbook reale", () => {
    const next = buildNextPhase(sample, 4, [
      { item_id: "i1", week: 3, sets: [{ kg: 60, reps: 10 }, { kg: 60, reps: 10 }, { kg: 60, reps: 10 }, { kg: 60, reps: 10 }], result_text: "" },
      { item_id: "i1", week: 2, sets: [{ kg: 60, reps: 9 }], result_text: "" },
    ]);
    expect(next.days[0].blocks[0].items[0].prescriptions).toEqual(["4x10 60kg", "", "", ""]);
    expect(next.days[0].blocks[1].items[0].prescriptions).toEqual(["4x8", "", "", ""]);
    expect(next.days[0].blocks[0].items[0].id).toBe("i1");
  });
  it("copia la settimana sulle altre vuote", () => {
    const c = copyWeekToOthers(sample, 0, 3);
    expect(c.days[0].blocks[1].items[1].prescriptions).toEqual(["4x10", "4x10", "4x10"]);
    expect(c.days[0].blocks[0].items[0].prescriptions).toEqual(["4x8 60kg", "4x9 60kg", "4x10 60kg"]);
  });
});

describe("import dai fogli Google", () => {
  it("CSV con virgolette e a capo nelle celle", () => {
    expect(parseCsv('a,"b,c","d\n+\ne"\n1,2,3')).toEqual([["a", "b,c", "d\n+\ne"], ["1", "2", "3"]]);
    expect(parseCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  // Foglio di prova con la stessa struttura del template "BASE Programma" (dati inventati)
  const csv = [
    "Programmazione,,,,,,,,,,,,",
    ',Giorno 1,,,Week 1,Week 2,Week 3,Week 4,,,Rest,Indicazioni,Video',
    ',Stretching quadricipite,,,"1x20""",,,,,,-,,',
    ',Log,https://www.youtube.com/watch?v=vpT4S6IcBRE,,,,,,,,,,',
    'Circuito,Plank,https://youtu.be/OHVQLXodML4,,"3x20-30""",,,,,,,,',
    ',Log,https://www.youtube.com/watch?v=vpT4S6IcBRE,,,,,,,,,,',
    ',Addome con mattonella,,,"3x20-30""",,,,,,"20""",,',
    ',Log,,,,,,,,,,,',
    ',Squat con bilanciere,https://youtu.be/324ZrDHOvyQ,,5x5 80kg,5x6 80kg,5x3 85kg,5x4 85kg,,,"90""",Spinta a terra,video',
    ',Log,https://www.youtube.com/watch?v=vpT4S6IcBRE,,5x5 80kg,5x6 80kg fatica,,,,,,,',
    ',,,,,,,,,,,,',
    ',Giorno 2 Corsa,,,Week 1,Week 2,Week 3,Week 4,Week 5,Week 6,Rest,Indicazioni,Video',
    ',Corsa,,,"4x1000 4:30 + 3x500 4:15",,,,,,"60-90"" da fermo",,',
    ',Log,,,,,,,,,,,',
  ].join("\n");

  it("legge giorni, esercizi, settimane, superserie e log", () => {
    const r = parseProgramSheet(csv, (n) => (n === "Squat con bilanciere" ? "11111111-1111-4111-8111-111111111111" : null));
    expect(r.weeks).toBe(4);
    expect(r.content.days.map((d) => d.title)).toEqual(["Giorno 1", "Giorno 2 Corsa"]);
    const d1 = r.content.days[0];
    expect(d1.blocks.map((b) => b.kind)).toEqual(["single", "superset", "single"]);
    expect(d1.blocks[1].items.map((i) => i.name)).toEqual(["Plank", "Addome con mattonella"]);
    const squat = d1.blocks[2].items[0];
    expect(squat.prescriptions).toEqual(["5x5 80kg", "5x6 80kg", "5x3 85kg", "5x4 85kg"]);
    expect(squat.rest).toBe("90\"");
    expect(squat.notes).toBe("Spinta a terra");
    expect(squat.exerciseId).toBe("11111111-1111-4111-8111-111111111111");
    expect(d1.blocks[0].items[0].rest).toBe("");
    expect(r.logs.filter((l) => l.itemId === squat.id).map((l) => l.text)).toEqual(["5x5 80kg", "5x6 80kg fatica"]);
    expect(r.videos.find((v) => v.itemName === "Plank")?.url).toBe("https://youtu.be/OHVQLXodML4");
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("colonne lette dall'intestazione, circuiti con i giri, settimane vuote ripetute, testo", () => {
    const sheet = [
      "Programmazione",
      ',Giorno 1,,,Week 1,Week 2,Week 3,,Week 4,Rest,Indicazioni,Video',
      ',Posturale (leggi note),https://youtu.be/x,,,,,,,,"- Stretching femorale\n- Addome",',
      ',Log,https://youtu.be/log,,,,,,,,,',
      ',Squat,,,4x5 50kg,4x6 50kg,4x4 55kg,,4x5 55kg,EMOM 2,,',
      'Circuito,Rematore,,,4x8 16kg,,,,,,,',
      ',Alzate laterali,,,4x12/14,,,,,EMOM 2,5,,',
      'Cirucito 4 giri,Vogatore,,,300m,,,,,,,',
      ',Affondi,,,30 passi,,,,,,,',
      ',Burpees,,,10,,,,,"60""",,',
      'Circuito,Ponte femorali,,,4x6/8,,,,,,,',
      ',Deadbug,,,"3x20"" per lato",,,,,,,',
      ',Corsa libera,,,min 20\',,,,,,,',
    ].join("\n");
    const r = parseProgramSheet(sheet);
    expect(r.weeks).toBe(4);
    const b = r.content.days[0].blocks;
    expect(b.map((x) => x.kind)).toEqual(["text", "single", "superset", "circuit", "superset", "single"]);
    expect(b[0].title).toBe("Posturale (leggi note)");
    expect(b[0].notes).toContain("Stretching femorale");
    expect(b[1].items[0].prescriptions).toEqual(["4x5 50kg", "4x6 50kg", "4x4 55kg", "4x5 55kg"]);
    expect(b[2].items.map((i) => i.name)).toEqual(["Rematore", "Alzate laterali"]);
    expect(b[2].items[1].prescriptions).toEqual(["4x12/14", "4x12/14", "4x12/14", "4x12/14"]);
    expect(b[3].rounds).toBe(4);
    expect(b[3].items.map((i) => i.name)).toEqual(["Vogatore", "Affondi", "Burpees"]);
    expect(b[4].items.map((i) => i.name)).toEqual(["Ponte femorali", "Deadbug"]);
    expect(r.logs).toEqual([]);
  });

  it("fogli vecchi: intestazione unica S1…, giorni \"Giorno N\", logbook a destra, settimane con il solo carico", () => {
    const sheet = [
      "Programmazione,,,,,,,,,,,,,Logbook",
      ",,,,S1,S2,S3,S4,S5,S6,Rest,Indicazioni,Video,Week 1,Week 2,Week 3,Week 4,Week 5,Week 6",
      ",Giorno 1,,,,,,,,,,,,,,,,,",
      ",Hip thrust,,,4x6,40kg,40kg,45kg,,,,Salita in 3 secondi,video,4x6 40kg,4x6 42kg,,,,",
      ",Pulley,,,3x12,20kg,,,,,,,,,,,,,",
      ",Giorno 2,,,,,,,,,,,,,,,,,",
      ",Corsa,,,30',,,,,,,,,,,,,,",
    ].join("\n");
    const r = parseProgramSheet(sheet);
    expect(r.content.days.map((d) => d.title)).toEqual(["Giorno 1", "Giorno 2"]);
    const hip = r.content.days[0].blocks[0].items[0];
    expect(hip.prescriptions).toEqual(["4x6", "4x6 40kg", "4x6 40kg", "4x6 45kg"]);
    expect(r.content.days[0].blocks[1].items[0].prescriptions).toEqual(["3x12", "3x12 20kg", "3x12 20kg", "3x12 20kg"]);
    expect(r.logs.filter((l) => l.itemId === hip.id).map((l) => [l.week, l.text])).toEqual([[1, "4x6 40kg"], [2, "4x6 42kg"]]);
  });

  it("eserciziario: colonne Esercizio, Video, Note e doppioni", () => {
    const { rows, duplicates } = parseExerciseCsv(
      "Esercizio,Video,Note\nAbductor machine,https://www.youtube.com/watch?v=_U2eLh9h4VU,Schiena staccata\nRematore con elastico,,\nRematore con elastico,https://youtu.be/abcdefghijk,Nota\n",
    );
    expect(rows).toHaveLength(2);
    expect(duplicates).toEqual(["Rematore con elastico"]);
    expect(rows[1]).toEqual({ name: "Rematore con elastico", video_url: "https://youtu.be/abcdefghijk", description: "Nota" });
  });

  it("riconosce i link YouTube", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=xlRUV_WNJMc&list=PLEAerig9kl1obt0fTE2bOi1Kp3pveZk6i&index=25")).toBe("xlRUV_WNJMc");
    expect(youtubeId("https://youtu.be/m6_6_OzAsY4")).toBe("m6_6_OzAsY4");
    expect(youtubeId("https://www.youtube.com/shorts/kXEKwIzgA_M")).toBe("kXEKwIzgA_M");
    expect(youtubeId("https://vimeo.com/123")).toBeNull();
  });
});

describe("diario", () => {
  it("si compila da venerdì a domenica", () => {
    expect(checkinWeekFor("2026-10-08")).toBeNull();
    expect(checkinWeekFor("2026-10-09")).toBe("2026-10-05");
    expect(checkinWeekFor("2026-10-11")).toBe("2026-10-05");
  });
});

import { logPlan, restLabel, restSeconds } from "./program/logbook";
import { emptyItem } from "./program/types";

describe("logbook", () => {
  const single = emptyBlock(1);
  it("prepara le serie dalla prescrizione", () => {
    expect(logPlan({ ...emptyItem(1), prescriptions: ["4x8 65kg"] }, single, 1)).toEqual({ mode: "sets", rows: 4, repsHint: "8", kgHint: 65, loadText: "65 kg" });
    expect(logPlan({ ...emptyItem(1), prescriptions: ["3x20\""] }, single, 1)).toEqual({ mode: "check", rows: 3, label: "20\"" });
    expect(logPlan({ ...emptyItem(1), prescriptions: ["a sensazione"] }, single, 1)).toEqual({ mode: "text" });
  });
  it("nei circuiti usa i giri del blocco", () => {
    const circuit = { ...emptyBlock(1, "circuit"), rounds: 3 };
    expect(logPlan({ ...emptyItem(1), prescriptions: ["12"] }, circuit, 1)).toMatchObject({ mode: "sets", rows: 3, repsHint: "12" });
    expect(logPlan({ ...emptyItem(1), prescriptions: ["10-12 20kg"] }, circuit, 1)).toMatchObject({ mode: "sets", rows: 3, kgHint: 20 });
    expect(logPlan({ ...emptyItem(1), prescriptions: ["12"] }, emptyBlock(1, "amrap"), 1)).toEqual({ mode: "text" });
    // solo il tempo in un circuito: una spunta per giro (con il suo timer)
    expect(logPlan({ ...emptyItem(1), prescriptions: ["30\""] }, circuit, 1)).toEqual({ mode: "check", rows: 3, label: "30\"" });
    expect(logPlan({ ...emptyItem(1), prescriptions: ["1'"] }, circuit, 1)).toEqual({ mode: "check", rows: 3, label: "1'" });
    expect(logPlan({ ...emptyItem(1), prescriptions: ["30\""] }, single, 1)).toEqual({ mode: "text" });
  });
  it("nei circuiti anche max, per lato, distanze e calorie si spuntano", () => {
    const circuit = { ...emptyBlock(1, "circuit"), rounds: 3 };
    const plan = (rx: string, b: ReturnType<typeof emptyBlock> = circuit) => logPlan({ ...emptyItem(1), prescriptions: [rx] }, b, 1);
    expect(plan("max")).toMatchObject({ mode: "sets", rows: 3, repsHint: "max", kgHint: null });
    expect(plan("Max rip")).toMatchObject({ mode: "sets", rows: 3, repsHint: "max" });
    expect(plan("a esaurimento")).toMatchObject({ mode: "sets", repsHint: "max" });
    expect(plan("max 10kg")).toMatchObject({ mode: "sets", repsHint: "max", kgHint: 10 });
    expect(plan("30\" per lato")).toEqual({ mode: "check", rows: 3, label: "30\"" });
    expect(plan("10 per gamba")).toMatchObject({ mode: "sets", repsHint: "10" });
    expect(plan("250m")).toEqual({ mode: "check", rows: 3, label: "250 m" });
    expect(plan("1 km")).toEqual({ mode: "check", rows: 3, label: "1 km" });
    expect(plan("15 cal")).toEqual({ mode: "check", rows: 3, label: "15 cal" });
    expect(plan("sprint a sensazione")).toEqual({ mode: "text" });
    // fuori dai circuiti "max" da solo resta testo, "3xmax" diventa serie
    expect(plan("max", emptyBlock(1))).toEqual({ mode: "text" });
    expect(plan("3xmax", emptyBlock(1))).toMatchObject({ mode: "sets", rows: 3, repsHint: "max" });
  });
  it("riconosce gli esercizi da fare un lato alla volta", () => {
    expect(isPerSideText("3x30\" per lato")).toBe(true);
    expect(isPerSideText("2x20\" x gamba")).toBe(true);
    expect(isPerSideText("30\" dx e sx")).toBe(true);
    expect(isPerSideText("3x30\"")).toBe(false);
    expect(isPerSideText("da fare a parte")).toBe(false);
    expect(isOneSideExercise("Side plank")).toBe(true);
    expect(isOneSideExercise("Plank laterale")).toBe(true);
    expect(isOneSideExercise("Affondo isometrico")).toBe(true);
    expect(isOneSideExercise("Wall sit monopodalico")).toBe(true);
    expect(isOneSideExercise("Plank")).toBe(false);
    expect(isOneSideExercise("Hollow hold")).toBe(false);
  });
  it("legge i recuperi", () => {
    expect(restSeconds('90"')).toBe(90);
    expect(restSeconds("1'30\"")).toBe(90);
    expect(restSeconds("2'")).toBe(120);
    expect(restSeconds('60-90"')).toBe(60);
    expect(restSeconds("2 min")).toBe(120);
    expect(restSeconds("camminando")).toBeNull();
    expect(restSeconds("EMOM 2")).toBeNull();
    expect(restLabel("EMOM 2")).toBe("EMOM 2' · riparti ogni 2 minuti");
    expect(restLabel("EMOM 1,5")).toBe("EMOM 1,5' · riparti ogni 90 secondi");
    expect(restLabel("emom 2,5")).toBe("EMOM 2,5' · riparti ogni 2 minuti e mezzo");
    expect(restLabel("EMOM 1")).toBe("EMOM 1' · riparti ogni minuto");
    expect(restLabel('90"')).toBe('Recupero 90"');
  });
});

import { deload, fillWeeks, progress } from "./program/progression";
import { compliance } from "./compliance";
import { normalizePhone, waLink, fillTemplate } from "./whatsapp";
import { bestSet, computeRecords, epley, loadFromPercent } from "./strength/records";

describe("progressioni automatiche", () => {
  it("ripetizioni, chili, serie, percentuali", () => {
    expect(progress("4x8 60kg", "reps", 2)).toBe("4x10 60kg");
    // doppia progressione: +1 ripetizione per due settimane, poi +2,5 kg e si riparte
    expect([1, 2, 3, 4].map((st) => progress("4x7 16kg", "double", st))).toEqual(["4x8 16kg", "4x9 16kg", "4x7 18,5kg", "4x8 18,5kg"]);
    expect(progress("4x8/10", "double", 1)).toBe("4x9/11");
    expect(progress("3x8/10", "reps", 1)).toBe("3x9/11");
    expect(progress('3x30"', "reps", 2)).toBe('3x40"');
    expect(progress("4x8 60kg", "kg25", 3)).toBe("4x8 67,5kg");
    expect(progress("5x5 @75%", "pct", 2)).toBe("5x5 @80%");
    expect(progress("4x8 60kg", "sets", 1)).toBe("5x8 60kg");
    expect(progress("4x8", "kg25", 1)).toBeNull();
    expect(progress("a sensazione", "reps", 1)).toBeNull();
  });
  it("compila le settimane e mette lo scarico in fondo", () => {
    expect(fillWeeks(["4x8 60kg", "", "", ""], 0, "reps")).toEqual(["4x8 60kg", "4x9 60kg", "4x10 60kg", "4x11 60kg"]);
    expect(fillWeeks(["4x8 60kg", "", "", ""], 0, "reps", { deloadLast: true })).toEqual(["4x8 60kg", "4x9 60kg", "4x10 60kg", "3x10 55kg"]);
    expect(deload("6x5 100kg")).toBe("4x5 90kg");
  });
});

describe("costanza", () => {
  it("allenamenti fatti su previsti nella finestra", () => {
    const c = compliance({ today: "2026-10-09", windowDays: 14, sessionsPerWeek: 3, programStart: "2026-09-01", programEnd: "2026-10-30", completedDates: ["2026-09-28", "2026-10-01", "2026-10-03", "2026-10-06"], lastLog: "2026-10-06" });
    expect(c.expected).toBe(6);
    expect(c.done).toBe(4);
    expect(c.pct).toBe(67);
    expect(c.daysSinceLast).toBe(3);
  });
  it("programma appena iniziato: nessun giudizio", () => {
    expect(compliance({ today: "2026-10-09", windowDays: 14, sessionsPerWeek: 3, programStart: "2026-10-07", programEnd: "2026-11-03", completedDates: [], lastLog: null }).pct).toBeNull();
  });
});

describe("whatsapp e record", () => {
  it("numeri e link", () => {
    expect(normalizePhone("333 123 4567")).toBe("393331234567");
    expect(normalizePhone("+39 333-1234567")).toBe("393331234567");
    expect(normalizePhone("0041 79 123 45 67")).toBe("41791234567");
    expect(normalizePhone("123")).toBeNull();
    expect(waLink("3331234567", "Ciao Anna")).toBe("https://wa.me/393331234567?text=Ciao%20Anna");
    expect(fillTemplate("Ciao {nome}, {x}", { nome: "Anna" })).toBe("Ciao Anna, {x}");
  });
  it("massimale stimato e record", () => {
    expect(epley(100, 5)).toBe(116.7);
    expect(epley(100, 15)).toBeNull();
    expect(bestSet([{ kg: 60, reps: 10 }, { kg: 70, reps: 5 }])).toEqual({ e1rm: 81.7, kg: 70, reps: 5 });
    const r = computeRecords([
      { exercise_name: "Squat", performed_on: "2026-09-01", sets: [{ kg: 80, reps: 5 }] },
      { exercise_name: "squat", performed_on: "2026-10-01", sets: [{ kg: 85, reps: 5 }] },
    ]);
    expect(r.get("squat")?.kg).toBe(85);
    expect(loadFromPercent(75, 100)).toBe(75);
    expect(loadFromPercent(73, 100)).toBe(72.5);
  });
});

import { emptyProject, isProjectEmpty, projectForAI, projectNowText } from "./project";

describe("progetto annuale", () => {
  it("vuoto finché il trainer non scrive qualcosa; senza la riga massa magra", () => {
    const p = emptyProject("2026-10");
    expect(isProjectEmpty(p)).toBe(true);
    expect(p.rows.map((r) => r.label)).not.toContain("Massa magra");
    expect(isProjectEmpty({ ...p, goal: "Mezza maratona" })).toBe(false);
    expect(isProjectEmpty({ ...p, rows: p.rows.map((r, i) => (i === 0 ? { ...r, values: [1, ...r.values.slice(1)] } : r)) })).toBe(false);
  });

  it("riassume la fase attuale e la prossima, e il testo per l'AI", () => {
    const p = emptyProject("2026-10");
    p.phases = ["volume", "volume", "transition", "intensity", "intensity", "", "", "", "", "", "", ""];
    p.rows[1].values[0] = 3;
    expect(projectNowText(p, "2026-10-10")).toBe("Adesso volumizzazione fino a novembre, poi transizione da dicembre.");
    expect(projectNowText(p, "2026-12-01")).toBe("Adesso transizione questo mese, poi intensificazione da gennaio.");
    expect(projectNowText(p, "2025-01-01")).toBeNull();
    const ai = projectForAI(p, "2026-10-10");
    expect(ai).toContain("ottobre 2026 (adesso): fase Volumizzazione");
    expect(ai).toContain("Forza massima alto");
  });
});

import { buildForecast, renewalRateFrom, weeklyPace } from "./forecast";

describe("previsione incassi", () => {
  const today = "2026-10-10";
  it("abbonamenti alla scadenza, pacchetti al ritmo delle sessioni", () => {
    const f = buildForecast(
      [
        { clientId: "a", name: "A", kind: "monthly", amount: 100, paidUntil: "2026-10-20", packageSessions: null, sessionsLeft: null, recentSessions: [] },
        { clientId: "b", name: "B", kind: "package", amount: 400, paidUntil: null, packageSessions: 10, sessionsLeft: 4, recentSessions: ["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29", "2026-10-06", "2026-08-20", "2026-08-27"] },
      ],
      today,
      3,
      0.8,
    );
    // mensile: 21 ott, 21 nov, 21 dic
    expect(f.months.map((m) => m.recurring)).toEqual([100, 100, 100]);
    // pacchetto: 1 sessione a settimana, 4 rimaste → fra 4 settimane (7 nov), poi ogni 10 settimane
    expect(f.months.map((m) => m.packages)).toEqual([0, 400, 0]);
    expect(f.events.find((e) => e.kind === "package")?.date).toBe("2026-11-07");
    expect(f.total).toBe(700);
    expect(f.prudent).toBeLessThan(f.total);
    expect(weeklyPace([], today)).toBeNull();
  });
  it("calcola la quota di rinnovi dallo storico", () => {
    const pays = [
      { client_id: "a", paid_on: "2026-01-01", period_end: "2026-01-31" },
      { client_id: "a", paid_on: "2026-02-01", period_end: "2026-02-28" },
      { client_id: "b", paid_on: "2026-03-01", period_end: "2026-03-31" },
      { client_id: "c", paid_on: "2026-04-01", period_end: "2026-04-30" },
    ];
    const r = renewalRateFrom(pays, today);
    expect(r.measured).toBe(true);
    // solo il primo periodo di "a" è stato rinnovato (1 su 4): la quota non scende sotto 0,3
    expect(r.rate).toBe(0.3);
  });
});

describe("bozze di risposta", () => {
  it("riconosce domande e richieste", () => {
    expect(looksLikeQuestion("Posso fare gli swing con il 16?")).toBe(true);
    expect(looksLikeQuestion("domani posso spostare a sabato")).toBe(true);
    expect(looksLikeQuestion("mi fa male il ginocchio negli affondi")).toBe(true);
    expect(looksLikeQuestion("ok grazie")).toBe(false);
    expect(looksLikeQuestion("Fatto anche oggi")).toBe(false);
  });
  it("prende solo i messaggi del cliente dopo l'ultima risposta dello staff", () => {
    const m = (id: string, fromClient: boolean, at: string) => ({ id, fromClient, body: id, attachments: 0, createdAt: at });
    const list = [m("a", true, "1"), m("b", false, "2"), m("c", true, "3"), m("d", true, "4")];
    expect(pendingClientMessages(list).map((x) => x.id)).toEqual(["c", "d"]);
    expect(pendingClientMessages([...list, m("e", false, "5")])).toEqual([]);
  });
  it("toglie nome, email e telefono e poi rimette il nome", () => {
    const t = pseudonymize("Ciao Giulia Esempio, scrivi a giulia@prova.local o al 333 1234567. GIULIA brava!", ["Giulia", "Esempio"]);
    expect(t).toBe("Ciao {nome}, scrivi a [email] o al [telefono]. {nome} brava!");
    expect(pseudonymize("Squat 4x8 60kg, 60 65 70 75 kg", ["Giulia"])).toBe("Squat 4x8 60kg, 60 65 70 75 kg");
    expect(fillName("Ciao {nome}! Brava", "Giulia")).toBe("Ciao Giulia! Brava");
  });
  it("misura quanto la risposta somiglia alla bozza", () => {
    expect(similarity("Ciao, sì va benissimo il kettlebell da 16", "Ciao, sì va benissimo il kettlebell da 16!")).toBe(1);
    expect(similarity("Ciao, sì va benissimo il kettlebell", "Domani ne parliamo in sessione")).toBeLessThan(0.3);
  });
});

describe("stile delle risposte su due livelli", () => {
  const ex = (clientId: string, text: string, at: string, extra: Partial<StyleExample> = {}): StyleExample => ({ id: `${clientId}${at}`, clientId, kind: "message", text, at, ...extra });
  it("separa le abitudini con tutti dal tono con questo cliente", () => {
    const out = styleSections(
      [
        ex("giulia", "Ciao Giuly! Grande, avanti così", "3"),
        ex("marta", "Buongiorno {nome}, ci vediamo giovedì.", "2"),
        ex("paolo", "Ciao {nome}! Avanti così", "1"),
      ],
      "giulia",
    );
    const [general, mine] = out.split("### Solo con questo cliente");
    expect(general).toContain("Cliente A:");
    expect(general).toContain("Cliente B:");
    expect(general).not.toContain("Giuly");
    expect(mine).toContain("Ciao Giuly!");
    expect(mine).not.toContain("Buongiorno");
  });
  it("senza esempi per il cliente chiede un tono cordiale senza confidenze", () => {
    const out = styleSections([ex("marta", "Ciao {nome}, a giovedì", "1")], "nuovo");
    expect(out).toContain("senza confidenze o soprannomi");
  });
  it("prende pochi esempi per cliente e mette le correzioni al posto del messaggio inviato", () => {
    const many = Array.from({ length: 9 }, (_, i) => ex("marta", `Messaggio numero ${i}`, String(i)));
    const corr = ex("giulia", "Ciao Giuly, sì va bene", "9", { kind: "correction", draft: "Ciao {nome}, va bene", status: "used" });
    const sent = ex("giulia", "Ciao Giuly, sì va bene", "8");
    const out = styleSections([...many, corr, sent], "giulia", { perClient: 3 });
    expect(out.match(/Messaggio numero/g)).toHaveLength(3);
    expect(out).toContain("L'hai corretta così");
    expect(out.match(/Ciao Giuly, sì va bene/g)).toHaveLength(1);
  });
});

describe("notifiche push", () => {
  it("accetta solo iscrizioni valide e link interni", async () => {
    const { parseSubscription, pushPayload } = await import("./push-shared");
    const good = { endpoint: "https://fcm.googleapis.com/fcm/send/abc123def456", keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } };
    expect(parseSubscription(good)).toEqual({ endpoint: good.endpoint, p256dh: good.keys.p256dh, auth: good.keys.auth });
    expect(parseSubscription({ ...good, endpoint: "http://insicuro.example/x" })).toBeNull();
    expect(parseSubscription({ endpoint: good.endpoint, keys: { p256dh: "<script>", auth: "x" } })).toBeNull();
    expect(parseSubscription(null)).toBeNull();
    expect(pushPayload({ title: "Ciao", url: "https://altro.sito" }).url).toBe("/");
    expect(pushPayload({ title: "Ciao", url: "//altro.sito" }).url).toBe("/");
    expect(pushPayload({ title: "Ciao", url: "/cliente/messaggi" }).url).toBe("/cliente/messaggi");
    expect(pushPayload({ title: "x".repeat(200) }).title.length).toBe(80);
  });
  it("nome sotto l'icona della Home", async () => {
    const { homeScreenName } = await import("./app-name");
    expect(homeScreenName(null)).toBe("Otherise");
    expect(homeScreenName("Diego Coaching")).toBe("Diego Coaching");
    expect(homeScreenName("Marco Bianchi Personal Training")).toBe("Marco");
  });
});

describe("bilanciamento del programma", async () => {
  const { patternOf, isFundamental, restSeconds, programBalance, estimateDayMinutes } = await import("./program/balance");
  it("riconosce i movimenti dai nomi", () => {
    expect(patternOf("Squat bulgaro - Manubri")).toBe("accosciata");
    expect(patternOf("Stacco rumeno con bilanciere")).toBe("hinge");
    expect(patternOf("Leg curl seduto")).toBe("hinge");
    expect(patternOf("Hip thrust - Macchina")).toBe("hinge");
    expect(patternOf("Lat Machine, Presa Prona")).toBe("tirata_verticale");
    expect(patternOf("Rematore singolo")).toBe("tirata_orizzontale");
    expect(patternOf("Panca piana")).toBe("spinta_orizzontale");
    expect(patternOf("Military press")).toBe("spinta_verticale");
    expect(patternOf("Alzate laterali")).toBe("spalle");
    expect(patternOf("Curl manubri")).toBe("braccia");
    expect(patternOf("Dead bug incrociato")).toBe("core");
    expect(patternOf("Wall ball")).toBe("condizionamento");
    expect(patternOf("Vogatore")).toBe("condizionamento");
    expect(patternOf("Stretching")).toBe("altro");
  });
  it("fondamentali e recuperi", () => {
    expect(isFundamental("Squat")).toBe(true);
    expect(isFundamental("Panca piana")).toBe(true);
    expect(isFundamental("Goblet squat")).toBe(false);
    expect(isFundamental("Hip thrust")).toBe(false);
    expect(isFundamental("Hip thrust con bilanciere")).toBe(true);
    expect(restSeconds("90\"")).toBe(90);
    expect(restSeconds("60-90\"")).toBe(75);
    expect(restSeconds("2'")).toBe(120);
    expect(restSeconds("1'30\"")).toBe(90);
    expect(restSeconds("EMOM 1,5")).toBe(90);
    expect(restSeconds("libero")).toBeNull();
  });
  it("serie, rapporto accosciata/hinge e tempo stimato", () => {
    const item = (name: string, p: string, rest = "") => ({ id: name, exerciseId: null, name, rest, notes: "", prescriptions: [p] });
    const single = (it: ReturnType<typeof item>) => ({ id: it.id + "b", kind: "single" as const, title: "", notes: "", rounds: null, durationMin: null, everySec: null, workSec: null, restSec: null, items: [it] });
    const day = { id: "d1", title: "Giorno 1", notes: "", blocks: [
      single(item("Dead bug", "3x10")),
      single(item("Squat", "4x5 80kg", "2'")),
      single(item("Stacco rumeno - Manubri", "4x8/10", "75\"")),
      single(item("Lat machine", "4x8/10", "75\"")),
      single(item("Panca piana con manubri", "3x10", "60\"")),
    ] };
    const b = programBalance({ days: [day] });
    expect(b.sets.accosciata).toBe(4);
    expect(b.sets.hinge).toBe(4);
    expect(b.squatShare).toBe(50);
    expect(b.pullPerPush).toBe(1.3);
    expect(b.fundamentals).toEqual(["Squat"]);
    const min = estimateDayMinutes(day);
    expect(min).toBeGreaterThan(45);
    expect(min).toBeLessThan(75);
  });
});

describe("indicazioni per l'AI", async () => {
  const { autoUpdate, minutesFromAnswer, parseProfileForm, profileText, EMPTY_PROFILE } = await import("./ai-profile");
  const { programBalance } = await import("./program/balance");
  const it_ = (name: string, p: string) => ({ id: name, exerciseId: null, name, rest: "", notes: "", prescriptions: [p] });
  const blk = (name: string, p: string) => ({ id: name + "b", kind: "single" as const, title: "", notes: "", rounds: null, durationMin: null, everySec: null, workSec: null, restSec: null, items: [it_(name, p)] });
  const content = { days: [{ id: "d", title: "Giorno 1", notes: "", blocks: [blk("Squat", "4x5"), blk("Hip thrust - Macchina", "2x10"), blk("Military press", "3x8")] }] };
  it("tempo dalle risposte", () => {
    expect(minutesFromAnswer("60 minuti")).toBe(60);
    expect(minutesFromAnswer("un'ora e mezza")).toBe(90);
    expect(minutesFromAnswer("un'ora")).toBe(60);
    expect(minutesFromAnswer("boh")).toBeNull();
  });
  it("si riallinea al programma pubblicato, senza dogmi", () => {
    const b = programBalance(content);
    expect(b.squatShare).toBe(67);
    const p = { ...EMPTY_PROFILE, squat_share: 30, vertical_push: "no", session_minutes: 60 };
    const patch = autoUpdate(p, b, 75, "Fase 2")!;
    expect(patch.squat_share).toBe(70);
    expect(patch.vertical_push).toBe("poche");
    expect(patch.session_minutes).toBe(75);
    expect(patch.auto_note).toContain("Fase 2");
    // indicazioni coerenti: niente da cambiare
    expect(autoUpdate({ ...EMPTY_PROFILE, squat_share: 60, vertical_push: "si" }, b, null, "x")).toBeNull();
    // "segui il programma" (null) non viene mai riempito da solo
    expect(autoUpdate({ ...EMPTY_PROFILE }, b, null, "x")).toBeNull();
  });
  it("modulo e testo per l'AI", () => {
    const fd = new FormData();
    fd.set("session_minutes", "75");
    fd.set("strength_level", "avanzato");
    fd.set("running_level", "hackerato");
    fd.set("vertical_push", "no");
    fd.set("squat_share", "34");
    fd.set("intensity_techniques", "si");
    const v = parseProfileForm(fd);
    expect(v).toMatchObject({ session_minutes: 75, strength_level: "avanzato", running_level: null, vertical_push: "no", squat_share: 30, intensity_techniques: true });
    fd.set("squat_auto", "on");
    expect(parseProfileForm(fd).squat_share).toBeNull();
    const txt = profileText({ ...EMPTY_PROFILE, ...v });
    expect(txt).toContain("75 minuti");
    expect(txt).toContain("non regole fisse");
    expect(profileText(EMPTY_PROFILE)).toBe("");
  });
});

describe("progetto letto sui mesi del programma", () => {
  it("segnala il cambio di fase e gli stimoli che cambiano", () => {
    const p = emptyProject("2026-10");
    p.phases = ["volume", "volume", "intensity", "intensity", "", "", "", "", "", "", "", ""];
    p.rows[1].values = [1, 1, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0];
    const ai = projectForAI(p, "2026-12-01", "2026-12-28");
    expect(ai).toContain("novembre 2026 (mese prima): fase Volumizzazione");
    expect(ai).toContain("dicembre 2026 (periodo del programma): fase Intensificazione");
    expect(ai).toContain("CAMBIO DI FASE: da volumizzazione a intensificazione");
    expect(ai).toContain("Stimoli che cambiano rispetto al mese prima");
  });
});

describe("assistente AI: formati compatti e correzioni", async () => {
  const { compactProgram, exerciseCodes } = await import("./ai/prompt-format");
  const { diffPrograms, diffText } = await import("./program/diff");
  const item = (id: string, name: string, p: string[], exerciseId: string | null = null) => ({ id, exerciseId, name, rest: "", notes: "", prescriptions: p });
  const block = (id: string, items: ReturnType<typeof item>[]) => ({ id, kind: "single" as const, title: "", notes: "", rounds: null, durationMin: null, everySec: null, workSec: null, restSec: null, items });
  const uuid = "11111111-2222-4333-8444-555555555555";
  it("codici corti al posto degli id e niente campi vuoti", () => {
    const { codeById, idByCode } = exerciseCodes([{ id: uuid, name: "Squat" }]);
    expect(codeById.get(uuid)).toBe("E1");
    expect(idByCode.get("E1")).toBe(uuid);
    const json = compactProgram({ title: "Fase", description: "", weeks: 2, content: { days: [{ id: "d1", title: "G1", notes: "", blocks: [block("b1", [item("i1", "Squat", ["4x5", "4x6"], uuid)])] }] } }, codeById);
    expect(json).toContain('"exerciseId":"E1"');
    expect(json).not.toContain(uuid);
    expect(json).not.toContain("null");
    expect(json).not.toContain('"notes"');
  });
  it("trova cosa ha corretto il trainer", () => {
    const ai = { days: [{ id: "d1", title: "Giorno 1", notes: "", blocks: [block("b1", [item("a", "Squat", ["4x5 60kg", "4x6 60kg"]), item("b", "Curl", ["3x8/10", "3x8/10"]), item("c", "Plank", ["3x30\"", "3x30\""])])] }] };
    const fin = { days: [{ id: "d1", title: "Giorno 1", notes: "", blocks: [block("b1", [item("a", "Squat", ["4x5 60kg", "4x6 60kg"]), item("b", "Curl", ["3x10/14", "3x10/14"]), item("n", "Dead bug", ["3x10", "3x10"])])] }] };
    const d = diffPrograms(ai, fin);
    expect(d.changed).toBe(3);
    const t = diffText(d);
    expect(t).toContain("Curl: prescrizioni 3x8/10 | 3x8/10 → 3x10/14 | 3x10/14");
    expect(t).toContain('aggiunto "Dead bug"');
    expect(t).toContain('tolto "Plank"');
    expect(diffText(diffPrograms(ai, ai))).toContain("Nessuna correzione");
  });
});

describe("bozze di risposta: programma vs fatto", () => {
  it("chi decide carico e ripetizioni", () => {
    expect(prescriptionRule("4x8 52,5kg")).toContain("non suggerire cambi");
    expect(prescriptionRule("5x5 @75%")).toContain("non suggerire cambi");
    expect(prescriptionRule("3x10/12")).toContain("puoi suggerire come progredire");
    expect(prescriptionRule("3x10/12 20kg")).toContain("dentro il range");
    expect(prescriptionRule("3x30\"")).toBe("tempo deciso dal programma");
  });
  it("trova la serie con una ripetizione in meno", () => {
    const sets = [8, 8, 8, 7].map((reps) => ({ kg: 52.5, reps, done: true }));
    expect(setDifferences("4x8 52,5kg", sets)).toEqual(["serie 4: 7 ripetizioni invece di 8"]);
    expect(setDifferences("4x8 52,5kg", sets.slice(0, 3))).toContain("fatte 3 serie su 4");
    expect(setDifferences("4x8 52,5kg", [{ kg: 50, reps: 8, done: true }, ...sets.slice(1, 3), { kg: 52.5, reps: 8, done: true }])).toEqual(["serie 1: 50 kg invece di 52,5"]);
    expect(setDifferences("3x10/12", [{ kg: 20, reps: 12 }, { kg: 20, reps: 11 }, { kg: 20, reps: 9 }])).toEqual(["serie 3: 9 ripetizioni invece di almeno 10"]);
    // serie con solo il carico proposto e non spuntata: non conta come fatta
    expect(setDifferences("2x8 40kg", [{ kg: 40, reps: 8, done: true }, { kg: 40, reps: null }])).toEqual(["fatte 1 serie su 2"]);
  });
  it("un allenamento in testo: prescrizione, fatto, differenze", () => {
    const day = parseContent({
      days: [{ id: "d1", title: "Giorno 1", notes: "", blocks: [
        { id: "b1", kind: "single", title: "", notes: "", rounds: null, items: [{ id: "i1", name: "Pin squat", prescriptions: ["4x8 52,5kg"], rest: "2'", notes: "", exerciseId: null }] },
        { id: "b2", kind: "single", title: "", notes: "", rounds: null, items: [{ id: "i2", name: "Pulley", prescriptions: ["3x10/12"], rest: "", notes: "Il braccio non tira", exerciseId: null }] },
      ] }],
    }).days[0];
    const txt = workoutVsPlan(day, 1, [
      { item_id: "i1", sets: [8, 8, 8, 7].map((reps) => ({ kg: 52.5, reps, done: true })), result_text: "pesante" },
      { item_id: "i2", sets: [12, 12, 12].map((reps) => ({ kg: 30, reps, done: true })), result_text: "" },
    ]);
    expect(txt).toContain("Pin squat — programma: 4x8 52,5kg (carico e ripetizioni decisi dal programma: non suggerire cambi)");
    expect(txt).toContain("8×52,5, 8×52,5, 8×52,5, 7×52,5 kg");
    expect(txt).toContain("DIFFERENZE: serie 4: 7 ripetizioni invece di 8");
    expect(txt).toContain('nota "pesante"');
    expect(txt).toMatch(/Pulley — .* — come da programma/);
  });
  it("impara solo dalle bozze cambiate davvero, e lo stile si divide in due parti", () => {
    expect(worthLearning("Ciao {nome}, grande!", "Ciao {nome}, grande!")).toBe(false);
    expect(worthLearning("Ottimo per il pulley, il braccio non deve tirare", "Grandissima! Che bello sentirlo")).toBe(true);
    const parts = styleParts([{ id: "1", clientId: "a", kind: "message", text: "Ciao bella, a giovedì", at: "1" }], "a");
    expect(parts.client).toContain("Ciao bella");
    expect(parts.general).not.toContain("Ciao bella");
  });
});

describe("timer dell'allenamento", async () => {
  const { adjustPlan, blockTimer, emomItemTimer, emomSeconds, fmtClock, restTimerFor, timedSetTimer, timerAt, totalSeconds, LEAD_SECONDS } = await import("./program/timer");
  const block = (over: Partial<Parameters<typeof blockTimer>[0]>) => ({ ...emptyBlock(1, over.kind ?? "single"), ...over }) as Parameters<typeof blockTimer>[0];

  it("AMRAP di 24 minuti: 3 secondi per partire e poi 24 minuti", () => {
    const p = blockTimer(block({ kind: "amrap", durationMin: 24 }))!;
    expect(totalSeconds(p)).toBe(LEAD_SECONDS + 24 * 60);
    expect(timerAt(p, 1).phase.kind).toBe("lead");
    const s = timerAt(p, LEAD_SECONDS + 60);
    expect(s.phase.kind).toBe("work");
    expect(fmtClock(s.remaining)).toBe("23:00");
    expect(timerAt(p, LEAD_SECONDS + 24 * 60).done).toBe(true);
  });

  it("EMOM ogni 2 minuti per 12 minuti: 6 giri", () => {
    const p = blockTimer(block({ kind: "emom", durationMin: 12, everySec: 120 }))!;
    expect(p.title).toBe("E2MOM 12 min");
    expect(p.phases.filter((x) => x.kind === "work")).toHaveLength(6);
    const s = timerAt(p, LEAD_SECONDS + 2 * 120 + 30);
    expect(s.phase.label).toBe("Giro 3/6");
    expect(fmtClock(s.remaining)).toBe("1:30");
  });

  it("intervalli: lavoro e recupero alternati, niente recupero dopo l'ultimo giro", () => {
    const p = blockTimer(block({ kind: "interval", rounds: 8, workSec: 30, restSec: 15 }))!;
    expect(totalSeconds(p)).toBe(LEAD_SECONDS + 8 * 30 + 7 * 15);
    expect(timerAt(p, LEAD_SECONDS + 35).phase.label).toBe("Recupero 1/8");
    expect(timerAt(p, LEAD_SECONDS + 45).phase.label).toBe("Lavoro 2/8");
    expect(p.phases.at(-1)!.kind).toBe("work");
  });

  it("senza tempi il blocco non ha timer", () => {
    expect(blockTimer(block({ kind: "amrap", durationMin: null }))).toBeNull();
    expect(blockTimer(block({ kind: "interval", workSec: null }))).toBeNull();
    expect(blockTimer(block({ kind: "circuit", rounds: 3 }))).toBeNull();
  });

  it("recupero 'EMOM 2,5' dell'esercizio: una serie ogni 2 minuti e mezzo", () => {
    expect(emomSeconds("EMOM 2,5")).toBe(150);
    expect(emomSeconds("emom 2'")).toBe(120);
    expect(emomSeconds("90\"")).toBeNull();
    const p = emomItemTimer("EMOM 2,5", 4)!;
    expect(p.phases.filter((x) => x.kind === "work")).toHaveLength(4);
    expect(timerAt(p, LEAD_SECONDS + 151).phase.label).toBe("Serie 2/4");
    // il recupero normale non parte per le serie EMOM
    expect(restTimerFor("EMOM 2,5")).toBeNull();
    expect(restTimerFor("1'30\"")!.phases[0].seconds).toBe(90);
  });

  it("serie a tempo e ±15 secondi sul recupero", () => {
    const t = timedSetTimer(30, 2, 3, "Plank");
    expect(t.title).toBe("Plank · serie 2/3");
    expect(timedSetTimer(30, 1, 1).title).toBe("Serie");
    expect(totalSeconds(t)).toBe(LEAD_SECONDS + 30);
    const r = restTimerFor("60\"")!;
    expect(adjustPlan(r, 10, 15).phases[0].seconds).toBe(75);
    // togliere più di quanto resta lascia almeno un secondo
    expect(adjustPlan(r, 55, -15).phases[0].seconds).toBe(56);
    expect(fmtClock(65)).toBe("1:05");
    expect(fmtClock(0.2)).toBe("0:01");
  });

  it("serie a tempo per lato: primo lato, 5 secondi per cambiare, secondo lato", () => {
    const t = timedSetTimer(30, 1, 3, "Side plank", true);
    expect(t.phases.map((p) => [p.kind, p.seconds])).toEqual([["lead", LEAD_SECONDS], ["work", 30], ["lead", 5], ["work", 30]]);
    expect(t.phases[1].label).toBe("Primo lato · Side plank · serie 1/3");
    expect(t.phases[2].label).toBe("Cambia lato");
    expect(totalSeconds(t)).toBe(LEAD_SECONDS + 65);
  });
});

describe("video della chat", async () => {
  const { targetSize, shouldCompress } = await import("../components/chat/compress-video");
  const { mediaExpired, CHAT_MEDIA_KEEP_DAYS } = await import("./chat-shared");
  it("riduce a 480p sul lato corto (multipli di 16), senza mai ingrandire, con numeri pari", () => {
    expect(targetSize(1080, 1920)).toEqual({ width: 480, height: 848 });
    expect(targetSize(3840, 2160)).toEqual({ width: 848, height: 480 });
    expect(targetSize(640, 360)).toEqual({ width: 640, height: 360 });
    expect(targetSize(1081, 1921).width % 2).toBe(0);
  });
  it("comprime i video grandi o non mp4", () => {
    expect(shouldCompress(new File([new Uint8Array(10)], "a.mov", { type: "video/quicktime" }))).toBe(true);
    expect(shouldCompress(new File([new Uint8Array(10)], "a.mp4", { type: "video/mp4" }))).toBe(false);
  });
  it("video e vocali si cancellano dopo 2 mesi, le foto restano", () => {
    const now = Date.parse("2026-10-12T12:00:00Z");
    expect(mediaExpired("video", "2026-08-01T10:00:00Z", now)).toBe(true);
    expect(mediaExpired("audio", "2026-08-01T10:00:00Z", now)).toBe(true);
    expect(mediaExpired("video", "2026-09-01T10:00:00Z", now)).toBe(false);
    expect(mediaExpired("image", "2025-01-01T10:00:00Z", now)).toBe(false);
    expect(CHAT_MEDIA_KEEP_DAYS).toBeGreaterThanOrEqual(59);
  });
});

describe("email di avviso", async () => {
  const { bundleEmail } = await import("./email-bundle");
  it("una novità: titolo e link; più novità: un'unica email con l'elenco", () => {
    const one = bundleEmail([{ title: "Nuovo messaggio da Marco", body: "Ciao!", link: "/cliente/messaggi" }], "https://app.esempio.it");
    expect(one.subject).toBe("Nuovo messaggio da Marco");
    expect(one.text).toContain("https://app.esempio.it/cliente/messaggi");
    const many = bundleEmail(Array.from({ length: 14 }, (_, i) => ({ title: `Avviso ${i + 1}`, body: "", link: null })), "https://app.esempio.it");
    expect(many.subject).toBe("Hai 14 novità nell'app");
    expect(many.text).toContain("…e altre 2.");
    expect(many.text).toContain("attiva le notifiche");
    const remind = bundleEmail([{ title: "Nuovo messaggio da Marco", body: "Ciao!", link: "/cliente/messaggi" }], "https://app.esempio.it", "reminder");
    expect(remind.text).toContain("non l'hai ancora visto");
    expect(remind.text).not.toContain("attiva le notifiche");
  });
});

describe("avviso gentile al cliente", () => {
  const fmt = (d: string) => d;
  const sp = (t: string | null) => t?.replace(/\u00a0/g, " ");
  const base = { plan_id: "p", amount: 300, sessions_bought: 0, sessions_used: 0 };
  const input = (paidUntil: string, today: string, extra: Partial<Parameters<typeof clientNotices>[0]> = {}) => ({
    status: clientFacingStatus(billingStatus({ ...base, kind: "six_weeks", paid_until: paidUntil }, today, 7)),
    kind: "six_weeks" as const,
    planAmount: 300,
    credit: 0,
    pt: null,
    ptPrice: null,
    coach: "Davide",
    formatDate: fmt,
    ...extra,
  });
  it("in regola: nessun avviso", () => {
    expect(clientNotices(input("2026-12-01", "2026-10-09"))).toEqual([]);
  });
  it("nuovo periodo iniziato: da saldare, con calma e mai 'devi pagare'", () => {
    const [n] = clientNotices(input("2026-10-05", "2026-10-09"));
    expect(n.title).toBe("Il tuo nuovo periodo è iniziato");
    expect(n.text).toContain("nessuna fretta");
    expect(sp(n.amount)).toBe("Per questo periodo: 300 €");
    expect(JSON.stringify(n).toLowerCase()).not.toMatch(/devi pagare|scadut/);
  });
  it("con 200 € di credito il rinnovo è di 100 €", () => {
    const [n] = clientNotices(input("2026-10-12", "2026-10-09", { credit: 200 }));
    expect(n.title).toBe("Sta per iniziare il tuo nuovo periodo");
    expect(sp(n.amount)).toBe("Per il prossimo periodo: 100 € (200 € li hai già messi da parte)");
  });
  it("credito che copre tutto: già a posto", () => {
    expect(clientNotices(input("2026-10-12", "2026-10-09", { credit: 300 }))[0].kind).toBe("covered");
  });
  it("un periodo intero non pagato: scaduto, detto con gentilezza", () => {
    const [n] = clientNotices(input("2026-08-01", "2026-10-09"));
    expect(n.title).toContain("scaduto");
    expect(sp(n.amount)).toBe("In tutto: 600 € (2 periodi)");
  });
  it("sessioni PT scoperte (fuori dal pacchetto), con il prezzo", () => {
    const notices = clientNotices({ ...input("2026-12-01", "2026-10-09"), pt: { bought: 4, used: 6 }, ptPrice: 40 });
    expect(notices).toHaveLength(1);
    expect(notices[0].title).toBe("Ci sono 2 sessioni PT da sistemare");
    expect(sp(notices[0].amount)).toBe("In tutto: 80 €");
    // troppe scoperte: lo gestisce il trainer di persona
    expect(clientNotices({ ...input("2026-12-01", "2026-10-09"), pt: { bought: 0, used: 9 } })).toEqual([]);
    expect(ptLeft({ bought: 10, used: 7 }, "monthly")).toBe(3);
  });
  it("pacchetto finito", () => {
    const st = clientFacingStatus(billingStatus({ ...base, kind: "package", sessions_bought: 10, sessions_used: 10, paid_until: null }, "2026-10-09"));
    const [n] = clientNotices({ ...input("2026-12-01", "2026-10-09"), status: st, kind: "package" });
    expect(n.title).toBe("Il tuo pacchetto è arrivato in fondo");
  });
});

describe("note finali del cliente: cosa arriva al trainer", () => {
  it("le frasi di circostanza si scartano senza chiamare l'AI", () => {
    for (const n of ["che fatica", "alla grande!", "tutto ok", "distrutto 💀", ""]) expect(triageWithoutAi(n)).toEqual({ read: false, reason: "" });
  });
  it("con un segnale (dolore, domanda, carichi) decide l'AI; senza AI passa", () => {
    expect(triageWithoutAi("male al ginocchio")).toBeNull();
    expect(triageWithoutAi("Lo squat oggi era troppo pesante, posso scendere?")).toBeNull();
    expect(triageFallback("fastidio alla spalla sulle trazioni").read).toBe(true);
    expect(triageFallback("Bellissimo allenamento oggi, mi sono divertita tantissimo con tutti").read).toBe(false);
  });
});

describe("conferma del backup notturno", () => {
  const MB = 1024 * 1024;
  const now = new Date("2026-10-14T06:00:00Z");
  const run = (o: Partial<Parameters<typeof backupNotice>[0] & object> = {}) => ({ finished_at: "2026-10-14T02:20:00Z", ok: true, tables: 48, db_bytes: 45 * MB, files_bytes: 320 * MB, message: "", ...o });

  it("riuscito: solo nell'app, con lo spazio usato rispetto al piano gratuito", () => {
    const n = backupNotice(run(), now)!;
    expect(n.title).toBe("Backup di stanotte riuscito");
    expect(n.urgent).toBe(false);
    expect(n.body).toContain("Tutto copiato e verificato (48 tabelle)");
    expect(n.body).toContain("database 45 MB su 500 MB");
    expect(n.body).toContain("foto e video 320 MB su 1 GB");
    expect(n.key).toBe("backup:ok:2026-10-14");
  });
  it("spazio oltre l'80%: avviso anche sul telefono", () => {
    const n = backupNotice(run({ files_bytes: 900 * MB }), now)!;
    expect(n.urgent).toBe(true);
    expect(n.body).toContain("lo spazio per foto e video è oltre l'80%");
    expect(spaceSummary({ db_bytes: 450 * MB, files_bytes: 900 * MB }).warning).toContain("il database e lo spazio per foto e video sono");
  });
  it("non riuscito o mancante: anche sul telefono; mai configurato: niente", () => {
    expect(backupNotice(run({ ok: false, message: "Si è fermato." }), now)).toMatchObject({ title: "Il backup di stanotte non è riuscito", urgent: true });
    expect(backupNotice(run({ finished_at: "2026-10-12T02:20:00Z" }), now)).toMatchObject({ title: "Il backup di stanotte non risulta", urgent: true, key: "backup:missing:2026-10-14" });
    expect(backupNotice(null, now)).toBeNull();
  });
  it("misure leggibili", () => {
    expect(formatBytes(1024 * MB)).toBe("1 GB");
    expect(formatBytes(1.5 * 1024 * MB)).toBe("1,5 GB");
    expect(formatBytes(3.24 * MB)).toBe("3,2 MB");
  });
});

describe("avvisi dei pagamenti: pochi e una volta sola", () => {
  const row = (paid_until: string, kind: PlanKind = "quarterly") => ({ plan_id: "p", kind, amount: 480, paid_until, sessions_bought: 0, sessions_used: 0 });
  const ev = (paid_until: string, today: string, kind: PlanKind = "quarterly") => paymentEvent(billingStatus(row(paid_until, kind), today, 7), today, 7);

  it("7 giorni prima della scadenza (con 2 giorni di tolleranza), poi più niente", () => {
    expect(ev("2026-10-21", "2026-10-14")).toMatchObject({ type: "soon", key: "soon:2026-10-21", daysLeft: 7 });
    expect(ev("2026-10-21", "2026-10-16")?.type).toBe("soon");
    expect(ev("2026-10-21", "2026-10-17")).toBeNull();
    expect(ev("2026-10-21", "2026-10-13")).toBeNull();
  });

  it("il giorno del rinnovo: solo il cliente", () => {
    const e = ev("2026-10-13", "2026-10-14")!;
    expect(e).toMatchObject({ type: "renewal", start: "2026-10-14", daysAgo: 0 });
    expect(staffPaymentText(e, "Giulia Esempio")).toBeNull();
    expect(clientPaymentText(e, "quarterly")!.title).toBe("Oggi inizia il tuo nuovo trimestre");
    expect(clientPaymentText(ev("2026-10-12", "2026-10-14")!, "quarterly")!.title).toBe("È iniziato il tuo nuovo trimestre");
    // dieci giorni dopo: niente (lo vedi in Oggi e in Pagamenti)
    expect(ev("2026-10-04", "2026-10-14")).toBeNull();
  });

  it("un periodo intero scoperto: una volta, quando succede", () => {
    // trimestre 9 ott – 8 gen non pagato: il 9 gennaio è scaduto
    const e = ev("2026-10-08", "2027-01-09")!;
    expect(e).toMatchObject({ type: "uncovered", since: "2027-01-09", key: "uncovered:2027-01-09" });
    expect(ev("2026-10-08", "2027-01-11")!.key).toBe("uncovered:2027-01-09");
    expect(ev("2026-10-08", "2027-01-12")).toBeNull();
    expect(staffPaymentText(e, "Giulia Esempio")!.title).toBe("Pagamento scaduto: Giulia Esempio");
    expect(clientPaymentText(e, "quarterly")!.body).toMatch(/Nessun problema/);
  });

  it("pacchetto di lezioni: solo quando resta 1 sessione, e mai al cliente", () => {
    const pkg = (used: number) => billingStatus({ plan_id: "p", kind: "package", amount: 400, paid_until: null, sessions_bought: 10, sessions_used: used }, "2026-10-14");
    expect(paymentEvent(pkg(8), "2026-10-14", 7, 10)).toBeNull();
    const last = paymentEvent(pkg(9), "2026-10-14", 7, 10)!;
    expect(last).toMatchObject({ type: "last_session", key: "last:s10" });
    expect(paymentEvent(pkg(10), "2026-10-14", 7, 10)).toBeNull();
    expect(staffPaymentText(last, "Luca Prova")!.body).toBe("Gli resta 1 sola sessione nel pacchetto.");
    expect(clientPaymentText(last, "package")).toBeNull();
  });

  it("testi al cliente: morbidi e con la data del rinnovo", () => {
    const t = clientPaymentText(ev("2026-10-21", "2026-10-14")!, "quarterly")!;
    expect(t.title).toBe("Il tuo nuovo trimestre inizia il 22 ottobre");
    expect(t.body).toMatch(/arriva fino al 21 ottobre/);
    expect(`${t.title} ${t.body}`).not.toMatch(/devi|pagare/i);
  });
});

describe("chat silenziosa da 10 giorni", () => {
  it("compare dopo 10 giorni e avvisa una volta", () => {
    expect(chatSilence("2026-10-04", "2026-10-14", null)).toBeNull();
    expect(chatSilence("2026-10-03", "2026-10-14", null)).toEqual({ days: 11, lastDay: "2026-10-03" });
    expect(chatSilenceAlert("c", "2026-10-03", "2026-10-14", null)!.key).toBe("silence:c:2026-10-03");
    // un mese dopo resta in Oggi ma senza nuove notifiche
    expect(chatSilenceAlert("c", "2026-09-01", "2026-10-14", null)).toBeNull();
    expect(chatSilence("2026-09-01", "2026-10-14", null)).not.toBeNull();
  });

  it("Rimanda: sparisce per 5 giorni e poi riavvisa se non vi siete scritti", () => {
    const until = snoozeUntil("2026-10-14");
    expect(until).toBe("2026-10-19");
    expect(chatSilence("2026-10-03", "2026-10-15", until)).toBeNull();
    expect(chatSilenceAlert("c", "2026-10-03", "2026-10-18", until)).toBeNull();
    expect(chatSilenceAlert("c", "2026-10-03", "2026-10-19", until)!.key).toBe("silence:c:2026-10-03:rimandato:2026-10-19");
    expect(chatSilenceAlert("c", "2026-10-03", "2026-10-23", until)).toBeNull();
    // vi siete scritti dopo il rimando: il rimando vecchio non conta più
    expect(chatSilence("2026-10-20", "2026-10-25", until)).toBeNull();
    expect(chatSilenceAlert("c", "2026-10-20", "2026-10-31", until)!.key).toBe("silence:c:2026-10-20");
  });

  it("giorno e ora in Italia", () => {
    expect(romeDay("2026-10-13T22:30:00Z")).toBe("2026-10-14");
    expect(romeHour(new Date("2026-10-14T06:10:00Z"))).toBe(8);
    expect(romeHour(new Date("2026-11-04T06:10:00Z"))).toBe(7);
    expect(romeHour(new Date("2026-11-04T07:10:00Z"))).toBe(8);
  });
});

describe("progressi: confronto tra check e dal primo check", () => {
  const pt = (id: string, date: string | null, o: Partial<BodyPoint> = {}): BodyPoint => ({ id, date, label: id, weight: null, fatPct: null, fatKg: null, leanKg: null, folds: {}, circ: {}, ...o });
  const a = pt("a", "2026-01-10", { weight: 80, fatPct: null, folds: { tricipite: 12, addominale: 20 }, circ: { vita: 90 } });
  const b = pt("b", "2026-04-10", { weight: 78, fatPct: 18, fatKg: 14, leanKg: 64, folds: { tricipite: 10, addominale: 18, coscia: 15 }, circ: { vita: 87.5 } });
  const c = pt("c", "2026-07-10", { weight: 77, fatPct: 16.5, fatKg: 12.7, leanKg: 64.3, folds: { tricipite: 9.5, addominale: 17 }, circ: { vita: 86 } });

  it("ogni misura dal primo check che ce l'ha", () => {
    expect(firstToLast([a, b, c], (p) => p.weight)).toMatchObject({ from: 80, to: 77, diff: -3 });
    expect(firstToLast([a, b, c], (p) => p.fatPct)).toMatchObject({ from: 18, to: 16.5, diff: -1.5, fromLabel: "b" });
    expect(firstToLast([a], (p) => p.weight)).toBeNull();
  });

  it("confronto: tutte le misure con la differenza, somma solo delle pliche comuni", () => {
    const sites = sitesInAll([a, b, c]);
    expect(sites).toEqual(["tricipite", "addominale"]);
    const rows = compareRows(b, c, sites);
    expect(rows.find((r) => r.key === "weight")).toMatchObject({ a: 78, b: 77, diff: -1, better: null });
    expect(rows.find((r) => r.key === "fatKg")).toMatchObject({ diff: -1.3, better: "down" });
    expect(rows.find((r) => r.key === "sum")).toMatchObject({ a: 28, b: 26.5, diff: -1.5 });
    // la coscia c'è solo prima: resta, con il vuoto dopo
    expect(rows.find((r) => r.key === "f:coscia")).toMatchObject({ a: 15, b: null, diff: null });
    expect(rows.find((r) => r.key === "c:vita")).toMatchObject({ diff: -1.5 });
    expect(defaultPair([a, b, c])).toEqual(["b", "c"]);
    // per la composizione: un check di solo peso alla fine non si prende di partenza
    const d = pt("d", "2026-08-10", { weight: 76.5, fatPct: null, folds: {}, circ: {} });
    expect(defaultPair([a, b, c, d])).toEqual(["c", "d"]);
    expect(defaultPair([a, b, c, d], { withFolds: true })).toEqual(["b", "c"]);
    expect(defaultPair([a, d], { withFolds: true })).toEqual(["a", "d"]);
  });
});

describe("link nei messaggi della chat", () => {
  it("riconosce gli indirizzi e lascia fuori la punteggiatura", () => {
    expect(splitLinks("Guarda https://example.com/a?b=1. Ciao")).toEqual([
      { text: "Guarda " },
      { text: "https://example.com/a?b=1", href: "https://example.com/a?b=1" },
      { text: ". Ciao" },
    ]);
    expect(splitLinks("vai su www.otherise.com, poi")).toEqual([{ text: "vai su " }, { text: "www.otherise.com", href: "https://www.otherise.com" }, { text: ", poi" }]);
    expect(splitLinks("(https://it.wikipedia.org/wiki/Squat_(esercizio))")[1]).toEqual({ text: "https://it.wikipedia.org/wiki/Squat_(esercizio)", href: "https://it.wikipedia.org/wiki/Squat_(esercizio)" });
    expect(splitLinks("niente link qui")).toEqual([{ text: "niente link qui" }]);
  });
});

describe("bozze tra due dispositivi", () => {
  const base = { weight: "64", sf: { tri: ["12", "", ""], add: ["", "", ""] }, notes: "ciao" };
  it("si manda solo quello che è cambiato", () => {
    const next = { ...base, sf: { ...base.sf, tri: ["12", "13", ""] } };
    expect(diffDraft(base, next)).toEqual([{ path: ["sf", "tri", 1], value: "13" }]);
    expect(diffDraft(base, base)).toEqual([]);
    expect(diffDraft({ a: 1, b: 2 }, { a: 1 })).toEqual([{ path: ["b"] }]);
  });
  it("le modifiche dei due dispositivi restano tutte e due", () => {
    const phone = { ...base, sf: { ...base.sf, add: ["20", "", ""] } };
    const pc = { ...base, weight: "64,5" };
    const merged = mergeDraft(base, phone, pc);
    expect(merged).toEqual({ weight: "64,5", sf: { tri: ["12", "", ""], add: ["20", "", ""] }, notes: "ciao" });
    // il server applica la stessa cosa
    expect(applyPatch(pc, diffDraft(base, phone))).toEqual(merged);
    // stesso campo: vince chi scrive qui
    expect(mergeDraft(base, { ...base, notes: "A" }, { ...base, notes: "B" }).notes).toBe("A");
    // senza una base: si parte da un oggetto vuoto
    expect(mergeDraft(null, { x: "1" }, { y: "2" })).toEqual({ x: "1", y: "2" });
  });
  it("controlla i dati che arrivano dal browser", () => {
    expect(isDraftPatch([{ path: ["a", 0], value: "1" }])).toBe(true);
    expect(isDraftPatch([{ path: ["__proto__", "x"], value: 1 }])).toBe(false);
    expect(isDraftPatch({})).toBe(false);
    expect(applyPatch({ a: [1, 2] }, [{ path: ["a", 1] }])).toEqual({ a: [1, null] });
  });
});

describe("importi scritti a mano", () => {
  it("capisce virgola, punto delle migliaia e punto dei decimali", () => {
    expect(parseEuro("45,50")).toBe(45.5);
    expect(parseEuro("45.50")).toBe(45.5);
    expect(parseEuro("45.5")).toBe(45.5);
    expect(parseEuro("1.250")).toBe(1250);
    expect(parseEuro("1.250,50")).toBe(1250.5);
    expect(parseEuro(" 300 € ")).toBe(300);
    expect(parseEuro("abc")).toBeNaN();
    expect(parseEuro("")).toBeNaN();
  });
});

import { parseCheckMode } from "./check-mode-key";
import { linkAllowedForRole } from "./invite-link";
import { currentProgram } from "./program/schedule";
import { progressPrescriptions } from "./program/progression";

describe("robustezza (15/10)", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  it("modalità check: un dato strano vale 'nessuna modalità'", () => {
    expect(parseCheckMode(null)).toBeNull();
    expect(parseCheckMode([1, 2])).toBeNull();
    expect(parseCheckMode("ciao")).toBeNull();
    expect(parseCheckMode({ clientId: "non-un-id" })).toBeNull();
    expect(parseCheckMode({ clientId: id, checkId: 5 })).toBeNull();
    expect(parseCheckMode({ clientId: id, clientName: { x: 1 }, paused: "sì" })).toEqual({ clientId: id, checkId: null, clientName: "", startedAt: "", paused: false });
    expect(parseCheckMode({ clientId: id, checkId: null, newId: id, clientName: "Anna", startedAt: "2026-10-15T08:00:00Z", paused: true })).toEqual({ clientId: id, checkId: null, newId: id, clientName: "Anna", startedAt: "2026-10-15T08:00:00Z", paused: true });
  });
  it("link per entrare: solo per account di clienti o non assegnati", () => {
    expect(linkAllowedForRole("client")).toBe(true);
    expect(linkAllowedForRole("none")).toBe(true);
    expect(linkAllowedForRole(null)).toBe(true);
    expect(linkAllowedForRole("owner")).toBe(false);
    expect(linkAllowedForRole("coach")).toBe(false);
  });
  it("programma in corso: l'ultimo iniziato, altrimenti il prossimo che parte", () => {
    const p = (id: string, start: string | null, status = "published") => ({ id, start_date: start, status });
    const list = [p("futuro-lontano", "2026-12-01"), p("bozza", null, "draft"), p("futuro", "2026-11-01"), p("vecchio", "2026-08-01"), p("in-corso", "2026-10-01")];
    expect(currentProgram(list, "2026-10-15")?.id).toBe("in-corso");
    expect(currentProgram(list, "2026-07-01")?.id).toBe("vecchio");
    expect(currentProgram(list.filter((x) => x.id.startsWith("futuro")), "2026-10-15")?.id).toBe("futuro");
    expect(currentProgram(list.filter((x) => x.id.startsWith("futuro")), "2026-10-15", { upcoming: false })).toBeNull();
  });
  it("progressione: parte dalla prima settimana scritta, vuoto resta vuoto", () => {
    expect(progressPrescriptions(["", "", ""], "kg25")).toEqual(["", "", ""]);
    const out = progressPrescriptions(["", "4x8 60kg", "", ""], "kg25");
    expect(out[0]).toBe("");
    expect(out[1]).toBe("4x8 60kg");
    expect(out[2]).not.toBe("");
  });
});

describe("photo-view: inquadratura del confronto foto", async () => {
  const { photoRect, clampView, zoomAt, frameSize, START_VIEW } = await import("./photo-view");
  it("di partenza la foto è intera e centrata nel riquadro", () => {
    const r = photoRect(900, 1600, 300, 400, START_VIEW);
    expect(r.h).toBeCloseTo(400);
    expect(r.w).toBeCloseTo(225);
    expect(r.left).toBeCloseTo(37.5);
    expect(r.top).toBeCloseTo(0);
  });
  it("lo zoom tiene fermo il punto toccato", () => {
    const v = zoomAt(START_VIEW, 2, 50, -40);
    // il punto (50,-40) dal centro resta lì: (50 - x) / s == 50 prima dello zoom
    expect((50 - v.x) / v.s).toBeCloseTo(50);
    expect((-40 - v.y) / v.s).toBeCloseTo(-40);
  });
  it("zoom tra 0,5 e 4 e spostamento solo leggero", () => {
    expect(clampView({ s: 10, x: 0, y: 0 }, 900, 1600, 300, 400).s).toBe(4);
    expect(clampView({ s: 0.1, x: 0, y: 0 }, 900, 1600, 300, 400).s).toBe(0.5);
    const far = clampView({ s: 1, x: 5000, y: -5000 }, 900, 1600, 300, 400);
    expect(far.x).toBeCloseTo(75);
    expect(far.y).toBeCloseTo(-100);
  });
  it("due riquadri affiancati stanno nello spazio libero", () => {
    expect(frameSize(390, 600, 9 / 16)).toEqual({ fw: 194, fh: 344 });
    expect(frameSize(1200, 700, 3 / 4)).toEqual({ fw: 525, fh: 700 });
  });
});

describe("storico degli allenamenti e costanza (16/10)", async () => {
  const { buildHistory, weeklyCounts, weeklyAverage, trainingSummary } = await import("./training-history");
  const programs = [{ id: "p1", title: "Fase 2 · Forza", days: [{ id: "d1", title: "Giorno 1 · Spinta", items: 3 }, { id: "d2", title: "Giorno 2 · Tirata", items: 2 }] }];
  const log = (id: string, date: string, day = "d1", completed = true) => ({ id, program_id: "p1", week: 1, day_id: day, performed_on: date, completed, notes: "", discomfort: "" });
  const history = buildHistory({
    logs: [log("l1", "2026-10-12"), log("l2", "2026-10-14", "d2"), log("l3", "2026-10-16", "d1", false)],
    exercises: [
      { workout_log_id: "l1", item_id: "b", exercise_name: "Panca", sets: [{ reps: 8, load: 60, done: true }], result_text: "" },
      { workout_log_id: "l1", item_id: "a", exercise_name: "Squat", sets: [], result_text: "fatto leggero" },
      { workout_log_id: "l1", item_id: "c", exercise_name: "Dip", sets: [], result_text: "" },
    ],
    programs,
    free: [{ id: "f1", kind: "spinning", minutes: 45, effort: 3, performed_on: "2026-10-16", notes: " bello " }],
    ptSources: ["p1:1:d2"],
    itemOrder: new Map([["a", 0], ["b", 1], ["c", 2]]),
  });

  it("unisce programma e liberi dal più recente, prima il programma a parità di giorno", () => {
    expect(history.map((s) => s.id)).toEqual(["l3", "f1", "l2", "l1"]);
    const free = history[1];
    expect(free.kind).toBe("free");
    expect(free.title).toBe("Spinning");
    expect(free.subtitle).toContain("45 min");
    expect(free.notes).toBe("bello");
  });

  it("esercizi in ordine del programma, quelli vuoti fuori; sessione PT riconosciuta", () => {
    const l1 = history.find((s) => s.id === "l1")!;
    if (l1.kind !== "program") throw new Error("atteso programma");
    expect(l1.exercises.map((e) => e.name)).toEqual(["Squat", "Panca"]);
    expect(l1.exercises[0].summary).toBe("fatto leggero");
    expect(l1.planned).toBe(3);
    expect(l1.title).toBe("Giorno 1 · Spinta");
    expect(l1.subtitle).toBe("Fase 2 · Forza · settimana 1");
    expect(l1.pt).toBe(false);
    const l2 = history.find((s) => s.id === "l2")!;
    expect(l2.kind === "program" && l2.pt).toBe(true);
  });

  it("allenamenti per settimana: solo quelli chiusi, liberi a parte", () => {
    const counts = weeklyCounts(history, "2026-10-16", 3);
    expect(counts.map((w) => w.week)).toEqual(["2026-09-28", "2026-10-05", "2026-10-12"]);
    expect(counts[2]).toEqual({ week: "2026-10-12", program: 2, free: 1 });
    expect(counts[0]).toEqual({ week: "2026-09-28", program: 0, free: 0 });
  });

  it("media sulle settimane intere, esclusa quella in corso", () => {
    const counts = [
      { week: "2026-09-21", program: 3, free: 0 },
      { week: "2026-09-28", program: 2, free: 1 },
      { week: "2026-10-05", program: 2, free: 0 },
      { week: "2026-10-12", program: 9, free: 9 },
    ];
    expect(weeklyAverage(counts, 3)).toBeCloseTo(2.7, 1);
    expect(weeklyAverage(counts, 3, "program")).toBeCloseTo(2.3, 1);
    expect(weeklyAverage([{ week: "2026-10-12", program: 1, free: 0 }])).toBe(0);
  });

  it("riassunto: costanza sul programma, ultimo allenamento anche libero", () => {
    const s = trainingSummary(history, "2026-10-16", { start: "2026-10-01", end: "2026-10-28", daysPerWeek: 2 });
    expect(s.thisWeek).toEqual({ program: 2, free: 1 });
    expect(s.daysSinceLast).toBe(0);
    expect(s.consistency.expected).toBe(4);
    expect(s.consistency.done).toBe(2);
    expect(s.consistency.pct).toBe(50);
    expect(trainingSummary(history, "2026-10-16", null).consistency.pct).toBeNull();
    expect(trainingSummary([], "2026-10-16", null).daysSinceLast).toBeNull();
  });
});

describe("test di forza dei check (16/10)", async () => {
  const { strengthTestSeries, testDetail } = await import("./strength/tests");
  const checks = [
    { check_date: "2026-06-01", strength_tests: [{ exercise: "Squat", load: 100, reps: 5, rpe: 9, e1rm: 120 }, { exercise: "Trazioni", load: 10, reps: null, e1rm: null }] },
    { check_date: null, sequence: 2, strength_tests: [{ exercise: "squat ", load: 90, reps: 5, e1rm: 105 }] },
    { check_date: null, sequence: 1, strength_tests: [{ exercise: "Squat", load: 80, reps: 5, e1rm: 95 }, { exercise: "Squat", load: 85, reps: 5, e1rm: 99 }] },
    { check_date: "2026-09-01", strength_tests: [{ exercise: "Squat", load: 110, reps: 3, rpe: 10, e1rm: 118 }, { exercise: "", load: 50 }, { exercise: "Panca", load: 0 }] },
  ];
  const series = strengthTestSeries(checks, 2026);

  it("una serie per esercizio (stesso nome con maiuscole e spazi diversi), prima quella con più test", () => {
    expect(series.map((s) => s.name)).toEqual(["Squat", "Trazioni"]);
    expect(series[0].points.map((p) => p.value)).toEqual([99, 105, 120, 118]);
  });

  it("i check senza data restano al loro posto con l'etichetta Check N", () => {
    expect(series[0].points.map((p) => p.label)).toEqual(["Check 1", "Check 2", "1 giu", "1 set"]);
    expect(series[0].points[0].date).toBeNull();
  });

  it("senza massimale stimato vale il carico; il dettaglio dice come è stato fatto", () => {
    const t = series[1].points[0];
    expect(t).toMatchObject({ value: 10, estimated: false, reps: null });
    expect(testDetail(t)).toBe("10 kg");
    expect(testDetail(series[0].points[2])).toBe("100 kg × 5 @ RPE 9");
    expect(testDetail(series[0].points[3])).toBe("110 kg × 3");
  });
});

describe("fase precedente nell'editor (17/10)", async () => {
  const { buildCompareView, previousPhases, exerciseKey, findExercise } = await import("./program/compare");
  it("propone l'ultima fase iniziata prima di questa, senza data in fondo", () => {
    const all = [
      { id: "a", title: "Fase 1", start_date: "2026-06-01", weeks: 4, status: "archived" },
      { id: "b", title: "Fase 2", start_date: "2026-07-01", weeks: 4, status: "archived" },
      { id: "c", title: "Fase 3", start_date: "2026-08-01", weeks: 4, status: "published" },
      { id: "x", title: "Vecchia", start_date: null, weeks: 4, status: "archived" },
    ];
    const r = previousPhases(all, { id: "c", start_date: "2026-08-01" });
    expect(r.phases.map((p) => p.id)).toEqual(["b", "a", "x"]);
    expect(r.defaultId).toBe("b");
    // bozza senza data: l'ultima fase
    expect(previousPhases(all, { id: "new", start_date: null }).defaultId).toBe("c");
    expect(previousPhases([], { id: "c", start_date: null }).defaultId).toBeNull();
  });
  it("stessa chiave per lo stesso esercizio: eserciziario o nome scritto", () => {
    expect(exerciseKey({ exerciseId: "11111111-1111-4111-8111-111111111111", name: "Squat" })).toBe("id:11111111-1111-4111-8111-111111111111");
    expect(exerciseKey({ exerciseId: null, name: "  Panca  Piana " })).toBe("n:panca piana");
  });
  it("prescrizione e cosa ha fatto, settimana per settimana", () => {
    const content = parseContent({
      days: [
        { id: "d1", title: "Giorno 1", blocks: [
          { id: "b1", kind: "single", items: [{ id: "i1", name: "Squat", prescriptions: ["4x8 60kg", "4x8 62,5kg"] }] },
          { id: "b2", kind: "superset", rounds: 3, items: [{ id: "i2", name: "Trazioni", prescriptions: ["3x6", "3x7"] }, { id: "i3", name: "", prescriptions: [] }, { id: "i4", name: "Plank", prescriptions: ["30\"", "35\""] }] },
          { id: "b3", kind: "text", title: "Defaticamento", notes: "Camminata" },
        ] },
      ],
    });
    const view = buildCompareView({ id: "p", title: "Fase 1", weeks: 2, start_date: "2026-06-01" }, content,
      [{ id: "l1", week: 1, day_id: "d1", performed_on: "2026-06-02" }, { id: "l0", week: 1, day_id: "d1", performed_on: "2026-06-01" }],
      [
        { workout_log_id: "l1", item_id: "i1", sets: [{ reps: 8, kg: 60 }, { reps: 8, kg: 60 }], result_text: "" },
        { workout_log_id: "l0", item_id: "i1", sets: [{ reps: 5, kg: 40 }], result_text: "" },
        { workout_log_id: "l1", item_id: "i4", sets: [], result_text: "fatto" },
      ]);
    const [single, superset, text] = view.days[0].blocks;
    expect(single.heading).toBe("");
    expect(single.items[0].done[0]).toContain("60");
    expect(single.items[0].done[1]).toBeNull();
    expect(superset.heading).toBe("B · Superserie · 3 giri");
    expect(superset.items.map((i) => i.label)).toEqual(["B1", "B3"]);
    expect(superset.items[1].done[0]).toBe("fatto");
    expect(text).toMatchObject({ heading: "Defaticamento", text: "Camminata", items: [] });
    expect(view.loggedWeeks).toEqual([0]);
    expect(findExercise(view, "n:trazioni").map((f) => f.item.label)).toEqual(["B1"]);
  });
});

describe("numerazione delle fasi (17/10)", async () => {
  const { nextPhaseTitle } = await import("./program/next-phase");
  it("segue il numero più alto del cliente, anche partendo da una fase vecchia", () => {
    expect(nextPhaseTitle("21 Preparazione beach volley", ["20 Forza", "21 Preparazione beach volley"])).toBe("22 Preparazione beach volley");
    expect(nextPhaseTitle("20 Forza", ["20 Forza", "21 Preparazione beach volley"])).toBe("22 Forza");
  });
  it("tiene le cifre e toglie il vecchio 'nuova fase'", () => {
    expect(nextPhaseTitle("06 Volumizzazione 2", ["06 Volumizzazione 2", "05 Adattamento"])).toBe("07 Volumizzazione 2");
    expect(nextPhaseTitle("09 · Forza · nuova fase", ["09 · Forza · nuova fase"])).toBe("10 Forza");
    expect(nextPhaseTitle("99", [])).toBe("100");
  });
  it("senza numero resta come prima", () => {
    expect(nextPhaseTitle("Fase volume", ["Fase volume"])).toBe("Fase volume · nuova fase");
  });
});

describe("progressioni nei circuiti senza serie (17/10)", async () => {
  const { progress, deload, progressPrescriptions } = await import("./program/progression");
  it("ripetizioni e carico senza serie (le serie sono i giri)", () => {
    expect(progress("12 16kg", "reps", 2)).toBe("14 16kg");
    expect(progress("12 16kg", "kg25", 1)).toBe("12 18,5kg");
    expect(progress("12 16kg", "double", 3)).toBe("12 18,5kg");
    expect(progress("8-10 20kg", "reps", 1)).toBe("9-11 20kg");
    expect(progress('30"', "reps", 1)).toBe('35"');
    expect(progress("16kg", "kg5", 1)).toBe("21kg");
  });
  it("niente serie da aggiungere e niente numeri inventati (distanze)", () => {
    expect(progress("12 16kg", "sets", 1)).toBeNull();
    expect(progress("400m", "reps", 1)).toBeNull();
    expect(progress("4x8 60kg", "reps", 1)).toBe("4x9 60kg");
  });
  it("scarico senza serie: solo il carico", () => {
    expect(deload("12 16kg")).toBe("12 15kg");
    expect(progressPrescriptions(["12 16kg", "", "", ""], "reps", { deloadLast: true })).toEqual(["12 16kg", "13 16kg", "14 16kg", "14 15kg"]);
  });
});

describe("fase del progetto dedotta dalla forza prioritaria (17/10)", async () => {
  const { emptyProject, inferPhase, effectivePhases, projectForAI, projectNowText } = await import("./project");
  const p = emptyProject("2026-10");
  const fm = p.rows.find((r) => r.label === "Forza massima")!;
  const fr = p.rows.find((r) => r.label === "Forza resistente")!;
  fm.values = [3, 1, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0];
  fr.values = [1, 3, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0];
  p.phases[4] = "race";
  it("forza massima → intensificazione, resistente → volumizzazione, pari → transizione", () => {
    expect([0, 1, 2, 3].map((i) => inferPhase(p, i))).toEqual(["intensity", "volume", "transition", ""]);
  });
  it("massa magra vale come lato volume (studi senza forza resistente)", () => {
    const q = emptyProject("2026-04");
    q.rows = [
      { id: "a", label: "Forza massima", kind: "training", values: [2, 3, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0] },
      { id: "b", label: "Massa magra", kind: "training", values: [2, 1, 1, 3, 0, 0, 0, 0, 0, 0, 0, 0] },
    ];
    expect(effectivePhases(q).slice(0, 5)).toEqual(["transition", "intensity", "intensity", "volume", ""]);
  });
  it("la fase scelta dal trainer vince", () => {
    expect(effectivePhases(p).slice(0, 5)).toEqual(["intensity", "volume", "transition", "", "race"]);
    expect(p.phases[0]).toBe("");
  });
  it("l'AI e il testo di adesso usano la fase dedotta", () => {
    expect(projectForAI(p, "2026-10-05")).toContain("ottobre 2026 (adesso): fase Intensificazione");
    expect(projectNowText(p, "2026-10-05")).toBe("Adesso intensificazione questo mese, poi volumizzazione da novembre.");
  });
});

describe("copia e incolla di esercizi", () => {
  const mk = (id: string, name: string, p: string[] = ["3x10", "3x10"]): ProgramContent["days"][number]["blocks"][number] => ({
    id, kind: "single", title: "", notes: "", items: [{ id: `i-${id}`, name, rest: "", notes: "", prescriptions: p }],
  });
  const content: ProgramContent = {
    days: [
      { id: "d1", title: "Giorno 1", notes: "", blocks: [mk("a1", "Cat-cow"), mk("a2", "Bird dog"), mk("a3", "Dead bug"), mk("a4", "Squat", ["4x8 60kg", "4x8 62kg"])] },
      { id: "d2", title: "Giorno 2", notes: "", blocks: [mk("b1", "Vecchio 1"), mk("b2", "Vecchio 2"), mk("b3", "Vecchio 3"), mk("b4", "Panca")] },
      { id: "d3", title: "Giorno 3", notes: "", blocks: [mk("c1", "Vecchio 1"), mk("c2", "Stacco")] },
    ],
  };
  const names = (c: ProgramContent, d: number) => c.days[d].blocks.map((b) => b.items[0]?.name);

  it("copia in ordine di programma e ricorda da dove", () => {
    const c = collectBlocks(content, new Set(["a3", "a1", "a2"]));
    expect(c.blocks.map((b) => b.items[0].name)).toEqual(["Cat-cow", "Bird dog", "Dead bug"]);
    expect(c.dayIds).toEqual(["d1"]);
    expect(c.fromIndex).toBe(0);
  });

  it("incolla al posto dei selezionati in più giorni, con id nuovi ogni volta", () => {
    const clip = collectBlocks(content, new Set(["a1", "a2", "a3"])).blocks;
    const r = replaceSelected(content, new Set(["b1", "b2", "b3", "c1"]), clip, 2);
    expect(r.days).toBe(2);
    expect(r.removed).toBe(4);
    expect(names(r.content, 1)).toEqual(["Cat-cow", "Bird dog", "Dead bug", "Panca"]);
    expect(names(r.content, 2)).toEqual(["Cat-cow", "Bird dog", "Dead bug", "Stacco"]);
    expect(names(r.content, 0)).toEqual(names(content, 0));
    const ids = r.content.days.flatMap((d) => d.blocks.flatMap((b) => [b.id, ...b.items.map((i) => i.id)]));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("incolla sopra, in fondo, elimina", () => {
    const clip = [content.days[0].blocks[0]];
    expect(names(insertBeforeSelected(content, new Set(["c2"]), clip, 2).content, 2)).toEqual(["Vecchio 1", "Cat-cow", "Stacco"]);
    expect(names(appendToDay(content, "d3", clip, 2).content, 2)).toEqual(["Vecchio 1", "Stacco", "Cat-cow"]);
    const del = deleteSelected(content, new Set(["a4", "b4"]));
    expect(del.removed).toBe(2);
    expect(names(del.content, 1)).toEqual(["Vecchio 1", "Vecchio 2", "Vecchio 3"]);
  });

  it("le settimane si adattano al programma di arrivo", () => {
    expect(fitPrescriptions(["3x10", "3x10"], 4)).toEqual(["3x10", "3x10", "3x10", "3x10"]);
    expect(fitPrescriptions(["4x8 60kg", "4x8 62kg"], 4)).toEqual(["4x8 60kg", "4x8 62kg", "", ""]);
    expect(fitPrescriptions(["a", "b", "c"], 2)).toEqual(["a", "b"]);
    expect(fitPrescriptions(["", ""], 3)).toEqual(["", "", ""]);
  });

  it("gli stessi posti negli altri giorni, senza il giorno di partenza", () => {
    const c = collectBlocks(content, new Set(["a1", "a2", "a3"]));
    const clip = { v: 1 as const, at: 0, programId: "p1", programTitle: "Fase 21", ...c };
    expect(samePlaceIds(content, clip, "p1")).toEqual(["b1", "b2", "b3", "c1", "c2"]);
    // da un altro programma: anche il giorno 1
    expect(samePlaceIds(content, clip, "p2")).toHaveLength(8);
    expect(parseClip(JSON.stringify(clip))?.blocks).toHaveLength(3);
    expect(parseClip("{rotto")).toBeNull();
    expect(parseClip(JSON.stringify({ ...clip, blocks: [] }))).toBeNull();
    expect(blockNames(c.blocks)).toEqual(["Cat-cow", "Bird dog", "Dead bug"]);
  });
});

import { runHint, runKind, runRx, runTitle, runWarmup } from "./program/running";

describe("corse: tipo, riscaldamento e defaticamento", () => {
  it("dice se sono ripetute, fartlek o lento lungo", () => {
    expect(runKind("Corsa di qualità", "6x400m rec 1'30\"")).toBe("Ripetute");
    expect(runKind("Corsa di qualità", "Fartlek 20': 1' forte / 1' piano")).toBe("Fartlek");
    expect(runKind("Corsa di qualità", "5x3' rec 2'")).toBe("Ripetute");
    expect(runKind("Corsa", "8km lento lungo")).toBe("Lento lungo");
    expect(runKind("Lento lungo", "50'")).toBe("Lento lungo");
    expect(runKind("Vogatore", "5x500m")).toBeNull();
    expect(runKind("Riscaldamento corsa", "10' corsa blanda")).toBeNull();
    expect(runTitle("Corsa di qualità", "6x400m")).toBe("Ripetute");
    expect(runTitle("Corsa di qualità", "fartlek 20'")).toBe("Fartlek");
    expect(runTitle("Corsa tapis roulant", "6x400m")).toBe("Corsa tapis roulant · Ripetute");
    expect(runTitle("Ripetute in salita", "8x30\"")).toBe("Ripetute in salita");
    expect(runTitle("Squat", "4x8 60kg")).toBe("Squat");
    expect(runRx("Corsa di qualità", "Ripetute 6x400m rec 1'30\"")).toBe("6x400m rec 1'30\"");
    expect(runRx("Corsa di qualità", "Fartlek: 20' 1'/1'")).toBe("20' 1'/1'");
    expect(runHint("Corsa di qualità", ["6x400m", "Fartlek 20'"])).toMatch(/sett. 1 «Ripetute», sett. 2 «Fartlek»/);
    expect(runHint("Squat", ["4x8"])).toBeNull();
  });
  it("riscaldamento e defaticamento solo se il trainer non li ha già scritti", () => {
    const day = (items: ReturnType<typeof emptyItem>[], notes = "") => ({ id: "d", title: "Corsa", notes, blocks: items.map((it, i) => ({ ...emptyBlock(1), id: `b${i}`, items: [it] })) });
    const q = { ...emptyItem(1), id: "q", name: "Corsa di qualità", prescriptions: ["6x400m"] };
    expect(runWarmup(day([q]), 1)).toEqual({ before: "q", after: "q" });
    const warm = { ...emptyItem(1), id: "w", name: "Riscaldamento corsa", prescriptions: ["10' corsa blanda"] };
    expect(runWarmup(day([warm, q]), 1)).toEqual({ before: null, after: "q" });
    const cool = { ...emptyItem(1), id: "c", name: "Defaticamento", prescriptions: ["5'"] };
    expect(runWarmup(day([warm, q, cool]), 1)).toBeNull();
    const long = { ...emptyItem(1), id: "l", name: "Lento lungo", prescriptions: ["10km"] };
    expect(runWarmup(day([long]), 1)).toBeNull();
  });
  it("ripetute con il tipo davanti o in minuti diventano serie da spuntare", () => {
    expect(parsePrescription("Ripetute 6x400m rec 1'30\"")).toEqual({ kind: "distance", sets: 6, meters: 400 });
    expect(parsePrescription("5x3' rec 2'")).toEqual({ kind: "timed", sets: 5, seconds: 180 });
    expect(parsePrescription("4x1'30\"").kind).not.toBe("sets");
    expect(logPlan({ ...emptyItem(1), prescriptions: ["5x3'"] }, emptyBlock(1), 1)).toEqual({ mode: "check", rows: 5, label: "3'" });
  });
});

import { carrySwaps, doneWeeks, keepLockedWeeks, lockedWeeksDiffer, mergeSwaps } from "./program/locks";
import { applyChanges, placeSwap, previewRows, sanitizeChanges, scopeItems, allRowKeys } from "./program/retouch";
import { emptyDay, cloneWithNewIds as cloneIds, dayForWeek, itemForWeek, swapFor, swappedFrom, withoutSwaps } from "./program/types";
import { EMPTY_PROFILE, activeLimitation, parseProfileForm, profileText } from "./ai-profile";

describe("ritocchi: sostituzioni, settimane fatte e modifiche dell'AI", () => {
  const item = (id: string, name: string, rx: string[], extra: Partial<ReturnType<typeof emptyItem>> = {}) => ({ ...emptyItem(4, name), id, prescriptions: rx, ...extra });
  const program = (items: ReturnType<typeof item>[]) => ({ days: [{ id: "d1", title: "Giorno 1", notes: "", blocks: items.map((it, i) => ({ ...emptyBlock(4), id: `b${i}`, items: [it] })) }] });

  it("sostituto solo in alcune settimane: nome, esercizio e indicazioni di quelle settimane", () => {
    const panca = item("p", "Panca piana", ["4x8 60kg", "4x8 62kg", "4x6 65kg", "4x6 67kg"], { notes: "scapole addotte", swaps: [{ from: 2, to: 3, name: "Panca manubri", exerciseId: null, notes: "", reason: "polso" }] });
    expect(swapFor(panca, 1)).toBeNull();
    expect(itemForWeek(panca, 2)).toMatchObject({ id: "p", name: "Panca manubri", notes: "scapole addotte" });
    expect(swappedFrom(itemForWeek(panca, 3))).toEqual({ name: "Panca piana", from: 2, to: 3, reason: "polso" });
    expect(itemForWeek(panca, 4).name).toBe("Panca piana");
    expect(dayForWeek(program([panca]).days[0], 2).blocks[0].items[0].name).toBe("Panca manubri");
    // copie e nuove fasi non portano i sostituti
    expect(withoutSwaps(panca).swaps).toBeUndefined();
    expect(cloneIds(program([panca])).days[0].blocks[0].items[0].swaps).toBeUndefined();
    // la nuova fase non usa quello che ha fatto il sostituto
    const next = buildNextPhase(program([panca]), 4, [{ item_id: "p", week: 3, sets: [{ kg: 20, reps: 10 }], result_text: "" }, { item_id: "p", week: 1, sets: [{ kg: 60, reps: 8 }, { kg: 60, reps: 8 }], result_text: "" }]);
    expect(next.days[0].blocks[0].items[0].prescriptions[0]).toBe("2x8 60kg");
    expect(next.days[0].blocks[0].items[0].swaps).toBeUndefined();
  });

  it("settimane fatte: le prime prima del prossimo allenamento in sequenza", () => {
    const c = { days: [{ ...emptyDay(4, 0), id: "a" }, { ...emptyDay(4, 1), id: "b" }] };
    expect(doneWeeks(c, 4, [])).toBe(0);
    expect(doneWeeks(c, 4, [{ week: 1, day_id: "a", completed: true }])).toBe(0);
    expect(doneWeeks(c, 4, [{ week: 1, day_id: "a", completed: true }, { week: 1, day_id: "b", completed: true }, { week: 2, day_id: "a", completed: true }])).toBe(1);
    const all = [1, 2, 3, 4].flatMap((w) => ["a", "b"].map((d) => ({ week: w, day_id: d, completed: true })));
    expect(doneWeeks(c, 4, all)).toBe(4);
  });

  it("nessuna modifica tocca le settimane fatte (prescrizioni e sostituti)", () => {
    const base = program([item("s", "Squat", ["4x8 60kg", "4x8 62kg", "4x8 64kg", "4x8 66kg"], { swaps: [{ from: 1, to: 1, name: "Leg press", exerciseId: null, notes: "", reason: "" }] })]);
    const edited = program([
      item("s", "Squat", ["5x5 80kg", "5x5 80kg", "4x8 70kg", "4x8 72kg"], { swaps: [{ from: 1, to: 4, name: "Hack squat", exerciseId: null, notes: "", reason: "ginocchio" }] }),
      item("new", "Affondi", ["3x10", "3x10", "3x10", "3x10"]),
    ]);
    const kept = keepLockedWeeks(edited, base, 2);
    const s = kept.days[0].blocks[0].items[0];
    expect(s.prescriptions).toEqual(["4x8 60kg", "4x8 62kg", "4x8 70kg", "4x8 72kg"]);
    expect(s.swaps).toEqual([{ from: 1, to: 1, name: "Leg press", exerciseId: null, notes: "", reason: "" }, { from: 3, to: 4, name: "Hack squat", exerciseId: null, notes: "", reason: "ginocchio" }]);
    // un esercizio nuovo non risulta fatto nelle settimane passate
    expect(kept.days[0].blocks[1].items[0].prescriptions).toEqual(["", "", "3x10", "3x10"]);
    // senza settimane fatte non cambia niente (stesso oggetto)
    expect(keepLockedWeeks(edited, base, 0)).toBe(edited);
    expect(keepLockedWeeks(base, base, 2)).toBe(base);
    expect(lockedWeeksDiffer(edited, base, 2)).toBe(true);
    expect(mergeSwaps([{ from: 3, to: 4, name: "X", exerciseId: null, notes: "", reason: "" }, { from: 1, to: 2, name: "X", exerciseId: null, notes: "", reason: "" }])).toEqual([{ from: 1, to: 4, name: "X", exerciseId: null, notes: "", reason: "" }]);
    // la bozza completa dell'AI non fa sparire un sostituto deciso dal trainer
    const ai = program([item("s", "Squat", ["4x8 60kg", "4x8 62kg", "4x8 64kg", "4x8 66kg"])]);
    expect(carrySwaps(ai, base).days[0].blocks[0].items[0].swaps?.[0].name).toBe("Leg press");
  });

  it("dell'AI resta solo quello che può cambiare, e si applica riga per riga", () => {
    const c = program([item("r", "Ripetute", ["6x400m rec 1'30\"", "6x400m rec 1'30\"", "7x400m rec 1'30\"", "8x400m rec 1'30\""]), item("q", "Squat", ["4x8", "4x8", "4x8", "4x8"])]);
    const proposal = {
      summary: "Le ha fatte più forti: alzo il volume.",
      changes: [
        { itemId: "r", prescriptions: [{ week: 2, text: "8x400m rec 1'30\"" }, { week: 3, text: "8x400m rec 1'15\"" }, { week: 4, text: "8x400m rec 1'30\"" }, { week: 9, text: "x" }], rest: null, notes: "Ultime due a ritmo gara", swap: null, reason: "Più volume" },
        { itemId: "q", prescriptions: [{ week: 3, text: "5x5" }], rest: null, notes: null, swap: null, reason: "fuori dal pezzo" },
        { itemId: "nessuno", prescriptions: [{ week: 3, text: "x" }], rest: null, notes: null, swap: null, reason: "" },
      ],
    };
    const clean = sanitizeChanges(c, { kind: "item", itemId: "r" }, proposal, { from: 2, to: 4, done: 2, weeks: 4 });
    // solo la riga scelta, solo le settimane 3-4 (la 2 è fatta), niente righe uguali a prima
    expect(clean).toEqual([{ itemId: "r", prescriptions: [{ week: 3, text: "8x400m rec 1'15\"" }], rest: null, notes: "Ultime due a ritmo gara", swap: null, reason: "Più volume" }]);
    const groups = previewRows(c, clean);
    expect(groups[0].rows.map((r) => [r.what, r.before, r.after])).toEqual([["Settimana 3", "7x400m rec 1'30\"", "8x400m rec 1'15\""], ["Indicazioni", "—", "Ultime due a ritmo gara"]]);
    const keys = allRowKeys(groups);
    // tengo solo la settimana 3
    const out = applyChanges(c, clean, new Set([keys[0]]));
    expect(out.days[0].blocks[0].items[0].prescriptions[2]).toBe("8x400m rec 1'15\"");
    expect(out.days[0].blocks[0].items[0].notes).toBe("");
    expect(c.days[0].blocks[0].items[0].prescriptions[2]).toBe("7x400m rec 1'30\"");
    expect(scopeItems(c, { kind: "day", dayId: "d1" }).map((f) => f.label)).toEqual(["A", "B"]);
  });

  it("sostituto proposto dall'AI: nelle settimane scelte, togliendo quello di prima in quelle settimane", () => {
    const c = program([item("p", "Panca piana", ["4x8 60kg", "4x8 62kg", "4x6 65kg", "4x6 67kg"], { swaps: [{ from: 2, to: 4, name: "Floor press", exerciseId: null, notes: "", reason: "" }] })]);
    const clean = sanitizeChanges(c, { kind: "program" }, { summary: "", changes: [{ itemId: "p", prescriptions: [{ week: 3, text: "4x10 18kg" }], rest: null, notes: null, swap: { from: 1, to: 3, name: "Panca manubri", exerciseId: null, notes: "presa neutra", reason: "polso" }, reason: "Polso" }] }, { from: 1, to: 4, done: 2, weeks: 4 });
    expect(clean[0].swap).toMatchObject({ from: 3, to: 3, name: "Panca manubri" });
    const out = applyChanges(c, clean, new Set(allRowKeys(previewRows(c, clean))));
    expect(out.days[0].blocks[0].items[0].swaps).toEqual([
      { from: 2, to: 2, name: "Floor press", exerciseId: null, notes: "", reason: "" },
      { from: 3, to: 3, name: "Panca manubri", exerciseId: null, notes: "presa neutra", reason: "polso" },
      { from: 4, to: 4, name: "Floor press", exerciseId: null, notes: "", reason: "" },
    ]);
    expect(placeSwap(undefined, { from: 1, to: 2, name: "A", exerciseId: null, notes: "", reason: "" })).toHaveLength(1);
  });

  it("limitazione temporanea: vale fino alla data, poi l'AI non ne tiene più conto", () => {
    expect(activeLimitation({ limitation: "niente prese a sinistra", limitation_until: "2026-11-03" }, "2026-10-20")).toEqual({ text: "niente prese a sinistra", until: "2026-11-03" });
    expect(activeLimitation({ limitation: "niente prese a sinistra", limitation_until: "2026-11-03" }, "2026-11-04")).toBeNull();
    expect(activeLimitation({ limitation: "spalla", limitation_until: null }, "2030-01-01")?.text).toBe("spalla");
    expect(profileText({ ...EMPTY_PROFILE, limitation: "spalla destra", limitation_until: "2026-11-03" }, "2026-10-20")).toMatch(/LIMITAZIONE TEMPORANEA fino al 2026-11-03: spalla destra/);
    expect(profileText({ ...EMPTY_PROFILE, limitation: "spalla destra", limitation_until: "2026-11-03" }, "2026-12-01")).toBe("");
    const fd = new FormData();
    fd.set("limitation", " polso ");
    fd.set("limitation_until", "2026-11-03");
    expect(parseProfileForm(fd)).toMatchObject({ limitation: "polso", limitation_until: "2026-11-03" });
    fd.set("limitation", "");
    expect(parseProfileForm(fd).limitation_until).toBeNull();
  });
});

import { averageUntil, lastDays as weightLastDays, normalizeWeights, parseKg, rollingAverage, weightSummary, weightTrendText } from "./body/weights";

describe("peso giorno per giorno", () => {
  it("legge il peso come lo scrive una persona", () => {
    expect(parseKg("63,95")).toBe(63.95);
    expect(parseKg("64.5 kg")).toBe(64.5);
    expect(parseKg(" 65 ")).toBe(65);
    expect(parseKg("63,957")).toBe(63.96);
    expect(parseKg("6")).toBeNull();
    expect(parseKg("abc")).toBeNull();
    expect(parseKg("")).toBeNull();
    expect(parseKg("1.000")).toBeNull();
  });
  it("una pesata per giorno, in ordine; media dei 7 giorni e differenza in 4 settimane", () => {
    const rows = [
      { log_date: "2026-10-03", kg: "65" },
      { log_date: "2026-09-05", kg: 66 },
      { log_date: "2026-09-04", kg: 66.4 },
      { log_date: "2026-10-01", kg: 64.6 },
      { log_date: "2026-10-01", kg: 64.8 },
      { log_date: "non-data", kg: 70 },
      { log_date: "2026-10-02", kg: 999 },
    ];
    const w = normalizeWeights(rows);
    expect(w).toEqual([
      { date: "2026-09-04", kg: 66.4 },
      { date: "2026-09-05", kg: 66 },
      { date: "2026-10-01", kg: 64.8 },
      { date: "2026-10-03", kg: 65 },
    ]);
    expect(averageUntil(w, "2026-10-03")).toBe(64.9);
    expect(averageUntil(w, "2026-09-20")).toBeNull();
    expect(rollingAverage(w).map((r) => r.avg)).toEqual([66.4, 66.2, 64.8, 64.9]);
    const s = weightSummary(w, "2026-10-05")!;
    expect(s).toMatchObject({ last: { date: "2026-10-03", kg: 65 }, avg7: 64.9, count7: 2, stale: false });
    // 4 settimane prima del 3/10 = 5/9: media di 4 e 5 settembre = 66,2
    expect(s.change28).toBe(-1.3);
    expect(weightSummary(w, "2026-10-20")!.stale).toBe(true);
    expect(weightSummary([], "2026-10-20")).toBeNull();
    expect(weightLastDays(w, 30, "2026-10-03").map((e) => e.date)).toEqual(["2026-09-04", "2026-09-05", "2026-10-01", "2026-10-03"]);
    expect(weightLastDays(w, 7, "2026-10-03").map((e) => e.date)).toEqual(["2026-10-01", "2026-10-03"]);
    expect(weightTrendText(w, "2026-10-05")).toBe("Peso giornaliero scritto dal cliente: media degli ultimi 7 giorni 64,9 kg (2 pesate, l'ultima il 2026-10-03), −1,3 kg rispetto a 4 settimane prima.");
    expect(weightTrendText([], "2026-10-05")).toBe("");
  });
});

describe("check in corso nei confronti della modalità check", () => {
  it("diventa un punto con peso, pliche (media delle rilevazioni), circonferenze e % con la formula del cliente", async () => {
    const { livePoint, withLiveCheck, LIVE_POINT_ID } = await import("./body/live-check");
    const pt = (id: string, date: string | null, o: Partial<BodyPoint> = {}): BodyPoint => ({ id, date, label: id, weight: null, fatPct: null, fatKg: null, leanKg: null, folds: {}, circ: {}, ...o });
    const opts = { sex: "F" as const, birthDate: "1993-05-10", formula: "f5" as const, today: "2026-10-23" };
    const empty = { check_date: "2026-10-23", weight: "", sf: { tricipite: ["", "", ""] }, circ: { vita: "" } };
    expect(livePoint(empty, opts)).toBeNull();
    const half = { ...empty, weight: "62,4", circ: { vita: "70,5", fianchi: "" } };
    const p1 = livePoint(half, opts)!;
    expect(p1).toMatchObject({ id: LIVE_POINT_ID, date: "2026-10-23", label: "Oggi · in corso", weight: 62.4, fatPct: null, circ: { vita: 70.5 } });
    const full = { ...half, sf: { tricipite: ["16", "17", ""], sottoscapolare: ["13"], soprailiaca: ["14"], addominale: ["18"], coscia: ["24"] } };
    const p2 = livePoint(full, opts)!;
    expect(p2.folds.tricipite).toBe(16.5);
    expect(p2.fatPct).toBeGreaterThan(10);
    expect(p2.fatKg).toBeCloseTo((62.4 * p2.fatPct!) / 100, 1);
    // senza le pliche della formula niente %, nemmeno con un'altra formula
    expect(livePoint({ ...full, sf: { ...full.sf, coscia: [""] } }, opts)!.fatPct).toBeNull();
    // in fondo ai check con data fino a oggi, con il valore anche nelle serie delle formule
    const old = pt("a", "2026-07-20", { weight: 63, fatPct: 24 });
    const nodate = pt("x", null, { weight: 66 });
    const r = withLiveCheck([nodate, old], [{ id: "f5", label: "5 pliche", ref: true, values: { a: { pct: 24, kg: 15, lean: 48 } } }], full, opts);
    expect(r.points.map((p) => p.id)).toEqual(["x", "a", LIVE_POINT_ID]);
    expect(r.formulas[0].values[LIVE_POINT_ID].pct).toBe(p2.fatPct);
    expect(withLiveCheck([old], [], null, opts).points).toHaveLength(1);
  });
});
