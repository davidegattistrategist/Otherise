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
  // nell'elenco dei check le foto non si vedono (solo quante sono): si apre il check più recente visibile al cliente
  await expect(staff.locator('ul[aria-label="Foto del check"]')).toHaveCount(0);
  const link = staff.locator("a[href*='/check/']").filter({ hasText: "Visibile al cliente" }).first();
  const checkDate = (await link.locator("span.text-lg").innerText()).trim();
  await link.click();
  await staff.waitForURL(/\/check\/[0-9a-f-]{36}$/);
  await staff.waitForLoadState("networkidle");
  const card = staff.locator("main");
  const grid = card.getByRole("list", { name: "Foto del check" });
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
  // la foto da 4000×3000 è ridotta a 1600 di lato lungo, JPEG, senza dati EXIF (GPS, modello del telefono)
  expect(Math.max(full.w, full.h)).toBe(1600);
  const bytes = await (await staff.request.get(full.src)).body();
  expect(bytes.subarray(0, 2).toString("hex")).toBe("ffd8");
  expect(bytes.includes(Buffer.from("Exif"))).toBe(false);
  expect(bytes.includes(Buffer.from("Fotocamera di prova"))).toBe(false);
  expect(bytes.length).toBeLessThan(600_000);
  await viewer.getByRole("button", { name: "Foto successiva" }).click();
  await expect(viewer.getByText(new RegExp(`${before + 2} di ${before + 2}`))).toBeVisible();
  await viewer.getByRole("button", { name: "Chiudi" }).click();

  // il cliente le vede nei progressi, con la data del check
  const client = await (await browser.newContext(info.project.use)).newPage();
  client.on("pageerror", (e) => errors.push(e.message));
  await login(client, "giulia@prova.local");
  await client.goto("/cliente/progressi");
  await expect(client.getByText("Le foto dei check")).toBeVisible();
  // le foto non si caricano scorrendo: si aprono toccando il check
  await expect(client.locator('ul[aria-label="Check con le foto"] img')).toHaveCount(0);
  const album = client.getByRole("button", { name: new RegExp(`(^|\\D)${before + 2} foto`) }).first();
  await expect(album).toBeVisible();
  await album.click();
  const clientViewer = client.getByRole("dialog");
  await expect(clientViewer.getByText(new RegExp(`1 di ${before + 2}`))).toBeVisible();
  await expect.poll(() => clientViewer.locator("img").evaluate((img: HTMLImageElement) => (img.complete ? img.naturalWidth : 0))).toBeGreaterThan(0);
  await expect(clientViewer.getByRole("button", { name: "Elimina" })).toHaveCount(0);
  await clientViewer.getByRole("button", { name: "Chiudi" }).click();
  expect(checkDate.length).toBeGreaterThan(0);
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
  await page.waitForURL(/\/check\/[0-9a-f-]{36}/);
  await expect(page.getByText("Check salvato. Ora puoi aggiungere le foto")).toBeVisible();
  await expect(page.getByRole("button", { name: "Aggiungi le foto" })).toBeVisible();
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
  // inviato davvero (la casella si svuota solo quando il server l'ha salvato)
  await expect(client.locator("textarea")).toHaveValue("");
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

test("la ricerca dei clienti filtra mentre scrivi, senza premere Invio (Messaggi, Clienti)", async ({ page }) => {
  await login(page, "titolare@prova.local");
  await page.goto("/staff/messaggi");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("link", { name: /Prova Luca/ })).toBeVisible();
  await page.getByPlaceholder("Cerca un cliente").pressSequentially("giul", { delay: 40 });
  await expect(page.getByRole("link", { name: /Prova Luca/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Esempio Giulia/ })).toBeVisible();
  await expect(page).toHaveURL(/q=giul/);
  // svuotando torna tutto
  await page.getByPlaceholder("Cerca un cliente").fill("");
  await expect(page.getByRole("link", { name: /Prova Luca/ })).toBeVisible();
  await page.goto("/staff/clienti");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("Cerca per nome o email").pressSequentially("luca", { delay: 40 });
  await expect(page.locator('a[href^="/staff/clienti/"]', { hasText: "Esempio Giulia" }).filter({ visible: true })).toHaveCount(0);
  await expect(page.locator('a[href^="/staff/clienti/"]', { hasText: "Prova Luca" }).filter({ visible: true }).first()).toBeVisible();
});

