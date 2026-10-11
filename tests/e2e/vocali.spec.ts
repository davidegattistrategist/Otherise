/**
 * Vocali in chat: il cliente registra e manda un vocale, la trascrizione
 * arriva da sola (servizio finto nei test) e si apre con "Visualizza
 * trascrizione"; lo staff la legge e trova la bozza di risposta.
 */
import { expect, test, type Page } from "@playwright/test";

const PASS = "Password-di-prova-123";

// microfono finto del browser di prova, permesso già dato
test.use({ permissions: ["microphone"], launchOptions: { executablePath: process.env.PW_CHROMIUM, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } });

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASS);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.getByRole("button", { name: "Entra" }).click()]);
}

test.afterEach(async ({ browser }) => {
  for (const c of browser.contexts()) await c.close().catch(() => undefined);
});

test("vocale: si registra, si manda, arriva la trascrizione e la bozza di risposta", async ({ browser }, info) => {
  const client = await (await browser.newContext({ ...info.project.use, permissions: ["microphone"] })).newPage();
  const errors: string[] = [];
  client.on("pageerror", (e) => errors.push(e.message));
  await login(client, "giulia@prova.local");
  await client.goto("/cliente/messaggi");
  await client.waitForLoadState("networkidle");
  const before = await client.getByTestId("voice-message").count();

  // con la casella vuota il tasto è il microfono; scrivendo torna "Invia"
  await client.locator("textarea").fill("ciao");
  await expect(client.getByRole("button", { name: "Invia" })).toBeVisible();
  await client.locator("textarea").fill("");
  await client.getByRole("button", { name: "Registra un vocale" }).click();
  await expect(client.getByRole("timer")).toBeVisible();
  // annullare non manda niente
  await client.getByRole("button", { name: "Annulla il vocale" }).click();
  await expect(client.getByRole("timer")).toHaveCount(0);
  await client.getByRole("button", { name: "Registra un vocale" }).click();
  await client.waitForTimeout(2200);
  await client.getByRole("button", { name: "Manda il vocale" }).click();

  const mine = client.getByTestId("voice-message");
  await expect(mine).toHaveCount(before + 1, { timeout: 15_000 });
  const last = mine.last();
  await expect(last.getByRole("button", { name: "Ascolta il vocale" })).toBeVisible();
  // la trascrizione arriva da sola (senza ricaricare)
  await expect(last.getByRole("button", { name: "Visualizza trascrizione" })).toBeVisible({ timeout: 20_000 });
  await last.getByRole("button", { name: "Visualizza trascrizione" }).click();
  await expect(last.getByText("il pulley l'ho sentito da Dio")).toBeVisible();

  // lo staff vede il vocale con la trascrizione e la bozza di risposta
  const owner = await (await browser.newContext(info.project.use)).newPage();
  await login(owner, "titolare@prova.local");
  await owner.goto("/staff/messaggi");
  await owner.getByRole("link", { name: /Esempio Giulia/ }).first().click();
  await owner.waitForURL(/\/staff\/messaggi\//);
  const theirs = owner.getByTestId("voice-message").last();
  await theirs.getByRole("button", { name: "Visualizza trascrizione" }).click();
  await expect(theirs.getByText("Domani posso fare lo stacco")).toBeVisible();
  await expect(owner.getByLabel("Bozza di risposta")).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});
