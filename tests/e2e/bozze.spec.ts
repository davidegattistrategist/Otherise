/**
 * Bozze di risposta dell'assistente AI (con l'AI finta dei test):
 * il cliente fa più domande in chat, lo staff trova una bozza unica per punti,
 * la usa, la corregge e la manda. Il cliente non vede mai le bozze.
 */
import { expect, test, type Page } from "@playwright/test";

const PASS = "Password-di-prova-123";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASS);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.getByRole("button", { name: "Entra" }).click()]);
}


// le pagine aperte dai test precedenti continuerebbero a segnare come letti i messaggi
test.afterEach(async ({ browser }) => {
  for (const c of browser.contexts()) await c.close().catch(() => undefined);
});

test("bozza di risposta in chat: una sola risposta per punti, si usa e si corregge", async ({ browser }, info) => {
  const tag = `${info.project.name}-${Date.now() % 100000}`;
  const client = await (await browser.newContext(info.project.use)).newPage();
  await login(client, "giulia@prova.local");
  await client.goto("/cliente/messaggi");
  await client.fill("textarea", `Posso fare gli swing con il kettlebell da 16? E lo stacco rumeno lo tengo a 40? ${tag}`);
  await client.getByRole("button", { name: "Invia" }).click();
  await expect(client.getByText(`lo tengo a 40? ${tag}`)).toBeVisible({ timeout: 20_000 });

  const owner = await (await browser.newContext(info.project.use)).newPage();
  await login(owner, "titolare@prova.local");
  await owner.goto("/staff/messaggi");
  await owner.getByRole("link", { name: /Esempio Giulia/ }).click();
  await owner.waitForURL(/\/staff\/messaggi\//);
  const clientId = owner.url().split("/").pop()!;

  // la bozza arriva da sola (preparata dopo l'invio del cliente)
  const card = owner.getByLabel("Bozza di risposta");
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("Ti rispondo su tutto");
  await expect(card).toContainText("Ciao Giuly!"); // il soprannome che il titolare usa solo con lei
  await expect(card).not.toContainText("{nome}");

  await card.getByRole("button", { name: "Usa e modifica" }).click();
  await expect(card).toHaveCount(0);
  const box = owner.locator("textarea");
  await expect(box).toHaveValue(/1\. Sì, il kettlebell da 16/);
  await box.press("End");
  await box.pressSequentially(` ${tag}`);
  await owner.getByRole("button", { name: "Invia" }).click();
  // il messaggio nella conversazione (getByText prende anche la casella di testo: si esclude)
  const bubble = (p: Page) => p.getByText(new RegExp(`insieme ${tag}`)).and(p.locator(":not(textarea)")).filter({ visible: true }).first();
  await expect(bubble(owner)).toBeVisible();
  await expect(owner.locator("textarea")).toHaveValue("");

  // dopo l'invio la bozza non torna, e nemmeno il testo inviato nella casella
  await owner.reload();
  await expect(bubble(owner)).toBeVisible();
  await expect(owner.getByLabel("Bozza di risposta")).toHaveCount(0);
  await owner.waitForTimeout(1500);
  await expect(owner.locator("textarea")).toHaveValue("");

  // il cliente riceve la risposta, ma non vede mai bozze
  await expect(client.getByText(new RegExp(`insieme ${tag}`))).toBeVisible({ timeout: 15_000 });
  await expect(client.getByLabel("Bozza di risposta")).toHaveCount(0);
  const api = await client.request.get(`/api/chat/${clientId}`);
  expect(Object.keys(await api.json())).not.toContain("draft");
});

test("su richiesta: 'Scrivo da zero' toglie la bozza, 'Prepara una bozza' la rifà", async ({ browser }, info) => {
  const tag = `${info.project.name}-${Date.now() % 100000}`;
  const client = await (await browser.newContext(info.project.use)).newPage();
  await login(client, "giulia@prova.local");
  await client.goto("/cliente/messaggi");
  await client.fill("textarea", `Fatto anche oggi ${tag}`);
  await client.getByRole("button", { name: "Invia" }).click();
  await expect(client.getByText(`Fatto anche oggi ${tag}`)).toBeVisible({ timeout: 20_000 });

  const owner = await (await browser.newContext(info.project.use)).newPage();
  await login(owner, "titolare@prova.local");
  await owner.goto("/staff/messaggi");
  await owner.getByRole("link", { name: /Esempio Giulia/ }).click();
  await owner.waitForURL(/\/staff\/messaggi\//);
  // non è una domanda: niente bozza automatica, ma si può chiedere
  await expect(owner.getByLabel("Bozza di risposta")).toHaveCount(0);
  await owner.getByRole("button", { name: "Prepara una bozza di risposta" }).click();
  const card = owner.getByLabel("Bozza di risposta");
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.getByRole("button", { name: "Scrivo da zero" }).click();
  await expect(card).toHaveCount(0);
  await owner.locator("textarea").fill(`Brava, avanti così ${tag}`);
  await owner.getByRole("button", { name: "Invia" }).click();
  await expect(owner.getByText(`Brava, avanti così ${tag}`).and(owner.locator(":not(textarea)"))).toBeVisible();

  // la bozza riscritta da zero insegna: lezioni generali in Impostazioni e su Giulia nella sua scheda
  await expect(async () => {
    await owner.goto("/staff/impostazioni");
    await expect(owner.locator("#ai_reply_lessons")).toHaveValue(/festeggia e basta/, { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await owner.goto("/staff/clienti");
  await owner.getByRole("link", { name: /Esempio Giulia/ }).filter({ visible: true }).first().click();
  await owner.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}/);
  await owner.goto(`${owner.url()}/programma`);
  await expect(owner.locator("#ai-reply")).toHaveValue(/Saluta con Ciao/);
});

test("diario con una richiesta: la bozza riempie la risposta", async ({ page }) => {
  await login(page, "titolare@prova.local");
  await page.goto("/staff/clienti");
  await page.getByRole("link", { name: /Esempio Giulia/ }).filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}/);
  const id = page.url().split("/")[5];
  await page.goto(`/staff/clienti/${id}/diario`);
  // .filter visible: mentre la pagina arriva c'è per un attimo anche una copia nascosta
  const card = page.getByLabel("Bozza di risposta").filter({ visible: true }).first();
  await expect(card).toBeVisible();
  await expect(card).toContainText("puoi spostarlo a sabato");
  await card.getByRole("button", { name: "Usa e modifica" }).click();
  await expect(page.locator("textarea[name=coach_reply]").filter({ visible: true }).first()).toHaveValue(/puoi spostarlo a sabato/);
});
