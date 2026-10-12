/**
 * Foto dei check: lo staff le carica tutte insieme dalla galleria (ridotte e
 * senza i dati nascosti), il cliente le vede nei Progressi. Chat: una chat
 * aperta esce da "Da rispondere", "Segna da leggere" la rimette.
 */
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const PASS = "Password-di-prova-123";
const FIX = path.join(__dirname, "fixtures");

async function login(page: Page, email: string) {
  page.on("dialog", (d) => void d.accept());
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASS);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.getByRole("button", { name: "Entra" }).click()]);
}

async function giuliaId(page: Page) {
  await page.goto("/staff/clienti?q=Giulia");
  const href = await page.getByRole("link", { name: /Esempio Giulia/ }).filter({ visible: true }).first().getAttribute("href");
  return href!.split("/").pop()!.split("?")[0];
}

test.afterEach(async ({ browser }) => {
  for (const c of browser.contexts()) await c.close().catch(() => undefined);
});

test("foto del check: si caricano dalla galleria ridotte e senza dati nascosti, il cliente le vede nei progressi", async ({ browser }, info) => {
  const errors: string[] = [];
  const staff = await (await browser.newContext(info.project.use)).newPage();
  staff.on("pageerror", (e) => errors.push(e.message));
  await login(staff, "titolare@prova.local");
  const id = await giuliaId(staff);
  await staff.goto(`/staff/clienti/${id}/check`);
  await staff.waitForLoadState("networkidle");
  // il check più recente tra quelli visibili al cliente
  const card = staff.locator("div.rounded-\\[24px\\]").filter({ hasText: "Visibile al cliente" }).filter({ has: staff.locator('input[type=file][aria-label="Scegli le foto del check"]') }).first();
  const grid = card.getByRole("list", { name: /./ });
  const before = await grid.locator("li").count().catch(() => 0);

  // due foto scelte insieme, con un solo tocco
  await card.locator('input[type=file][aria-label="Scegli le foto del check"]').setInputFiles([path.join(FIX, "foto-check.jpg"), path.join(FIX, "foto.jpg")]);
  await expect(card.getByText("2 foto caricate.")).toBeVisible({ timeout: 30_000 });
  await expect(grid.locator("li")).toHaveCount(before + 2);
  const thumb = card.locator("li img").last();
  await thumb.scrollIntoViewIfNeeded();
  await expect.poll(() => thumb.evaluate((img: HTMLImageElement) => (img.complete ? img.naturalWidth : 0))).toBeGreaterThan(0);

  // a tutto schermo, si scorre e si chiude
  await grid.locator("li button").nth(before).click();
  const viewer = staff.getByRole("dialog");
  await expect(viewer.getByText(new RegExp(`${before + 1} di ${before + 2}`))).toBeVisible();
  const full = await viewer.locator("img").evaluate(async (img: HTMLImageElement) => {
    await img.decode().catch(() => undefined);
    return { w: img.naturalWidth, h: img.naturalHeight, src: img.src };
  });
  // la foto da 4000×3000 è ridotta a 2560 di lato lungo, JPEG, senza dati EXIF (GPS, modello del telefono)
  expect(Math.max(full.w, full.h)).toBe(2560);
  const bytes = await (await staff.request.get(full.src)).body();
  expect(bytes.subarray(0, 2).toString("hex")).toBe("ffd8");
  expect(bytes.includes(Buffer.from("Exif"))).toBe(false);
  expect(bytes.includes(Buffer.from("Fotocamera di prova"))).toBe(false);
  expect(bytes.length).toBeLessThan(1_500_000);
  await viewer.getByRole("button", { name: "Foto successiva" }).click();
  await expect(viewer.getByText(new RegExp(`${before + 2} di ${before + 2}`))).toBeVisible();
  await viewer.getByRole("button", { name: "Chiudi" }).click();

  // il cliente le vede nei progressi, con la data del check
  const client = await (await browser.newContext(info.project.use)).newPage();
  client.on("pageerror", (e) => errors.push(e.message));
  await login(client, "giulia@prova.local");
  await client.goto("/cliente/progressi");
  const section = client.getByText("Le foto dei check");
  await expect(section).toBeVisible();
  const clientPhotos = client.locator('ul[aria-label] li img');
  expect(await clientPhotos.count()).toBeGreaterThanOrEqual(before + 2);
  // lo staff ne elimina una (conferma in due tocchi)
  await grid.locator("li button").last().click();
  await viewer.getByRole("button", { name: "Elimina" }).click();
  await viewer.getByRole("button", { name: "Sì, elimina" }).click();
  await expect(viewer).toHaveCount(0);
  await expect(grid.locator("li")).toHaveCount(before + 1);
  expect(errors).toEqual([]);
});

test("dopo il salvataggio di un check si propongono subito le foto", async ({ page }) => {
  await login(page, "titolare@prova.local");
  const id = await giuliaId(page);
  await page.goto(`/staff/clienti/${id}/check/nuovo`);
  await page.waitForLoadState("networkidle");
  await page.locator("#weight_kg").fill("61,5");
  await page.getByRole("button", { name: "Salva check" }).click();
  await expect(page.getByText("Check salvato. Ora puoi aggiungere le foto")).toBeVisible();
  await expect(page.getByRole("button", { name: "Aggiungi le foto del check" })).toBeVisible();
});

test("chat vista: esce da Da rispondere anche senza risposta, Segna da leggere la rimette", async ({ browser }, info) => {
  const tag = `${info.project.name}-${Date.now() % 100000}`;
  const client = await (await browser.newContext(info.project.use)).newPage();
  await login(client, "giulia@prova.local");
  await client.goto("/cliente/messaggi");
  await client.waitForLoadState("networkidle");
  await client.fill("textarea", `Tutto ok oggi ${tag}`);
  await client.getByRole("button", { name: "Invia" }).click();
  await expect(client.getByText(`Tutto ok oggi ${tag}`)).toBeVisible();
  await client.context().close();

  const owner = await (await browser.newContext(info.project.use)).newPage();
  await login(owner, "titolare@prova.local");
  await owner.goto("/staff/messaggi?vista=da-rispondere");
  const row = owner.getByRole("link", { name: /Esempio Giulia/ });
  await expect(row).toContainText(`Tutto ok oggi ${tag}`);
  await row.click();
  await owner.waitForURL(/\/staff\/messaggi\/[0-9a-f-]{36}/);
  await expect(owner.getByRole("button", { name: "Segna da leggere" })).toBeVisible();
  // l'ha visto e non risponde: non è più tra quelle da rispondere
  await owner.goto("/staff/messaggi?vista=da-rispondere");
  await expect(owner.getByRole("link", { name: /Esempio Giulia/ })).toHaveCount(0);
  // ma se vuole ricordarsene la rimette da leggere
  await owner.goto("/staff/messaggi?vista=tutte");
  await owner.getByRole("link", { name: /Esempio Giulia/ }).click();
  await owner.getByRole("button", { name: "Segna da leggere" }).click();
  await owner.waitForURL(/vista=da-rispondere/);
  await expect(owner.getByRole("link", { name: /Esempio Giulia/ })).toContainText(`Tutto ok oggi ${tag}`);
});
