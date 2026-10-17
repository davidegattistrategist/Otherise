/**
 * Niente esce dallo schermo o dalle card, niente testo tagliato o in colonna
 * troppo stretta, caselle che mostrano tutto (regole in scripts/layout-rules.mjs).
 * Le stesse regole, su tutte le pagine e con testi lunghi apposta, le controlla
 * scripts/layout-audit.mjs (vedi CLAUDE.md).
 */
import { expect, test, type Page } from "@playwright/test";
import { auditPage } from "../../scripts/layout-rules.mjs";

const PASS = "Password-di-prova-123";

async function login(page: Page, email: string) {
  page.on("dialog", (d) => void d.accept());
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASS);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.getByRole("button", { name: "Entra" }).click()]);
}

type Issue = { type: string; what: string; where: string; px: number };

async function check(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const issues: Issue[] = await page.evaluate(auditPage);
  // anche con i riquadri apribili aperti
  await page.evaluate(() => document.querySelectorAll("details").forEach((d) => { if (!d.closest("[data-day-group]")) d.open = true; }));
  await page.waitForTimeout(100);
  issues.push(...((await page.evaluate(auditPage)) as Issue[]));
  expect(issues.map((i) => `${i.type} ${i.px}px: ${i.what} ‹${i.where}›`), path).toEqual([]);
}

test("impaginazione: pagine dello staff", async ({ page }) => {
  test.setTimeout(150_000);
  await login(page, "titolare@prova.local");
  await page.goto("/staff/clienti");
  await page.getByRole("link", { name: /Esempio Giulia/ }).filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}/);
  const id = /\/staff\/clienti\/([0-9a-f-]{36})/.exec(page.url())![1];
  for (const p of ["/staff", "/staff/clienti", `/staff/clienti/${id}`, `/staff/clienti/${id}/programma`, `/staff/clienti/${id}/allenamenti`, `/staff/clienti/${id}/check`, `/staff/clienti/${id}/diario`, `/staff/clienti/${id}/pagamenti`, `/staff/clienti/${id}/note`, `/staff/clienti/${id}/profilo`, `/staff/messaggi`, `/staff/messaggi/${id}`, "/staff/pagamenti", "/staff/impostazioni", "/staff/eserciziario"]) {
    await check(page, p);
  }
  // l'editor del programma in corso
  await page.goto(`/staff/clienti/${id}/programma`);
  const editor = page.locator('a[href^="/staff/programmi/"]').filter({ visible: true }).first();
  await check(page, (await editor.getAttribute("href"))!);
});

test("impaginazione: pagine del cliente", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page, "giulia@prova.local");
  for (const p of ["/cliente", "/cliente/programma", "/cliente/progressi", "/cliente/messaggi", "/cliente/diario", "/cliente/allenamento-libero", "/cliente/profilo"]) {
    await check(page, p);
  }
});
