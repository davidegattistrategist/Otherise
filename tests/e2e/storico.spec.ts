/**
 * Storico vero degli allenamenti (programma e liberi) con la costanza, e
 * grafici dei test di forza dei check per staff e cliente.
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

async function openClient(page: Page, name: string) {
  await page.goto("/staff/clienti");
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: new RegExp(name) }).filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}/);
  return /\/staff\/clienti\/([0-9a-f-]{36})/.exec(page.url())![1];
}

test("allenamenti: storico con programma e liberi, costanza, esercizi fatti", async ({ page }) => {
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Esempio Giulia");
  // in panoramica il riassunto e le ultime sessioni, con il link allo storico
  await expect(page.locator("[data-training-summary]")).toContainText("Costanza");
  await page.getByRole("link", { name: "Tutto lo storico" }).click();
  await page.waitForURL(new RegExp(`/staff/clienti/${id}/allenamenti$`));
  const summary = page.locator("[data-training-summary]");
  await expect(summary).toContainText(/\d+%/);
  await expect(summary).toContainText("Media a settimana");
  const list = page.locator("[data-training-history]");
  await expect(list.locator("[data-session]", { hasText: "Libero" }).first()).toBeVisible();
  // un allenamento del programma: aprendolo si vede cosa ha fatto
  const session = list.locator("[data-session]", { hasText: /\d+ di \d+ esercizi/ }).first();
  await session.locator("summary").click();
  await expect(session.getByRole("link", { name: "Apri il logbook" })).toBeVisible();
  await expect(session.locator("li").first()).toContainText(/kg|×|x/);
  // periodo più lungo: almeno le stesse sessioni
  const before = await list.locator("[data-session]").count();
  await page.getByRole("link", { name: "1 anno" }).click();
  await page.waitForURL(/periodo=52/);
  expect(await page.locator("[data-training-history] [data-session]").count()).toBeGreaterThanOrEqual(before);
});

test("test di forza: grafico per esercizio nei check dello staff e nei progressi del cliente", async ({ page }) => {
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Esempio Giulia");
  await page.goto(`/staff/clienti/${id}/check`);
  const card = page.locator("[data-strength-tests]");
  await expect(card).toContainText("Test di forza e performance");
  await expect(card.getByRole("img")).toBeVisible();
  const buttons = card.getByRole("button");
  if ((await buttons.count()) > 1) {
    const second = buttons.nth(1);
    const name = (await second.textContent())!.trim();
    await second.click();
    await expect(second).toHaveAttribute("aria-pressed", "true");
    await expect(card.locator("span.font-semibold", { hasText: name }).first()).toBeVisible();
  }
  await card.getByText(/Tutti i test \(\d+\)/).click();
  await expect(card.locator("li").first()).toContainText("kg");

  await page.context().clearCookies();
  await login(page, "giulia@prova.local");
  await page.goto("/cliente/progressi");
  const mine = page.locator("[data-strength-tests]");
  await expect(mine).toContainText("Test di forza e performance");
  await expect(mine.getByRole("img")).toBeVisible();
});
