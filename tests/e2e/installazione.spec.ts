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

test("primo accesso dal telefono: la guida mostra tutti i passi e poi lascia un promemoria", async ({ browser }, info) => {
  test.skip(info.project.name !== "telefono", "la guida compare solo sul telefono");
  // telefono "nuovo": nessuna guida già vista
  const ctx = await browser.newContext({ ...info.project.use, storageState: undefined });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "giulia@prova.local");
  // qui si prova solo la guida: la frase del giorno ha il suo test
  await page.evaluate(() => localStorage.setItem("otherise:quote-day", "off"));
  const guide = page.getByRole("dialog", { name: "Metti l'app sulla schermata Home" });
  await expect(guide).toBeVisible();
  await expect(guide.getByText("Che telefono hai?")).toBeVisible();
  await guide.getByRole("button", { name: /iPhone/ }).click();
  // un solo elenco con tutti i passi
  await expect(guide.getByText("Ecco come fare")).toBeVisible();
  const steps = guide.getByRole("listitem");
  await expect(steps).toHaveCount(4);
  await expect(steps.nth(0)).toContainText("Tocca il pulsante Condividi");
  await expect(steps.nth(3)).toContainText("Apri l'app dalla Home");
  await guide.getByRole("button", { name: "Ho capito, inizio" }).click();
  await expect(guide).toBeHidden();
  // il promemoria resta in alto con i passi in breve
  const reminder = page.getByRole("region", { name: "Promemoria: metti l'app sulla Home" });
  await expect(reminder).toBeVisible();
  await expect(reminder.getByRole("listitem")).toHaveCount(4);
  const box = (await reminder.boundingBox())!;
  expect(box.y).toBeLessThan(40);
  // si possono rivedere le istruzioni complete
  await reminder.getByRole("button", { name: "Rivedi le istruzioni" }).click();
  await expect(guide.getByText("Ecco come fare")).toBeVisible();
  await guide.getByRole("button", { name: "Ho capito, inizio" }).click();
  await reminder.getByRole("button", { name: "Chiudi il promemoria" }).click();
  await expect(reminder).toBeHidden();
  // non ricompare subito
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
  await expect(guide.getByRole("listitem").nth(0)).toContainText("Tocca i tre puntini in alto a destra");
  await guide.getByRole("button", { name: "L'ho già fatto" }).click();
  await expect(guide).toBeHidden();
  await page.reload();
  await page.waitForTimeout(1200);
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

test("frase del giorno: a tutto schermo la prima volta del giorno, poi resta nella home", async ({ page }) => {
  await login(page, "giulia@prova.local");
  await page.evaluate(() => localStorage.removeItem("otherise:quote-day"));
  await page.goto("/cliente");
  const stage = page.getByRole("dialog", { name: "La frase del giorno" });
  await expect(stage).toBeVisible();
  // in fondo la dedica del giorno con il nome
  await expect(stage.getByText(/Giulia/)).toBeVisible();
  await expect(stage.getByText(/N° \d+/)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await stage.getByRole("button", { name: "Inizia la giornata" }).click();
  await expect(stage).toHaveCount(0);
  // nello stesso giorno non riappare da sola, ma si riapre dalla scheda
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  await expect(stage).toHaveCount(0);
  await page.getByRole("button", { name: "Apri la frase del giorno" }).click();
  await expect(stage).toBeVisible();
});

test("il trainer vede in Oggi la frase che vedono i clienti, senza che si apra da sola", async ({ page }) => {
  await login(page, "titolare@prova.local");
  await page.evaluate(() => localStorage.removeItem("otherise:quote-day"));
  await page.goto("/staff");
  const card = page.getByRole("button", { name: "Apri la frase del giorno" });
  await expect(card).toContainText("La frase di oggi dei tuoi clienti");
  await page.waitForTimeout(1500);
  await expect(page.getByRole("dialog", { name: "La frase del giorno" })).toHaveCount(0);
  await card.click();
  await expect(page.getByRole("dialog", { name: "La frase del giorno" }).getByText("[nome]")).toBeVisible();
});
