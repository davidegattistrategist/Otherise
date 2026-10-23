/**
 * Regola dell'app: quello che scrivi si salva davvero da solo, mentre scrivi,
 * senza pulsante "Salva" (Dati del cliente, check già salvato, impostazioni…),
 * anche se esci subito dalla pagina.
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

async function clientId(page: Page, name: string) {
  await page.goto("/staff/clienti");
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: new RegExp(name) }).filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}/);
  return /\/staff\/clienti\/([0-9a-f-]{36})/.exec(page.url())![1];
}

test("Dati del cliente: niente Salva, si salva mentre scrivi e anche uscendo subito dalla pagina", async ({ page }, info) => {
  await login(page, "titolare@prova.local");
  const id = await clientId(page, "Prova Luca");
  await page.goto(`/staff/clienti/${id}/profilo`);
  await page.waitForLoadState("networkidle");
  const form = page.locator("[data-live-form=dati-cliente]");
  await expect(form.getByRole("button", { name: /^Salva/ })).toHaveCount(0);
  const goals = `Obiettivo scritto e salvato da solo (${info.project.name} ${Date.now()})`;
  await form.locator("textarea[name=goals]").fill(goals);
  await expect(form.locator("[data-live-status=saved]")).toBeVisible({ timeout: 15000 });
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.locator("textarea[name=goals]")).toHaveValue(goals);
  await expect(page.locator("[data-draft-top]")).toHaveCount(0);
  // esco subito dopo aver scritto: si salva lo stesso
  const phone = `333 ${String(Date.now()).slice(-7)}`;
  await page.locator("input[name=phone]").fill(phone);
  await page.getByRole("link", { name: "Panoramica" }).filter({ visible: true }).first().click();
  await page.waitForURL(new RegExp(`/staff/clienti/${id}$`));
  await page.goto(`/staff/clienti/${id}/profilo`);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("input[name=phone]")).toHaveValue(phone);
  await expect(page.locator("[data-draft-top]")).toHaveCount(0);
});

test("check già salvato: le correzioni si salvano da sole", async ({ page }, info) => {
  await login(page, "titolare@prova.local");
  const id = await clientId(page, "Esempio Giulia");
  await page.goto(`/staff/clienti/${id}/check`);
  await page.waitForLoadState("networkidle");
  const href = await page.locator(`a[href^="/staff/clienti/${id}/check/"]`).filter({ hasText: "Pliche" }).first().getAttribute("href");
  const openTests = async () => {
    const det = page.locator("details", { has: page.locator("#tests_text") });
    if (!(await det.evaluate((d) => (d as HTMLDetailsElement).open))) await det.locator("summary").click();
  };
  await page.goto(href!);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: /^Salva check/ })).toHaveCount(0);
  const tests = `Test corretto (${info.project.name} ${Date.now()}): 3 km in 14:10`;
  await openTests();
  await page.locator("#tests_text").fill(tests);
  await expect(page.locator("[data-live-status=saved]")).toBeVisible({ timeout: 15000 });
  await page.reload();
  await page.waitForLoadState("networkidle");
  await openTests();
  await expect(page.locator("#tests_text")).toHaveValue(tests);
});
