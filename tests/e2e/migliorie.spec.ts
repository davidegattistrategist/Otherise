/** Funzioni aggiunte dopo la prima versione: pagamenti rapidi, export, progressioni, registrazione per il cliente, AI sui check-up. */
import { expect, test, type Page } from "@playwright/test";

const PASS = "Password-di-prova-123";
async function login(page: Page, email: string) {
  page.on("dialog", (d) => void d.accept());
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASS);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.getByRole("button", { name: "Entra" }).click()]);
}

test("pagamenti: segna pagato in un tocco ed export CSV", async ({ page }) => {
  await login(page, "titolare@prova.local");
  await page.goto("/staff/pagamenti");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Incassi per mese")).toBeVisible();
  const box = page.locator("li", { hasText: /Sara Test|Giulia Esempio/ }).first();
  if (await box.getByRole("button", { name: "Pagato" }).count()) {
    await box.getByRole("button", { name: "Pagato" }).click();
    await expect(page.getByText(/Registrato .*€/).first()).toBeVisible();
  }
  const res = await page.request.get("/api/pagamenti/export?anno=2026");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  const csv = await res.text();
  expect(csv).toContain("Data;Cliente");
  expect(csv).toContain("Totale");
});

test("il collaboratore non può esportare i pagamenti", async ({ page }) => {
  await login(page, "collaboratore@prova.local");
  const res = await page.request.get("/api/pagamenti/export?anno=2026");
  expect(res.status()).toBe(403);
});

test("progressione automatica nell'editor", async ({ page }, info) => {
  test.skip(info.project.name !== "pc", "la griglia completa è per il computer");
  await login(page, "titolare@prova.local");
  await page.goto("/staff/modelli");
  await page.getByRole("button", { name: "Nuovo modello" }).click();
  await page.waitForURL(/\/staff\/programmi\//);
  await page.waitForLoadState("networkidle");
  await page.locator("table").first().waitFor();
  await page.getByRole("button", { name: "Esercizio", exact: true }).first().click();
  await page.getByLabel("Esercizio", { exact: true }).filter({ visible: true }).first().fill("Stacco");
  await page.getByLabel("Stacco, settimana 1").filter({ visible: true }).fill("4x6 80kg");
  await page.locator("table summary[aria-label^='Compila le settimane di Stacco']").click();
  await page.getByRole("button", { name: "+2,5 kg a settimana" }).first().click();
  await expect(page.getByLabel("Stacco, settimana 4").filter({ visible: true })).toHaveValue("4x6 87,5kg");
});

test("lo staff registra l'allenamento per il cliente e vede il riassunto AI", async ({ page }) => {
  await login(page, "titolare@prova.local");
  await page.goto("/staff/clienti");
  await page.locator('a[href^="/staff/clienti/"]', { hasText: "Giulia Esempio" }).filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}$/);
  const base = page.url();
  await page.getByRole("link", { name: "Registra l'allenamento" }).click();
  await page.waitForURL(/\/allenamento\//);
  await page.waitForLoadState("networkidle");
  const check = page.locator('button[aria-label="Segna la serie come fatta"]');
  if (await check.count()) await check.first().click();
  else await page.locator("main input").first().fill("Fatto in sessione");
  await expect(page.getByText(/Salvato alle/)).toBeVisible({ timeout: 10_000 });
  await page.goto(`${base}/checkup`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Prepara il riassunto" }).click();
  await expect(page.getByText("Cosa funziona")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /Usala come risposta/ }).click();
  await expect(page.locator("textarea[name=coach_reply]").first()).toHaveValue(/Grazie per il check-up/);
});

test("il cliente vede record ed esercizi nei progressi", async ({ page }) => {
  await login(page, "giulia@prova.local");
  await page.goto("/cliente/progressi");
  await expect(page.getByText("I tuoi esercizi")).toBeVisible();
  await expect(page.getByText("I tuoi record")).toBeVisible();
});
