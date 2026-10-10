import { fillName, looksLikeQuestion, pendingClientMessages, pseudonymize, similarity, styleSections, type StyleExample } from "./reply-draft";
import { describe, expect, it } from "vitest";
import { computeBodyComposition, protocolSites, siteAverage } from "./body/skinfolds";
import { estimateOneRepMax } from "./strength/e1rm";
import { parsePrescription, prescriptionFromSets, summarizeSets } from "./program/prescription";
import { billingStatus, periodEnd, suggestNextPeriod } from "./billing";
import { addMonths, ageOn, diffDays, formatHeading, isISODate, mondayOf, todayISO } from "./dates";
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

  it("non calcola la percentuale se manca una plica (errore trovato nei fogli)", () => {
    const r = computeBodyComposition({
      sex: "M",
      age: 29,
      weightKg: 98,
      skinfolds: { tricipite: [21, 21, 21], pettorale: [16, 16, 16], sottoscapolare: [22, 22.5, 22] },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toEqual(["ascellare", "soprailiaca", "addominale", "coscia"]);
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
    expect(billingStatus({ ...base, kind: "quarterly", paid_until: "2026-10-08" }, "2026-10-09").label).toBe("Scaduto da 1 giorno");
    expect(billingStatus({ ...base, kind: "monthly", paid_until: null }, "2026-10-09").state).toBe("overdue");
    const pkg = billingStatus({ ...base, kind: "package", sessions_bought: 10, sessions_used: 8 }, "2026-10-09");
    expect(pkg.state).toBe("due_soon");
    expect(pkg.label).toBe("2 sessioni rimaste");
    expect(billingStatus({ ...base, kind: "package", sessions_bought: 10, sessions_used: 10 }, "2026-10-09").state).toBe("overdue");
    expect(billingStatus(null, "2026-10-09").state).toBe("none");
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

describe("check-up", () => {
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

import { emptyProject, projectForAI, projectNowText } from "./project";

describe("progetto annuale", () => {
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
    expect(homeScreenName("Diego Teoldi Personal Training")).toBe("Diego");
  });
});
