/**
 * Chat: il cliente scrive con foto e video, lo staff vede il non letto e risponde.
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


// le pagine aperte dai test precedenti continuerebbero a segnare come letti i messaggi
test.afterEach(async ({ browser }) => {
  for (const c of browser.contexts()) await c.close().catch(() => undefined);
});

test("chat con foto e video tra cliente e titolare", async ({ browser }, info) => {
  const tag = `${info.project.name}-${Date.now() % 100000}`;
  const client = await (await browser.newContext(info.project.use)).newPage();
  const errors: string[] = [];
  client.on("pageerror", (e) => errors.push(e.message));
  await login(client, "giulia@prova.local");
  await client.goto("/cliente/messaggi");
  await client.waitForLoadState("networkidle");
  // un file audio dalla graffetta no: i vocali si registrano con il microfono
  await client.setInputFiles('input[type=file][aria-label="Allega foto o video"]', path.join(FIX, "audio.mp3"));
  await expect(client.getByText("Per i vocali tocca il microfono accanto alla casella del messaggio.")).toBeVisible();
  // testo + foto + video
  await client.fill("textarea", `Ciao, ecco il mio squat ${tag}`);
  // il video comincia a salire subito, prima di toccare Invia (come WhatsApp)
  const early = client.waitForRequest((r) => r.method() === "PUT" && r.url().includes("/object/upload/sign/"));
  await client.setInputFiles('input[type=file][aria-label="Allega foto o video"]', [path.join(FIX, "foto.jpg"), path.join(FIX, "video.mp4")]);
  await early;
  await expect(client.getByTestId("video-size")).toBeVisible();
  await client.getByRole("button", { name: "Invia" }).click();
  await expect(client.getByText(`Ciao, ecco il mio squat ${tag}`)).toBeVisible({ timeout: 20_000 });
  await expect(client.locator('img[alt="Foto allegata"]').last()).toBeVisible();
  await expect(client.locator("video").last()).toBeVisible();
  // si può scaricare il video inviato
  const dl = client.waitForEvent("download");
  await client.getByRole("button", { name: "Scarica il video" }).last().click();
  expect((await dl).suggestedFilename()).toMatch(/\.(mp4|mov|webm)$/);
  const imgOk = await client.locator('img[alt="Foto allegata"]').last().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
  expect(imgOk).toBe(true);

  // il titolare vede il non letto e risponde
  const owner = await (await browser.newContext(info.project.use)).newPage();
  owner.on("pageerror", (e) => errors.push(e.message));
  await login(owner, "titolare@prova.local");
  await owner.goto("/staff/messaggi");
  const row = owner.getByRole("link", { name: /Esempio Giulia/ });
  await expect(row).toContainText(`squat ${tag}`);
  await row.click();
  await owner.waitForURL(/\/staff\/messaggi\//);
  await owner.waitForLoadState("networkidle");
  await expect(owner.getByText(`Ciao, ecco il mio squat ${tag}`)).toBeVisible();
  await owner.fill("textarea", `Perfetto, scendi un po' di più ${tag}`);
  await owner.getByRole("button", { name: "Invia" }).click();
  await expect(owner.getByText(`Perfetto, scendi un po' di più ${tag}`)).toBeVisible();

  // il cliente riceve la risposta senza ricaricare
  await expect(client.getByText(`Perfetto, scendi un po' di più ${tag}`)).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});

test("il collaboratore non vede le chat dei clienti non suoi", async ({ page }) => {
  await login(page, "collaboratore@prova.local");
  await page.goto("/staff/messaggi");
  await expect(page.getByRole("link", { name: /Prova Luca/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Esempio Giulia/ })).toHaveCount(0);
});

test("letta la chat, il pallino su Messaggi sparisce subito (anche senza rispondere)", async ({ browser }, info) => {
  const client = await (await browser.newContext(info.project.use)).newPage();
  await login(client, "giulia@prova.local");
  await client.goto("/cliente/messaggi");
  await client.fill("textarea", `pallino ${info.project.name} ${Date.now() % 100000}`);
  await client.getByRole("button", { name: "Invia" }).click();
  await client.waitForTimeout(1500);
  await client.context().close();
  const owner = await (await browser.newContext(info.project.use)).newPage();
  await login(owner, "titolare@prova.local");
  const nav = () => owner.getByRole("link", { name: /^Messaggi/ }).filter({ visible: true }).first();
  await nav().click();
  await owner.waitForURL(/\/staff\/messaggi$/);
  await owner.getByRole("link", { name: /Esempio Giulia/ }).filter({ visible: true }).first().click();
  await owner.waitForURL(/\/staff\/messaggi\/.+/);
  await owner.waitForLoadState("networkidle");
  await owner.getByRole("link", { name: /^Oggi/ }).filter({ visible: true }).first().click();
  await owner.waitForURL(/\/staff$/);
  await expect(nav()).toHaveText(/^Messaggi$/, { timeout: 5_000 });
});
