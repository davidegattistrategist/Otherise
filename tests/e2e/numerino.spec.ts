/**
 * Numerino rosso sull'icona dell'app: stesso numero del pallino su Messaggi
 * (staff: chat a cui rispondere; cliente: messaggi non letti), si azzera
 * quando si è letto tutto. Il browser dei test non ha l'icona sulla Home:
 * si registra quello che l'app chiede al telefono.
 */
import { expect, test, type Page } from "@playwright/test";

const PASS = "Password-di-prova-123";

async function login(page: Page, email: string) {
  await page.addInitScript(() => {
    const w = window as unknown as { __badges: Array<number | null> };
    w.__badges = [];
    Object.defineProperty(navigator, "setAppBadge", { configurable: true, value: (n: number) => { w.__badges.push(n); return Promise.resolve(); } });
    Object.defineProperty(navigator, "clearAppBadge", { configurable: true, value: () => { w.__badges.push(0); return Promise.resolve(); } });
  });
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASS);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.getByRole("button", { name: "Entra" }).click()]);
}

const lastBadge = (page: Page) => page.evaluate(() => (window as unknown as { __badges: number[] }).__badges.at(-1) ?? null);

test("numerino sull'icona: il cliente vede i messaggi da leggere, poi si azzera", async ({ browser }, info) => {
  test.skip(info.project.name !== "pc", "basta una volta: scrive in chat");
  const tag = `${Date.now() % 100000}`;
  // lo staff scrive a Giulia
  const staff = await (await browser.newContext(info.project.use)).newPage();
  await login(staff, "titolare@prova.local");
  await staff.goto("/staff/clienti");
  await staff.waitForLoadState("networkidle");
  await staff.locator('a[href^="/staff/clienti/"]', { hasText: "Esempio Giulia" }).filter({ visible: true }).first().click();
  await staff.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}/);
  const id = /\/staff\/clienti\/([0-9a-f-]{36})/.exec(staff.url())![1];
  await staff.goto(`/staff/messaggi/${id}`);
  const box = staff.locator(`#chat-${id}`);
  await expect(box).toBeVisible();
  // la casella è pronta quando risponde (dopo il caricamento della pagina)
  await expect(async () => {
    await box.fill(`Ciao Giulia, come va? ${tag}`);
    await expect(staff.getByRole("button", { name: "Invia" })).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await staff.getByRole("button", { name: "Invia" }).click();
  await expect(staff.getByText(`come va? ${tag}`).first()).toBeVisible();
  // per lo staff il numerino è il numero di chat a cui rispondere, come il pallino su Messaggi
  const staffCount = await staff.evaluate(async () => (await (await fetch("/api/badge")).json()).count as number);
  const live = await staff.evaluate(async () => (await (await fetch("/api/live")).json()).chats as number);
  expect(staffCount).toBe(live);

  // Giulia apre l'app: numerino = messaggi non letti, uguale a quello che dice il server
  const client = await (await browser.newContext(info.project.use)).newPage();
  await login(client, "giulia@prova.local");
  await client.goto("/cliente");
  const server = await client.evaluate(async () => (await (await fetch("/api/badge")).json()).count as number);
  expect(server).toBeGreaterThan(0);
  await expect.poll(() => lastBadge(client), { timeout: 15_000 }).toBe(server);
  // legge la chat: il numerino si azzera
  await client.goto("/cliente/messaggi");
  await expect(client.getByText(`come va? ${tag}`).first()).toBeVisible();
  await client.goto("/cliente/progressi");
  await expect.poll(() => lastBadge(client), { timeout: 15_000 }).toBe(0);
  expect(await client.evaluate(async () => (await (await fetch("/api/badge")).json()).count as number)).toBe(0);
});

test("numerino sull'icona: senza accesso il server non dà numeri", async ({ request }) => {
  const r = await request.get("/api/badge", { maxRedirects: 0 });
  expect(r.ok() && /"count":\s*[1-9]/.test(await r.text())).toBe(false);
});
