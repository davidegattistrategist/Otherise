/**
 * App sul telefono: guida "Metti l'app sulla Home" al primo accesso, avvisi
 * che arrivano senza ricaricare, riquadro delle notifiche push, margini.
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


// le pagine aperte dai test precedenti continuerebbero a segnare come letti i messaggi
test.afterEach(async ({ browser }) => {
  for (const c of browser.contexts()) await c.close().catch(() => undefined);
});

test("primo accesso dal telefono: la guida chiede il telefono e accompagna passo passo", async ({ browser }, info) => {
  test.skip(info.project.name !== "telefono", "la guida compare solo sul telefono");
  // telefono "nuovo": nessuna guida già vista
  const ctx = await browser.newContext({ ...info.project.use, storageState: undefined });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "giulia@prova.local");
  const guide = page.getByRole("dialog", { name: "Metti l'app sulla schermata Home" });
  await expect(guide).toBeVisible();
  await expect(guide.getByText("Che telefono hai?")).toBeVisible();
  await guide.getByRole("button", { name: /iPhone/ }).click();
  await expect(guide.getByText("Tocca il pulsante Condividi")).toBeVisible();
  await expect(guide.getByText("Passo 1 di 4")).toBeVisible();
  await guide.getByRole("button", { name: "Fatto, avanti" }).click();
  await expect(guide.getByText("Tocca “Aggiungi alla schermata Home”")).toBeVisible();
  await guide.getByRole("button", { name: "Indietro" }).click();
  await expect(guide.getByText("Passo 1 di 4")).toBeVisible();
  for (let i = 0; i < 3; i++) await guide.getByRole("button", { name: "Fatto, avanti" }).click();
  await expect(guide.getByText("Apri l'app dalla Home")).toBeVisible();
  await guide.getByRole("button", { name: "Ho finito" }).click();
  await expect(guide).toBeHidden();
  // non ricompare
  await page.reload();
  await page.waitForTimeout(1200);
  await expect(guide).toBeHidden();
  // il riquadro delle notifiche push c'è
  await page.goto("/cliente/notifiche");
  await expect(page.getByText("Notifiche su questo dispositivo")).toBeVisible();

  // Android: passi a mano (il browser di prova non offre il pulsante Installa)
  await page.evaluate(() => localStorage.removeItem("otherise:install-guide"));
  await page.goto("/cliente");
  await guide.getByRole("button", { name: /Android/ }).click();
  await expect(guide.getByText("Tocca i tre puntini in alto a destra")).toBeVisible();
  await guide.getByRole("button", { name: "Chiudi" }).click();
  await expect(guide).toBeHidden();
  expect(errors).toEqual([]);
  await ctx.close();
});

test("un messaggio nuovo compare da solo, senza ricaricare la pagina", async ({ browser }, info) => {
  test.setTimeout(120_000);
  const tag = `${info.project.name}-${Date.now() % 100000}`;
  const owner = await (await browser.newContext(info.project.use)).newPage();
  await login(owner, "titolare@prova.local");
  await owner.goto("/staff");
  await owner.waitForLoadState("networkidle");

  const client = await (await browser.newContext(info.project.use)).newPage();
  await login(client, "giulia@prova.local");
  await client.goto("/cliente/messaggi");
  await client.waitForLoadState("networkidle");
  await client.fill("textarea", `Domanda veloce ${tag}`);
  await client.getByRole("button", { name: "Invia" }).click();
  await expect(client.getByText(`Domanda veloce ${tag}`)).toBeVisible({ timeout: 20_000 });
  // il cliente si sposta su un'altra pagina e aspetta
  await client.goto("/cliente/progressi");
  await client.waitForLoadState("networkidle");
  await client.waitForTimeout(2500);

  // il titolare, fermo su Oggi, vede l'avviso entro il controllo successivo
  const banner = owner.getByRole("status").filter({ hasText: "Nuovo messaggio da Giulia Esempio" });
  await expect(banner).toBeVisible({ timeout: 35_000 });
  await banner.getByRole("link").click();
  await owner.waitForURL(/\/staff\/messaggi\//);
  await expect(owner.getByText(`Domanda veloce ${tag}`)).toBeVisible();

  // la risposta arriva al cliente mentre è su un'altra pagina
  await owner.fill("textarea", `Risposta ${tag}`);
  await owner.getByRole("button", { name: "Invia" }).click();
  await expect(client.getByRole("status").filter({ hasText: "Nuovo messaggio" })).toBeVisible({ timeout: 35_000 });
});

test("menu in basso staccato dai bordi e nessuna pagina tagliata", async ({ page }, info) => {
  test.skip(info.project.name !== "telefono", "solo telefono");
  await login(page, "giulia@prova.local");
  for (const p of ["/cliente", "/cliente/programma", "/cliente/progressi", "/cliente/messaggi", "/cliente/profilo", "/cliente/notifiche", "/cliente/checkup"]) {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    const nav = page.getByRole("navigation", { name: "Menu" }).filter({ visible: true });
    const box = (await nav.boundingBox())!;
    const vw = page.viewportSize()!.width;
    const vh = page.viewportSize()!.height;
    expect(box.x, p).toBeGreaterThanOrEqual(12);
    expect(vw - (box.x + box.width), p).toBeGreaterThanOrEqual(12);
    expect(vh - (box.y + box.height), p).toBeGreaterThanOrEqual(10);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), p).toBe(true);
  }
});
