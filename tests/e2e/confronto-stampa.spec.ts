/**
 * Confronto tra due check da stampare o salvare in PDF (per il nutrizionista):
 * composizione, pliche, circonferenze; in stampa si vede solo il foglio.
 */
import { expect, test, type Page } from "@playwright/test";

const PASS = "Password-di-prova-123";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASS);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.getByRole("button", { name: "Entra" }).click()]);
}

test("confronto dei check da stampare: ultimi due di partenza, si cambiano, in stampa solo il foglio", async ({ page }) => {
  await login(page, "titolare@prova.local");
  await page.goto("/staff/clienti");
  await page.waitForLoadState("networkidle");
  await page.locator('a[href^="/staff/clienti/"]', { hasText: "Esempio Giulia" }).filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}/);
  const id = /\/staff\/clienti\/([0-9a-f-]{36})/.exec(page.url())![1];
  await page.goto(`/staff/clienti/${id}/check`);
  await page.locator("[data-open-print-compare]").click();
  await page.waitForURL(/\/check\/confronto/);
  const sheet = page.locator("[data-print-sheet]");
  await expect(sheet).toContainText("Composizione corporea: confronto");
  await expect(sheet).toContainText("Giulia Esempio");
  await expect(sheet.locator("[data-compare-tile='weight']")).toBeVisible();
  await expect(sheet.locator("[data-compare-tile='fatKg']")).toBeVisible();
  await expect(sheet).toContainText("Pliche cutanee");
  await expect(sheet).toContainText("Somma pliche");
  await expect(sheet).toContainText("non è la stessa cosa della “massa muscolare” indicata da una bioimpedenza");
  // altri due check
  const before = await sheet.locator("header").innerText();
  const da = page.locator("select[name=da]");
  const options = await da.locator("option").allTextContents();
  expect(options.length).toBeGreaterThan(1);
  await da.selectOption({ index: 0 });
  await page.getByRole("button", { name: "Confronta" }).click();
  await page.waitForURL(/da=/);
  await expect(sheet.locator("header")).not.toHaveText(before);
  // nota che va sul foglio
  await sheet.getByLabel("Note per chi legge il confronto").fill("Bioimpedenza del 10/10: +4 kg di massa muscolare.");
  // in stampa: comandi e menu spariscono, il foglio resta
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("[data-print-button]")).toBeHidden();
  await expect(sheet).toBeVisible();
  const navVisible = await page.evaluate(() => {
    const el = document.querySelector("[data-bottom-nav], nav");
    return el ? getComputedStyle(el).visibility : "hidden";
  });
  expect(navVisible).toBe("hidden");
  await page.emulateMedia({ media: "screen" });
  await expect(page.locator("[data-print-button]")).toBeVisible();
});
