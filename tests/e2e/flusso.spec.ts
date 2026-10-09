import { expect, test, type Browser } from "@playwright/test";

const PASS = "Password-di-prova-123";

async function login(browser: Browser, email: string, mobile = false) {
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASS);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);
  return page;
}

test("il cliente registra un allenamento", async ({ browser }) => {
  const c = await login(browser, "giulia@prova.local", true);
  await c.click("text=Inizia l'allenamento");
  await c.waitForURL(/\/cliente\/sessione\//);
  await c.locator('input[aria-label$="serie 1, chili"]').first().fill("52,5");
  await c.locator('input[aria-label$="serie 1, ripetizioni"]').first().fill("10");
  await c.locator('button[aria-label="Segna la serie come fatta"]').nth(1).click();
  await expect(c.getByText(/Salvato alle/)).toBeVisible({ timeout: 10_000 });
  await c.click("text=Ho finito");
  await expect(c.getByText("Allenamento registrato")).toBeVisible();
});

test("il collaboratore non vede i clienti degli altri né i pagamenti", async ({ browser }) => {
  const p = await login(browser, "collaboratore@prova.local");
  await p.goto("/staff/clienti");
  await expect(p.getByText("Luca Prova")).toBeVisible();
  await expect(p.getByText("Giulia Esempio")).toHaveCount(0);
  await p.goto("/staff/pagamenti");
  await expect(p).toHaveURL(/\/staff$/);
});

test("il titolare registra pagamento e nota di sessione", async ({ browser }) => {
  const o = await login(browser, "titolare@prova.local");
  await o.goto("/staff/clienti");
  await o.click("text=Giulia Esempio");
  await o.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}$/);
  const base = o.url();
  await o.goto(`${base}/pagamenti`);
  await o.click("text=Registra il pagamento");
  await expect(o.getByText(/Pagamento di .* registrato/)).toBeVisible();
  await o.goto(`${base}/sessioni`);
  await o.fill("textarea[name=notes]", "Nota di prova");
  await o.click("text=Salva la sessione");
  await expect(o.getByText("Sessione salvata.")).toBeVisible();
});