test("confronto foto: affiancate, frecce sotto ognuna, zoom e spostamento, si scarica come lo vedi", async ({ browser }, info) => {
  test.skip(info.project.name !== "pc", "stessi dati: basta un progetto");
  const staff = await (await browser.newContext({ ...info.project.use, acceptDownloads: true })).newPage();
  await login(staff, "titolare@prova.local");
  const id = await giuliaId(staff);
  // due check con le foto
  await staff.goto(`/staff/clienti/${id}/check`);
  await staff.waitForLoadState("networkidle");
  const links = staff.locator("a[href*='/check/']").filter({ hasText: /\d/ });
  const hrefs = (await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")))).filter((h): h is string => Boolean(h && /check\/[0-9a-f-]{36}$/.test(h)));
  for (const h of hrefs.slice(0, 2)) {
    await staff.goto(h);
    await staff.waitForLoadState("networkidle");
    const main = staff.locator("main");
    if ((await main.getByRole("list", { name: "Foto del check" }).locator("li").count().catch(() => 0)) >= 2) continue;
    await main.locator('input[type=file][aria-label="Scegli le foto del check"]').setInputFiles([path.join(FIX, "foto-check.jpg"), path.join(FIX, "foto.jpg")]);
    await expect(main.getByText("2 foto caricate.")).toBeVisible({ timeout: 30_000 });
  }
  await staff.goto(`/staff/clienti/${id}/check`);
  await staff.getByRole("button", { name: "Confronta le foto" }).click();
  const dialog = staff.getByRole("dialog", { name: "Confronto delle foto" });
  const frames = dialog.locator("[data-compare-frame]");
  await expect(frames).toHaveCount(2);
  // attaccate: tra le due solo la riga bianca di 2 px, stessa misura
  const [a, b] = [await frames.nth(0).boundingBox(), await frames.nth(1).boundingBox()];
  expect(Math.round(b!.x - (a!.x + a!.width))).toBe(2);
  expect(Math.round(a!.height)).toBe(Math.round(b!.height));
  // frecce sotto ogni foto
  await expect(dialog.getByRole("button", { name: "Foto dopo a sinistra" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Foto dopo a destra" })).toBeVisible();
  await dialog.getByRole("button", { name: "Foto dopo a destra" }).click();
  await expect(dialog.getByText("2 di 2")).toBeVisible();
  // zoom con la rotellina e spostamento: il riquadro non cambia, compare Ripristina
  const img = frames.nth(0).locator("img");
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  const w0 = (await img.boundingBox())!.width;
  await frames.nth(0).hover();
  await staff.mouse.wheel(0, -400);
  await expect.poll(async () => (await img.boundingBox())!.width).toBeGreaterThan(w0 * 1.3);
  const box = (await frames.nth(0).boundingBox())!;
  await staff.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await staff.mouse.down();
  await staff.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20, { steps: 5 });
  await staff.mouse.up();
  expect((await frames.nth(0).boundingBox())!.width).toBeCloseTo(box.width, 0);
  await expect(dialog.getByRole("button", { name: "Ripristina" })).toHaveCount(1);
  // si scarica: un'unica immagine con le due foto affiancate
  const [download] = await Promise.all([staff.waitForEvent("download"), dialog.getByRole("button", { name: "Scarica il confronto" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^confronto-.+\.jpg$/);
  const file = await download.path();
  const { readFileSync } = await import("node:fs");
  const buf = readFileSync(file);
  // JPEG: larghezza circa il doppio dell'altezza delle proporzioni del riquadro, altezza 1600
  let i = 2;
  let size: [number, number] | null = null;
  while (i < buf.length) {
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc2) { size = [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)]; break; }
    i += 2 + len;
  }
  expect(size![1]).toBe(1600);
  expect(size![0]).toBeCloseTo(Math.round((box.width / box.height) * 1600) * 2 + 2 * Math.round(1600 / box.height), -1);
  await dialog.getByRole("button", { name: "Ripristina" }).click();
  await expect(dialog.getByRole("button", { name: "Ripristina" })).toHaveCount(0);
});
