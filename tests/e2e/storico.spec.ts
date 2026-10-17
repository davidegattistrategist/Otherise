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

test("editor: fase precedente a portata di mano, poi si torna esattamente dov'eri", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("otherise:days-open", "all"));
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Esempio Giulia");
  await page.goto(`/staff/clienti/${id}/programma`);
  await page.getByRole("link", { name: /Fase 2/ }).filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/programmi\/[0-9a-f-]{36}$/);
  await page.waitForLoadState("networkidle");
  // tocca un esercizio del giorno 2
  const field = page.locator("[data-day-index='1'] [data-ex] input[aria-label='Esercizio']").filter({ visible: true }).first();
  await field.scrollIntoViewIfNeeded();
  await field.click();
  const name = (await field.inputValue()).trim();
  const before = await page.evaluate(() => scrollY);

  await page.locator("[data-open-previous]").click();
  const panel = page.locator("[data-previous-phase]");
  await expect(panel.getByRole("combobox", { name: "Scegli la fase" }).or(panel.getByText(/Fase 1/)).first()).toBeVisible();
  // segue l'esercizio e il giorno che stai scrivendo
  const focusCard = panel.locator("[data-prev-focus]");
  await expect(focusCard).toContainText(name);
  await expect(focusCard).toContainText("S1");
  await expect(panel.getByRole("tab", { name: "Giorno 2" })).toHaveAttribute("aria-selected", "true");
  await expect(panel.getByText(/Fatto: /).first()).toBeVisible();
  // un'altra settimana
  await panel.getByRole("tab", { name: /^Settimana 1\b/ }).click();
  await expect(panel.getByText("settimana 1")).toBeVisible();

  await panel.getByRole("button", { name: "Torna al programma" }).click();
  await expect(panel).toBeHidden();
  expect(Math.abs((await page.evaluate(() => scrollY)) - before)).toBeLessThan(4);
  await expect(field).toHaveValue(name);
  // riaperto: subito pronto, com'era
  await page.locator("[data-open-previous]").click();
  await expect(panel.getByText("settimana 1")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});

test("telefono: il menu in basso sparisce mentre scrivi e si rimpicciolisce scorrendo in giù", async ({ page }, info) => {
  test.skip(info.project.name !== "telefono", "solo telefono");
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Esempio Giulia");
  const nav = page.locator("[data-bottom-nav='staff']");
  // scorrendo in giù si rimpicciolisce, fermandosi torna normale
  await page.goto(`/staff/clienti/${id}`);
  await page.waitForLoadState("networkidle");
  await expect(nav).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 250);
    await page.waitForTimeout(60);
  }
  await expect(page.locator("html[data-nav-small]")).toHaveCount(1);
  await expect(page.locator("html[data-nav-small]")).toHaveCount(0, { timeout: 3000 });
  // in chat: tastiera aperta = menu via, chiusa = menu di nuovo
  await page.goto(`/staff/messaggi/${id}`);
  const box = page.locator("textarea").filter({ visible: true }).first();
  await box.click();
  await expect(page.locator("html[data-typing]")).toHaveCount(1);
  await expect(nav).toHaveCSS("opacity", "0");
  await box.blur();
  await expect(page.locator("html[data-typing]")).toHaveCount(0);
  await expect(nav).toHaveCSS("opacity", "1");
});
