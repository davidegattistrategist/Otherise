import { fillName, looksLikeQuestion, pendingClientMessages, pseudonymize, similarity, styleParts, styleSections, worthLearning, type StyleExample } from "./reply-draft";
import { prescriptionRule, setDifferences, workoutVsPlan } from "./reply-context";
import { describe, expect, it } from "vitest";
import { commonSites, computeBodyComposition, formulaById, formulaUpgrade, protocolSites, referenceFormula, siteAverage } from "./body/skinfolds";
import { sortChecks } from "./check-order";
import { checkDue } from "./check-due";
import { DEDICATIONS, QUOTES, dedicationOfDay, quoteOfDay } from "./quotes";
import { estimateOneRepMax } from "./strength/e1rm";
import { parsePrescription, prescriptionFromSets, summarizeSets } from "./program/prescription";
import { billingStatus, clientFacingStatus, creditChange, dueAmount, isCoaching, ptCounterView, periodEnd, suggestNextPeriod, type PlanKind } from "./billing";
import { clientNotices, ptLeft } from "./client-notice";
import { addDays, addMonths, ageOn, diffDays, formatHeading, isBirthday, isISODate, mondayOf, todayISO } from "./dates";
import { displayWeek, nextDay, nextWorkout, programEndDate, weekPosition } from "./program/schedule";
import { buildNextPhase, copyWeekToOthers } from "./program/next-phase";
import { blockLetter, blockSummary, emptyBlock, itemLabel, normalizeWeeks, parseContent, type ProgramContent } from "./program/types";
import { parseCsv } from "./import/csv";
import { parseProgramSheet } from "./import/sheet";
import { parseExerciseCsv, youtubeId } from "./import/exercises";
import { checkinWeekFor } from "./checkin";

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
    expect(quoteOfDay("2027-01-01")).toEqual({ text: "Il passato è un prologo.", author: "Shakespeare" });
    expect(quoteOfDay("2026-12-25").text).toMatch(/Natale/);
    expect(quoteOfDay("2028-02-29").text).toMatch(/quattro anni/);
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
  it("periodi", () => {
    expect(periodEnd("quarterly", "2026-10-13")).toBe("2027-01-12");
    expect(periodEnd("six_weeks", "2026-10-01")).toBe("2026-11-11");
    expect(periodEnd("monthly", "2026-01-31")).toBe("2026-02-27");
    expect(suggestNextPeriod("quarterly", "2026-01-01", "2026-03-31")).toEqual({ start: "2026-04-01", end: "2026-06-30" });
    expect(suggestNextPeriod("package", "2026-01-01", null)).toBeNull();
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
  });  it("credito del coaching: paga 500 invece di 300, il rinnovo dopo costa 100", () => {
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
});

describe("video della chat", async () => {
  const { targetSize, shouldCompress } = await import("../components/chat/compress-video");
  const { videoExpired, CHAT_VIDEO_KEEP_DAYS } = await import("./chat-shared");
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
  it("i video si cancellano dopo 6 mesi", () => {
    const now = Date.parse("2026-10-12T12:00:00Z");
    expect(videoExpired("2026-03-01T10:00:00Z", now)).toBe(true);
    expect(videoExpired("2026-06-01T10:00:00Z", now)).toBe(false);
    expect(CHAT_VIDEO_KEEP_DAYS).toBeGreaterThanOrEqual(180);
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
