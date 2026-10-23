/**
 * Peso giorno per giorno (Giulia nel seed ha 6 settimane di pesate, oggi no):
 * - il cliente lo segna in Progressi, lo corregge e lo toglie;
 * - lo staff lo vede in Check (e può segnarlo per un giorno passato) e in Panoramica.
 * Alla fine i dati tornano come nel seed (il test gira su pc e telefono).
 */
import { expect, test, type Page } from "@playwright/test";

const PASS = "Password-di-prova-123";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASS);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.getByRole("button", { name: "Entra" }).click()]);
}

const romeDay = (offset: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date(Date.now() + offset * 86_400_000));

test("il cliente segna il peso di oggi in Progressi, lo corregge e lo toglie", async ({ page }) => {
  await login(page, "giulia@prova.local");
  await page.goto("/cliente/progressi");
  const card = page.locator("[data-daily-weight]");
  await expect(card).toBeVisible();
  await expect(card.locator("[data-weight-summary]")).toContainText("Media ultimi 7 giorni");
  await expect(card.locator("[data-weight-chart]")).toBeVisible();
  const form = card.locator("[data-weight-form]");
  // un valore che non è un peso
  await form.getByLabel("Peso in chili").fill("sessanta");
  await form.locator("[data-weight-save]").click();
  await expect(form.getByRole("alert")).toContainText("Scrivi il peso in chili");
  // oggi
  await form.getByLabel("Peso in chili").fill("64,85");
  await form.locator("[data-weight-save]").click();
  await expect(form.getByRole("status")).toContainText("Salvato: 64,85 kg oggi");
  await expect(card.locator("[data-weight-summary]")).toContainText("64,85 kg · oggi");
  await expect(form.locator("[data-weight-save]")).toHaveText("Aggiorna");
  // correzione dello stesso giorno: resta una sola pesata
  await form.getByLabel("Peso in chili").fill("64.6");
  await form.locator("[data-weight-save]").click();
  await expect(card.locator("[data-weight-summary]")).toContainText("64,6 kg · oggi");
  await card.locator("[data-weight-list] summary").click();
  await expect(card.locator(`[data-weight-row="${romeDay(0)}"]`)).toHaveCount(1);
  await expect(card.locator(`[data-weight-row="${romeDay(0)}"]`)).toContainText("64,6 kg");
  // la tolgo: torna come prima
  await card.locator(`[data-weight-row="${romeDay(0)}"]`).getByRole("button").click();
  await expect(card.locator(`[data-weight-row="${romeDay(0)}"]`)).toHaveCount(0);
  await expect(card.locator("[data-weight-summary]")).not.toContainText("· oggi");
  // il periodo del grafico si cambia
  await card.getByRole("button", { name: "30 giorni" }).click();
  await expect(card.getByRole("button", { name: "30 giorni" })).toHaveAttribute("aria-pressed", "true");
});

test("lo staff vede il peso del cliente in Check e in Panoramica e lo può segnare per un giorno passato", async ({ page }) => {
  await login(page, "titolare@prova.local");
  await page.goto("/staff/clienti");
  await page.waitForLoadState("networkidle");
  await page.locator('a[href^="/staff/clienti/"]', { hasText: "Esempio Giulia" }).filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}/);
  const id = /\/staff\/clienti\/([0-9a-f-]{36})/.exec(page.url())![1];
  await page.goto(`/staff/clienti/${id}`);
  await expect(page.locator("[data-weight-overview]").filter({ visible: true }).first()).toContainText("Media ultimi 7 giorni");
  await page.locator("[data-weight-overview]").filter({ visible: true }).first().getByRole("link", { name: "Grafico e pesate" }).click();
  await page.waitForURL(/\/check/);
  const card = page.locator("[data-daily-weight]");
  await expect(card).toContainText("Lo segna il cliente in Progressi");
  const past = romeDay(-5); // nel seed quel giorno manca
  const form = card.locator("[data-weight-form]");
  await form.getByLabel("Giorno della pesata").fill(past);
  await form.getByLabel("Peso in chili").fill("66");
  await form.locator("[data-weight-save]").click();
  await expect(form.getByRole("status")).toContainText("Salvato: 66 kg");
  await card.locator("[data-weight-list] summary").click();
  await expect(card.locator(`[data-weight-row="${past}"]`)).toContainText("66 kg");
  // niente giorni nel futuro
  await expect(form.getByLabel("Giorno della pesata")).toHaveAttribute("max", romeDay(0));
  await card.locator(`[data-weight-row="${past}"]`).getByRole("button").click();
  await expect(card.locator(`[data-weight-row="${past}"]`)).toHaveCount(0);
});
