/**
 * Logbook: il carico della prima serie viene proposto nelle successive e,
 * prima di chiudere, l'app chiede delle serie non spuntate.
 * Non chiude l'allenamento, così non cambia i dati degli altri test.
 */
import { expect, test, type Page } from "@playwright/test";

const PASS = "Password-di-prova-123";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASS);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.getByRole("button", { name: "Entra" }).click()]);
}

test.afterEach(async ({ browser }) => {
  for (const c of browser.contexts()) await c.close().catch(() => undefined);
});

test("stesso carico nelle serie successive e domanda sulle serie non spuntate", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "giulia@prova.local");
  await page.goto("/cliente");
  await page.getByRole("link", { name: /Inizia l'allenamento|Riprendi l'allenamento/ }).first().click();
  await page.waitForURL(/\/cliente\/sessione\//);
  await page.waitForLoadState("networkidle");

  // primo esercizio con almeno 3 serie
  const firstKg = page.locator('input[aria-label$="serie 1, chili"]');
  let name = "";
  for (let i = 0; i < (await firstKg.count()); i++) {
    const label = (await firstKg.nth(i).getAttribute("aria-label"))!;
    const n = label.replace(/, serie 1, chili$/, "");
    if ((await page.locator(`input[aria-label="${n}, serie 3, chili"]`).count()) && !(await firstKg.nth(i).inputValue())) {
      name = n;
      break;
    }
  }
  test.skip(!name, "nessun esercizio libero con 3 serie nel prossimo allenamento");
  const kg = (s: number) => page.locator(`input[aria-label="${name}, serie ${s}, chili"]`);
  const reps = (s: number) => page.locator(`input[aria-label="${name}, serie ${s}, ripetizioni"]`);

  await kg(1).fill("40");
  await expect(kg(2)).toHaveValue("40");
  await expect(kg(3)).toHaveValue("40");
  // cambio solo le ripetizioni della seconda: il carico resta
  await reps(2).fill("7");
  await expect(kg(2)).toHaveValue("40");
  // una serie cambiata a mano non segue più la prima
  await kg(2).fill("37,5");
  await kg(1).fill("42");
  await expect(kg(2)).toHaveValue("37,5");
  await expect(kg(3)).toHaveValue("42");

  // "Ho finito" con serie non spuntate: chiede prima di chiudere
  await page.getByRole("button", { name: "Ho finito" }).click();
  const ask = page.getByRole("dialog", { name: "Serie non spuntate" });
  await expect(ask).toBeVisible();
  await expect(ask.getByRole("listitem").filter({ hasText: name })).toBeVisible();
  await expect(ask.getByRole("button", { name: "Le ho fatte: segnale come fatte" })).toBeVisible();
  await expect(ask.getByRole("button", { name: "Sì, le ho saltate" })).toBeVisible();
  await ask.getByRole("button", { name: "Torno all'allenamento" }).click();
  await expect(ask).toBeHidden();
  await expect(page).toHaveURL(/\/cliente\/sessione\//);

  // pulisco: tolgo i valori di prova
  for (const s of [1, 2, 3]) await kg(s).fill("");
  await reps(2).fill("");
  await expect(page.getByText(/Salvato alle/)).toBeVisible({ timeout: 10_000 });
  expect(errors).toEqual([]);
});

async function openDay(page: Page, title: RegExp) {
  await page.goto("/cliente/programma");
  const card = page.getByRole("heading", { name: title }).locator("xpath=ancestor::*[.//a[contains(@href,'/cliente/sessione/')]][1]");
  await card.locator("a[href*='/cliente/sessione/']").click();
  await page.waitForURL(/\/cliente\/sessione\//);
  await page.waitForLoadState("networkidle");
}

test("timer di EMOM e intervalli: parte da solo, si mette in pausa e riparte", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "giulia@prova.local");
  await page.clock.install();
  await openDay(page, /Condizionamento/);

  const timer = page.getByRole("timer");
  const clock = timer.getByTestId("timer-clock");
  await page.getByRole("button", { name: "Avvia il timer" }).first().click();
  await expect(timer).toContainText("Si parte · EMOM 12 min");
  await page.clock.runFor(4000);
  await expect(timer).toContainText("Giro 1/12");
  await expect(clock).toHaveText("0:59");

  // pausa: il tempo si ferma
  await timer.getByRole("button", { name: "Metti in pausa" }).click();
  await page.clock.runFor(10_000);
  await expect(timer).toContainText("In pausa");
  await expect(clock).toHaveText("0:59");
  // riprende da dove era
  await timer.getByRole("button", { name: "Riprendi" }).click();
  await page.clock.runFor(60_000);
  await expect(timer).toContainText("Giro 2/12");
  await timer.getByRole("button", { name: "Ferma il timer" }).click();
  await expect(timer).toHaveCount(0);

  // intervalli: lavoro e recupero alternati
  await page.getByRole("button", { name: "Avvia il timer" }).nth(1).click();
  await page.clock.runFor(3500 + 31_000);
  await expect(timer).toContainText("Recupero 1/8");
  await page.clock.runFor(30_000);
  await expect(timer).toContainText("Lavoro 2/8");
  await timer.getByRole("button", { name: "Ferma il timer" }).click();
  expect(errors).toEqual([]);
});

test("recupero tra le serie: parte spuntando la serie e si può mettere in pausa", async ({ page }) => {
  await login(page, "giulia@prova.local");
  await page.clock.install();
  await openDay(page, /Tirata e core/);

  // lo stacco rumeno ha "EMOM 2,5": un timer che fa partire una serie ogni 2 minuti e mezzo
  await page.getByRole("button", { name: /Avvia l'EMOM: una serie ogni 2:30/ }).click();
  const timer = page.getByRole("timer");
  await page.clock.runFor(3500 + 150_000);
  await expect(timer).toContainText("Serie 2/");
  await timer.getByRole("button", { name: "Ferma il timer" }).click();

  // lat machine con recupero 90": spunto una serie libera
  const btn = page.locator('div:has(> input[aria-label^="Lat machine"])').first().getByRole("button");
  test.skip(!(await btn.count()) || (await btn.getAttribute("aria-pressed")) === "true", "serie già spuntata in un altro test");
  const kgInput = page.locator('input[aria-label^="Lat machine"][aria-label$="serie 1, chili"]');
  const repsInput = page.locator('input[aria-label^="Lat machine"][aria-label$="serie 1, ripetizioni"]');
  await btn.click();
  await expect(timer).toContainText("Recupero");
  await expect(timer.getByTestId("timer-clock")).toHaveText("1:30");
  await page.clock.runFor(10_000);
  await expect(timer.getByTestId("timer-clock")).toHaveText("1:20");
  await timer.getByRole("button", { name: "Metti in pausa" }).click();
  await page.clock.runFor(20_000);
  await expect(timer.getByTestId("timer-clock")).toHaveText("1:20");
  await timer.getByRole("button", { name: "15 secondi in più" }).click();
  await expect(timer.getByTestId("timer-clock")).toHaveText("1:35");
  await timer.getByRole("button", { name: "Riprendi" }).click();
  await page.clock.runFor(95_000);
  await expect(timer).toHaveCount(0);

  // pulisco: tolgo la spunta e i valori
  await btn.click();
  await kgInput.fill("");
  await repsInput.fill("");
  await page.clock.runFor(3000);
  await expect(page.getByText(/Salvato alle/)).toBeVisible({ timeout: 10_000 });
});
