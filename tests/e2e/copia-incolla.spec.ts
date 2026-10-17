/**
 * Copia e incolla di esercizi nell'editor (computer e telefono) e griglia del
 * computer tutta dentro la card, senza scorrere di lato.
 */
import { expect, test, type Page } from "@playwright/test";

const PASS = "Password-di-prova-123";

async function login(page: Page, email: string) {
  page.on("dialog", (d) => void d.accept());
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASS);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.getByRole("button", { name: "Entra" }).click()]);
}

async function name(page: Page, value: string) {
  const empty = page.getByLabel("Esercizio", { exact: true }).filter({ visible: true }).first();
  await empty.fill(value);
  await empty.blur();
}

test("copia i primi esercizi e li incolla al posto dei primi negli altri giorni, con Annulla", async ({ page }) => {
  await login(page, "titolare@prova.local");
  await page.goto("/staff/modelli");
  await page.getByRole("button", { name: "Nuovo modello" }).click();
  await page.waitForURL(/\/staff\/programmi\//);
  await page.waitForLoadState("networkidle");
  const day = (i: number) => page.locator(`[data-day-index="${i}"]`);

  // giorno 1: riscaldamento (2 esercizi) + un esercizio; giorno 2: un vecchio riscaldamento + panca
  await day(0).getByRole("button", { name: "Esercizio", exact: true }).click();
  await name(page, "Cat-cow");
  await day(0).getByRole("button", { name: "Esercizio", exact: true }).click();
  await name(page, "Bird dog");
  await day(0).getByRole("button", { name: "Esercizio", exact: true }).click();
  await name(page, "Squat");
  await page.getByRole("button", { name: "Aggiungi giorno" }).click();
  await expect(day(1)).toBeVisible();
  await name(page, "Vecchio riscaldamento");
  await day(1).getByRole("button", { name: "Esercizio", exact: true }).click();
  await name(page, "Panca");

  // seleziona i primi due del giorno 1 e copia
  await page.locator("[data-start-select]").click();
  const boxes = day(0).locator("[data-select-block]").filter({ visible: true });
  await boxes.nth(0).click();
  await boxes.nth(1).click();
  await expect(page.locator("[data-select-status]")).toHaveText("2 selezionati");
  await page.getByTestId("select-copy").click();
  await expect(page.locator("[data-clip]")).toContainText("Cat-cow, Bird dog");

  // i primi 2 degli altri giorni, poi al posto di quelli
  await page.getByTestId("select-same").click();
  await expect(page.locator("[data-select-status]")).toHaveText("2 selezionati");
  await expect(day(1).locator('[data-select-block][aria-checked="true"]').filter({ visible: true })).toHaveCount(2);
  await page.getByTestId("paste-replace").click();
  await expect(page.locator("[data-select-status]")).toContainText("Sostituiti 2 esercizi");
  const names = (i: number) => day(i).getByRole("button", { name: /^Esercizio: / }).filter({ visible: true });
  await expect(names(1)).toHaveText(["Cat-cow", "Bird dog"]);
  await expect(names(0)).toHaveText(["Cat-cow", "Bird dog", "Squat"]);

  // Annulla: tutto come prima
  await page.getByTestId("select-undo").click();
  await expect(names(1)).toHaveText(["Vecchio riscaldamento", "Panca"]);

  // sopra il primo e in fondo
  await day(1).locator("[data-select-block]").filter({ visible: true }).first().click();
  await page.getByTestId("paste-above").click();
  await expect(names(1)).toHaveText(["Cat-cow", "Bird dog", "Vecchio riscaldamento", "Panca"]);
  await day(1).locator("[data-paste-end]").click();
  await expect(names(1)).toHaveText(["Cat-cow", "Bird dog", "Vecchio riscaldamento", "Panca", "Cat-cow", "Bird dog"]);
  await page.getByTestId("select-done").click();
  await expect(page.locator("[data-select-bar]")).toHaveCount(0);

  // gli appunti restano: riaprendo (o in un altro programma) c'è "Incolla"
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.locator("[data-start-paste]")).toHaveText("Incolla i 2 esercizi copiati");
});

test("computer: la griglia del programma sta tutta nella card", async ({ page }, info) => {
  test.skip(info.project.name !== "pc", "la griglia è per il computer");
  await login(page, "titolare@prova.local");
  await page.goto("/staff/clienti");
  await page.getByRole("link", { name: /Esempio Giulia/ }).filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}/);
  await page.goto(page.url().replace(/(\/staff\/clienti\/[0-9a-f-]{36}).*/, "$1/programma"));
  await page.getByRole("link", { name: /Fase 2/ }).filter({ visible: true, hasNotText: "nuova fase" }).first().click();
  await page.waitForURL(/\/staff\/programmi\//);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Apri tutti i giorni" }).click();
  const grids = page.locator("[data-program-grid]").filter({ visible: true });
  await expect(grids.first()).toBeVisible();
  for (const g of await grids.all()) {
    const { sw, cw } = await g.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    expect(sw).toBeLessThanOrEqual(cw + 1);
  }
  // la linguetta "Fase precedente" non copre la griglia
  const tab = await page.locator("[data-open-previous]").boundingBox();
  const grid = await grids.first().boundingBox();
  expect(tab!.x).toBeGreaterThanOrEqual(grid!.x + grid!.width);
});
