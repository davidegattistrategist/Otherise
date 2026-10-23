/** Apertura dell'app: il logo animato compare subito (prima dei dati) e sparisce quando la pagina è pronta. */
import { expect, test, type Page } from "@playwright/test";

const PASS = "Password-di-prova-123";
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASS);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.getByRole("button", { name: "Entra" }).click()]);
}

for (const [who, home] of [
  ["titolare@prova.local", "/staff"],
  ["giulia@prova.local", "/cliente"],
] as const) {
  test(`apertura (${home}): il logo arriva nei primi byte, poi lascia il posto alla pagina`, async ({ page }) => {
    await login(page, who);
    // la pagina come arriva dal server: il logo sta in cima, prima del contenuto
    const html = await (await page.request.get(home)).text();
    const splash = html.indexOf("data-splash");
    expect(splash).toBeGreaterThan(0);
    expect(splash).toBeLessThan(4000);
    expect(html.indexOf("<main")).toBeGreaterThan(splash);

    // aprendo l'app si arriva alla pagina vera e il logo non resta sopra
    await page.goto("/");
    await page.waitForURL((u) => u.pathname.startsWith(home));
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("[data-splash]")).toHaveCount(0);
  });
}

test("app aperta con il service worker: il logo compare subito dalla pagina di avvio e si arriva alla pagina vera", async ({ page }) => {
  // la pagina di avvio è pubblica e ha il logo
  const html = await (await page.request.get("/apertura")).text();
  expect(html).toContain("data-splash");
  expect(html).toContain("otherise:launch");

  await login(page, "titolare@prova.local");
  await page.waitForLoadState("networkidle");
  await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.active).catch(() => false)).toBe(true);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).some((k) => k.startsWith("otherise-apertura-")))).toBe(true);

  await page.goto("/");
  await page.waitForURL((u) => u.pathname.startsWith("/staff"));
  await expect(page.locator("main")).toBeVisible();
  await page.waitForLoadState("networkidle");
  // arrivati dalla pagina di avvio: lo splash della pagina vera non rifà l'entrata
  expect(await page.evaluate(() => document.documentElement.hasAttribute("data-splash-go"))).toBe(true);
  await expect(page.locator("[data-splash]")).toHaveCount(0);

  // anche ricaricando una pagina interna (o aprendo una notifica): stesso indirizzo, senza "app=1"
  await page.goto("/staff/clienti?q=Giulia");
  await expect(page.getByRole("link", { name: /Esempio Giulia/ }).filter({ visible: true }).first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe("/staff/clienti?q=Giulia");
  expect(await page.evaluate(() => document.documentElement.hasAttribute("data-splash-go"))).toBe(true);
  // con il # nell'indirizzo si arriva alla pagina giusta e il # resta
  await page.goto("/staff#programmi");
  await expect(page.locator("main")).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(new URL(page.url()).pathname + new URL(page.url()).search + new URL(page.url()).hash).toBe("/staff#programmi");
});

test("apertura senza accesso: dal logo si arriva al login", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL(/\/login/);
  await expect(page.locator("input[name=email]")).toBeVisible();
  await expect(page.locator("[data-splash]")).toHaveCount(0);
});
